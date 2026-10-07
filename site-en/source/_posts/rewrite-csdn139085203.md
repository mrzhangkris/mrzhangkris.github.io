---
title: "Getting Started with the Nginx Rewrite Module: Rewrites, Redirects, and Loop Prevention"
date: 2024-05-21 10:09:19
updated: 2026-09-14
categories: [Tech, Ops]
tags: [Ops]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1630233313373-a03df7d139c9?w=1600&q=80&fm=jpg
lang: en
---

Jumping old links smoothly to new addresses, routing requests by language — on Nginx these needs all belong to the rewrite module: it modifies the request URI through regex matching and condition checks, and the rewritten result can either go through an internal redirect (invisible to the user) or send the browser off to another URL (returning 301/302). A rewrite rule is only one line long, but the property that "the rewritten URI runs through the matching flow again" regularly walks newcomers into dead loops. This post runs three typical scenarios end to end in an nginx:alpine container, including one real loop failure and its fix.

## Lab Environment

- nginx:alpine (nginx/1.31.5), configuration written to /etc/nginx/conf.d/default.conf
- Under the static directory /usr/share/nginx/html, files for new-path, zh/docs/intro, and en/docs/intro are pre-placed as rewrite targets
- curl for verification, all done against 127.0.0.1 inside the container

## First Understand When rewrite Executes

One sentence: **a rewrite in the server block executes exactly once per request; a rewrite in a location block, after changing the URI, triggers an internal redirect and re-runs location matching, where the rule may hit again**. This determines the shape of two classic failure modes, verified against each other in example 3 below: a self-rewriting rule in the server block runs once and lands on 404, while a self-rewriting rule in a location block actually loops (until nginx cuts it off with 500).

Memorize the four rewrite flags first:

| Flag | Behavior | Typical use |
|------|------|---------|
| (none) | After rewriting, continue processing subsequent rewrite directives | Rule chains |
| `last` | Stop rewrite processing, re-match locations with the new URI | Hand off to another location after rewriting inside one |
| `break` | Stop rewrite processing, stay in the current location and serve the request directly | Find files / proxy in place after rewriting |
| `redirect` / `permanent` | Return 302 / 301 to the browser, ending internal processing | External redirects |

## Example 1: 301 an Old Path to a New Path

Permanently redirect `example.com/old-path` to `example.com/new-path`:

```nginx
server {
  listen 80;
  server_name example.com;
  root /usr/share/nginx/html;

  rewrite ^/old-path$ /new-path permanent;

  location / {
    try_files $uri $uri/ =404;
  }
}
```

- `rewrite ^/old-path$ /new-path permanent;` anchors the regex to the entire URI and returns 301 on a hit; the only difference between `permanent` and `redirect` is the status code (301 permanent / 302 temporary) — search engines and browsers update indexes and caches according to a 301.
- `try_files $uri $uri/ =404;` — once the redirect target lands, it looks for the actual file first and returns 404 if there is none.

![Figure 1](/images/csdn/figures/rewrite-csdn139085203-1.png)

Verified: the response headers carried `301` and `Location: http://127.0.0.1/new-path`, and following the redirect returned the target file's content.

## Example 2: Rewriting by Request Header — Language Directory Dispatch

When a Chinese-speaking user requests `/docs/...`, land it in the `zh` directory automatically; every other language defaults to `en`:

```nginx
server {
    listen 80;
    server_name example.com;
    root /usr/share/nginx/html;

    set $lang en;
    if ($http_accept_language ~* "^zh") {
        set $lang zh;
    }

    rewrite ^/docs/(.*)$ /$lang/docs/$1 break;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

- `set $lang en;` sets the default language; `if ($http_accept_language ~* "^zh")` inspects the request header, and values starting with zh such as `zh-CN` or `zh-TW` all match (`~*` is case-insensitive).
- `rewrite ^/docs/(.*)$ /$lang/docs/$1 break;` rewrites paths under `/docs/` into the language directory, with `$1` preserving the latter half of the original path; `break` stops the rewrite in the current location, which then finds files in place.

![Figure 2](/images/csdn/figures/rewrite-csdn139085203-2.png)

Verified: the same URI `/docs/intro` — a request carrying `Accept-Language: zh-CN` got the zh directory's content, and a request without the header got the en directory's content — the rewrite happens entirely server-side, and the URL stays transparent to the user.

## Example 3: Loop Prevention — Make the Rewrite Target Stop Matching the Source Regex

When the rewrite target can hit the rewrite condition again, the rule loops on itself. First, the crash scene — a rule inside a location that keeps making the path longer:

```nginx
location / {
    rewrite ^/old/(.*)$ /old/x$1 last;
    try_files $uri $uri/ =404;
}
```

`/old/a` is rewritten to `/old/xa`, which still matches `^/old/`, triggering another internal redirect... until nginx's ceiling of 10 internal redirects is exceeded:

![Figure 3](/images/csdn/figures/rewrite-csdn139085203-3.png)

The error log pins it down precisely: `rewrite or internal redirection cycle while processing "/old/xxxxxxxxxxxa"`. The fix is to make the **target stop matching the source regex** — change the target prefix to `new`:

```nginx
rewrite ^/old/(.*)$ /new/$1 last;
```

Verified: after the fix, the same URI returned 200 directly.

If you genuinely need conditional rewriting in the server block (a pattern common in older configs), close the loop with a flag variable plus `break`:

```nginx
server {
    listen 80;
    server_name example.com;
    root /usr/share/nginx/html;

    set $done 0;
    if ($uri ~ ^/old-path$) {
        set $done 1;
    }
    if ($done) {
        rewrite ^ /new-path break;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

- `set $done 0;` initializes the flag; a hit on the old path sets it to 1, and only then does the rewrite run.
- In `rewrite ^ /new-path break;`, `break` ends subsequent rewrite processing and holds the request in its current phase, keeping the new URI from entering another round of checks.

Verified: `/old-path` returned 200 with new-path's content; the rule ran exactly once, no loop.

## Wrong-Way Comparison

The same self-rewriting rule produces completely different failure shapes depending on where it sits:

| Style | Verified result | Why |
|------|---------|------|
| Self-rewrite in the **server block** (no flag) | `404`, no loop | A server-block rewrite runs once per request; after rewriting it picks a location and looks for files, and finding none yields 404 |
| Self-rewrite in a **location block** (last) | `500` + cycle log | A rewrite inside a location triggers an internal redirect, re-enters the location, the rule hits again until the ceiling is exceeded |
| `if ($done) { rewrite ... }` without break | Possibly multiple rewrite rounds | Without break, subsequent rewrite directives keep processing; complex rule chains bury loop hazards |

Troubleshooting mantra: once you have put a rewrite rule inside a location, ask one question first — "will the new URI still hit this regex?"

## Caveats

- **Pick the right redirect type**: use `permanent` (301) for domain migrations and permanent path changes; use `redirect` (302) for temporary maintenance and canary jumps. Misusing 302 keeps search engines from ever refreshing their indexes.
- **Use if sparingly**: the if directive's execution semantics carry many restrictions (the official Wiki has a dedicated page, "If is Evil"), and stuffing complex logic into if makes configs hard to read and hard to debug; whatever regex capture groups or the map module can solve, do not solve with if.
- **Regex cost**: every request runs the request through rewrite regexes — the more rules and the more complex the expressions, the higher the overhead; on hot paths prefer exact matches (`location =`) or front-routed prefix matches.
- **Test before shipping**: rewrite changes where traffic flows; verify status codes and Location headers with curl -i, grep error.log to confirm no cycle, then go to production.

The rewrite module does exactly three things: change the URI, issue redirects, and keep itself from looping. Remember the execution model — "the server block runs once, a location block re-enters" — and pick the right one of the four flags for the job; follow the verified configs in this post for the three scenarios of 301 migration, language dispatch, and conditional rewriting, and you won't crash — and if you do, you'll at least know which side of the 404/500 line you're standing on.

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
