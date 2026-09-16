---
title: "The Nginx return Directive: Answering Requests Without Waking the Backend"
date: 2024-05-20 15:01:40
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1651340550839-3b295d930048?w=1600&q=80&fm=jpg
lang: en
---

The site is going down for maintenance and you don't want users slamming into a wall of backend errors; an old link moved domains and you don't want to write a single line of redirect code; an intranet liveness probe needs a fixed response and you don't want to spin up a service for it. What these have in common: no backend involvement whatsoever — Nginx itself can hand out the response. The directive for the job is `return`, part of the built-in rewrite module (`ngx_http_rewrite_module`) — give it a status code, a redirect address, even a response body, and the request terminates right there.

This post is organized around hands-on configuration: the lab environment first, then three sets of copy-paste configs with real output (maintenance page, redirect, text response), plus a server-wide on/off switch, and finally two easily-tripped pitfalls clarified by real tests. All output comes from actual runs on nginx/1.31.5; unverified claims are explicitly flagged.

## Lab Environment

Every example is reproducible in a container:

- nginx/1.31.5 (docker image `nginx:alpine`);
- configs mounted at `/etc/nginx/conf.d/`, with `docker exec <container> nginx -s reload` after each round of changes;
- verification with `curl` inside the container, no port mapping.

## Directive Semantics: Short-Circuit in One Sentence

The mental model of `return` in one sentence: **once execution reaches it, the request ends immediately — later location matching, proxying, and file lookups never happen**. It takes three kinds of arguments: a status code alone (`return 503;`), a status code plus a redirect address (`return 301 https://...`), or a status code plus a response body (`return 200 "ok";`). Placed in a server block it applies site-wide; placed in a location block it only governs the matched requests.

As for when it takes effect: a return inside a location answers during the content phase, while a return in the server block intercepts the request in the earlier rewrite phase — in practice you rarely need to care which phase; if a location has a return, Nginx naturally ends the request at the right moment. What's really worth remembering is the server-level short-circuit behavior described below.

## Example 1: A Maintenance Page — 503 with Retry-After

Pointing the whole site at a 503 during downtime is return's most classic use:

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    return 503;
  }
}
```

Verified: any path returns 503, and the request never reaches any upstream:

![Figure 1](/images/csdn/figures/nginx-return-http-csdn139065651-1.png)

Reading the figure: the status line is `503 Service Temporarily Unavailable` and the body is Nginx's built-in English error page (Content-Length measured at only 197 bytes) — fine for internal liveness probes, far too perfunctory for real users.

A bare 503 isn't dignified enough — users have no idea when to come back. Use `add_header` to attach a `Retry-After` header:

```nginx
location / {
  add_header Retry-After "3600" always;
  return 503;
}
```

The `always` here is not decoration. Verified: remove it and the **Retry-After header does not appear** in the 503 response — `add_header` by default only applies to successful responses like 200 and 301; for 4xx/5xx you must add `always` for the header to be sent. This is the single most common failure point of the return + add_header combination.

## Example 2: Old Links Move House — 301 Redirect

An old address permanently relocates to a new domain, one directive for the redirect:

```nginx
location /redirect {
  return 301 https://www.example.com;
}
```

Verified: the response headers carry `Location`, which the browser follows:

![Figure 2](/images/csdn/figures/nginx-return-http-csdn139065651-2.png)

Choosing between 301 and 302: use 301 for a permanent address change — browsers and search engines transfer ranking weight to the new address; use 302 for temporary jumps (a campaign page, say) so search engines don't index the temporary address as permanent. If the redirect target is an API call, also watch for the old problem of 301/302 downgrading POST to GET — in scenarios that require the request method to be preserved, use 307 (temporary) or 308 (permanent); the client resends with the original method.

## Example 3: Returning Text Directly — Health Check Territory

An intranet liveness probe wants a fixed answer, skipping even static files:

```nginx
location /ok {
  return 200 "ok\n";
}

location /text {
  default_type text/plain;
  return 200 "hello $request_uri\n";
}
```

Verified difference in behavior between the two locations:

![Figure 3](/images/csdn/figures/nginx-return-http-csdn139065651-3.png)

Reading the figure: `/ok` returns 200 with a body, but the Content-Type is `application/octet-stream` — **text returned by return is treated as a binary stream by default, and browsers will offer a download instead of displaying it**. That doesn't matter for a health check, but if you want the text to display properly (or to compose the body with variables like `$request_uri`), configure one line of `default_type text/plain` as in `/text`.

## Server-level return: The Site-Wide Switch

A return written in a server block takes higher priority — **requests get intercepted before location matching even begins**. Change Example 1's config to server level while leaving a normally-answering location in place as a control:

```nginx
server {
  listen 80;
  server_name localhost;

  return 301 https://new.example.com;

  location /ok {
    return 200 "never reached\n";
  }
}
```

Requesting `/ok`, verified:

![Figure 4](/images/csdn/figures/nginx-return-http-csdn139065651-4.png)

The location with its explicit `return 200` never gets a chance to run; every request is taken over by the server-level 301. This behavior doubles as a site-wide decommission switch — remember to delete it before launch, or you'll debug locations all day to no effect.

## A Comparison: Duplicate returns

Two returns in the same location — intuition says "the later one overrides the earlier," but reality is the opposite:

```nginx
# Wrong: the second return never takes effect
location /dup {
  return 200 "first\n";
  return 200 "second\n";
}

# Right: keep exactly one return per location
location /dup {
  return 200 "first\n";
}
```

Verified: the response is `first`:

![Figure 5](/images/csdn/figures/nginx-return-http-csdn139065651-5.png)

The danger is that `nginx -s reload` reports nothing — the second return is silently ignored. One rule: **one return per block; split branching needs into multiple locations**. return's short-circuit semantics mean execution ends the moment it runs; "running two returns" is not a thing.

## Points to Watch

- **Position decides scope**. In a server block it's a site-wide switch (all locations become moot); in a location block it governs only that path. When unsure, first decide whether you're intercepting "the whole site" or "one path."
- **Multiple returns in one block: only the first takes effect**, and reload reports no error (verified above). In config review, seeing multiple returns in one block is an outright fail.
- **Plain-text responses need `default_type`**. The default `application/octet-stream` shows up in browsers as a file download (verified above) — fine for liveness probes, mandatory for text meant for human eyes.
- **Custom headers on error codes require `always` on `add_header`**. You configure a 503 maintenance page with `Retry-After` and the header goes missing — nine times out of ten this is why (verified above).
- **Give users an exit on the 503 page**. The bare status-code page is Nginx's built-in English error page; for a serious maintenance mode configure `error_page 503 /maintenance.html` — at minimum tell users "when we'll be back."
- **444 is Nginx's private status code**. `return 444;` sends no response and closes the connection outright (verified: curl ends with "Empty reply from server", exit code 52) — cheaper than 403 against pure scan/probe traffic; on the browser side it just looks like the connection was cut, so don't use it on paths normal users touch.

## Summary

Back to the three opening scenarios: the maintenance page is `return 503` with `Retry-After`; the moved link is `return 301` with the new address; the probe response is `return 200 "ok"` with `default_type`. All three share the same mental model — **return is Nginx's way of "answering directly": execution terminates the moment it's reached, and no upstream is ever woken**. After writing the config, walk the status codes and response headers once with curl — especially the two details that fail silently, `always` and `default_type` — and you'll have caught every pitfall before launch.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
