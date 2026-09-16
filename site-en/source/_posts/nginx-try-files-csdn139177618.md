---
title: "Nginx try_files: One Directive to Govern Static File Lookup and Fallback"
date: 2024-05-26 09:00:00
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1575318634028-6a0cfcb60c59?w=1600&q=80&fm=jpg
lang: en
---

Deploy a Vue or React frontend to Nginx: the home page loads fine, clicking through to `/orders/42` works too — then the user hits F5 on that page and a 404 lands right in their face. The reason: `/orders/42` is a virtual path created by the frontend router; it doesn't exist on disk, and with no file to find Nginx can only return 404.

**The conclusion up front: a single `try_files` directive solves this class of problem — the earlier arguments check for files in order, and the last argument decides "what to do when everything misses."** This post is organized as a how-to: first the lab environment, then three sets of copy-ready configs with real output (SPA fallback, strict 404, forwarding to a backend), and finally two incident experiments that map out the directive's boundaries. All output is from actual runs; anything not tested is flagged explicitly.

![Figure](/images/csdn/figures/nginx-try-files-csdn139177618.png)

## Lab Environment

Reproducibility comes first, so here are the conditions:

- nginx/1.31.5 (docker image `nginx:alpine`);
- site directory mounted at `/usr/share/nginx/html`, config mounted at `/etc/nginx/conf.d/`;
- host port 8080 mapped to container port 80; all `curl` commands below run from the host;
- after each config change, `docker exec <container> nginx -s reload` before verifying; read the error log with `docker logs` (inside the container `/var/log/nginx/error.log` is a symlink to stderr, and `tail`-ing it will hang).

Minimal site layout:

```
/usr/share/nginx/html/
├── index.html      → <h1>INDEX</h1>
├── about.html      → <h1>ABOUT</h1>
└── report/
    └── 2024.html   → <h1>REPORT 2024</h1>
```

## Directive Semantics: Check Arguments First, Fallback Last

The entire semantics of `try_files` compress into one sentence: **the earlier arguments do "look in order," the last argument handles "what to do when nothing is found."**

```nginx
try_files arg1 arg2 ... last-arg;
```

The earlier arguments perform **existence checks** and stop at the first hit: `$uri` checks files, `$uri/` checks directories, and a named location (`@backend`) jumps to it. **The last argument is the fallback** — it is never checked, and only runs when everything before it missed. It can be a URI (triggering an internal redirect) or a bare status code (`=404`).

Internal redirection is the key to understanding every pitfall here: when the fallback is a URI, the request goes through location matching again from the top — as if Nginx re-issued the request on the user's behalf.

## Example 1: SPA Fallback, and Watch Out for the 403 Pit

One line of config fixes the F5 404 — this is `try_files` at its most common:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Tested results for four kinds of requests (including one unexpected status code):

![Figure 1: SPA fallback, tested](/images/csdn/figures/nginx-try-files-csdn139177618-1.png)

Reading the image: `about.html` exists, so `$uri` hits immediately; `nope.html` doesn't exist, both check arguments miss, and the request falls back to `/index.html` — the user receives the home page content and a 200. Once the frontend has the entry page, its JS reads the URL and renders the route, so the user notices nothing. That's the fix for the F5 404 problem.

**But this config hides a 403 pit.** Request `/report/` (the directory exists but contains no index.html):

![Figure 2: directory 403, tested](/images/csdn/figures/nginx-try-files-csdn139177618-2.png)

The reason: `$uri/` checks "does the directory exist" — `report/` exists, so it hits. Then the `index` directive looks for `index.html` inside it, finds none, autoindex is off by default, and you get 403. **Hitting a directory doesn't mean content can be served** — if you don't want this behavior, just drop `$uri/` from the arguments.

## Example 2: `=404` Fallback with a Custom error_page

A pure static content site shouldn't let dead links return 200 (search engines will index a pile of duplicate home pages). Make genuinely-missing pages honestly 404, and throw in a custom error page while you're at it:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    error_page 404 /404.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
```

Tested results below — note what happens to the status code and the response body separately:

![Figure 3: =404 fallback, tested](/images/csdn/figures/nginx-try-files-csdn139177618-3.png)

The status code stays 404 while `error_page` swaps the response body for the custom page — the two mechanisms each do their own job without conflict. This is also a good place to compare the semantics of the two fallback styles: `=404` terminates the request outright and saves an internal redirect, while a URI fallback must re-run location matching. The former is cheaper; the latter more flexible.

## Example 3: Forwarding to a Backend — Don't Lose the Query String

In pseudo-static setups, unfound requests get handed to PHP or a gateway; the `?$query_string` at the end of the fallback URI is not decoration:

```nginx
location / {
    try_files $uri $uri/ /index.php?$query_string;
}

location = /index.php {
    return 200 "qs=$args uri=$uri\n";
}
```

Tested results for requests carrying parameters:

![Figure 4: query_string passthrough A/B, tested](/images/csdn/figures/nginx-try-files-csdn139177618-4.png)

Figure 4 is an A/B experiment: in the first half, the fallback spells out `?$query_string` and the backend receives `qs=id=42&type=report`; in the second half, the fallback is changed to just `/index.php`, the same request goes out, and `qs=` comes back empty. Omit `$query_string` and the backend never sees the business parameters — the single most frequent try_files incident. One more detail in the second half's output: after the fallback, `uri=/index.php` — **once the internal redirect happens, `$uri` has become the fallback target itself**; the user's original path `/missing?id=42&type=report` can only be recovered from `$request_uri`.

## Incident Experiment: Fallback Target Points at Itself, 500 Served

Point the fallback URI at a file that doesn't exist, and that still matches the same location:

```nginx
location / {
    try_files $uri /loop.html;   # loop.html does not exist
}
```

Request any nonexistent path and the test returns 500 immediately, with the error log pinpointing the loop:

![Figure 5: infinite-loop 500, tested](/images/csdn/figures/nginx-try-files-csdn139177618-5.png)

The chain: `/nope.html` doesn't exist → fall back to `/loop.html` → the internal redirect re-matches locations → `/loop.html` still doesn't exist → fall back to itself again → loop until the 10-iteration cap, where Nginx forces a 500. **The fallback target must be ultimately reachable.** After writing the config, curl one path that definitely doesn't exist — that's basic self-testing.

## A Pairing of Two Wrong Ways

**Wrong one: fallback URI missing the query_string**

```nginx
# Wrong: business parameters get lost
try_files $uri $uri/ /index.php;

# Right:
try_files $uri $uri/ /index.php?$query_string;
```

**Wrong two: fallback semantics applied to a middle argument**

```nginx
# Wrong: /fallback.php is treated as a disk file check; on failure no error is raised, it just moves to the next argument
try_files $uri /fallback.php =404;

# Right: a URI fallback can only come last
try_files $uri =404;
```

One rule: check arguments first, the fallback action last, and write exactly one fallback.

## Notes and Caveats

- **Order is priority**. Arguments are checked in written order, stopping at the first hit; put a broad `$uri/` in front and later arguments will never get a turn.
- **`$uri/` is double-edged**. It returns 403 when it hits a directory with no index file inside (and autoindex off). Pure API sites usually don't need it.
- **The performance bill**. Each argument costs one disk stat; piling up seven or eight candidates means seven or eight extra syscalls per request. Three to five is the norm; beyond that, fix the directory layout first.
- **Internal redirects cap at 10** (tested in the section above: 500 + cycle log).
- **`alias` combinations easily build wrong paths**. alias's path replacement rules differ from root's, and try_files arguments under alias can assemble unexpected physical paths — this item comes from the official docs and community consensus, not tested here; when using alias, curl-verify the path each argument actually checks.

## Wrapping Up

Back to the F5 scenario at the top: `try_files $uri $uri/ /index.html;` — one line fixes the SPA refresh 404. The mental model for this directive in one sentence: **the first N-1 arguments "look in order," the Nth argument is "what to do when nothing is found."** All three incident pits (directory 403, lost query_string, self-referencing fallback loop) stem from misunderstanding the fallback argument's semantics. After writing the config, curl one path that definitely doesn't exist and one path carrying parameters, and you'll intercept every one of them before launch.
