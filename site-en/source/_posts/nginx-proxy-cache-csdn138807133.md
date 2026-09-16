---
title: "Nginx proxy_cache in Practice: What HIT, MISS, and BYPASS Actually Mean"
date: 2024-05-13 16:03:41
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1617839625591-e5a789593135?w=1600&q=80&fm=jpg
updated: 2026-09-14
lang: en
---

When an API is slow, the first instinct is to scale up the backend — but many responses never change at all: list pages, config items, public detail views. Nine out of ten requests return identical content. Nginx's proxy_cache module caches these upstream responses on local disk and serves cache hits directly, so the backend handles one fewer request for every one saved.

**Bottom line up front: proxy_cache stands up with three directives — `proxy_cache_path` carves out a disk area (allowed only at the http level), `proxy_cache` turns it on inside a location, and `proxy_cache_valid` sets how long to cache. What actually determines behavior is how you write the cache key and which requests you let bypass.** This post walks a two-container experiment through MISS, HIT, and BYPASS one by one, then shows two live-fire examples of wrong configurations. All output shown is real run output; conclusions I haven't run myself are explicitly flagged.

## The Lab Environment

Reproducibility comes first, so here are the conditions:

- nginx/1.31.5 (docker image `nginx:alpine`), two containers on one custom network: `cache-backend` as the upstream, `cache-proxy` as the caching proxy;
- the proxy container mounts its config at `/etc/nginx/conf.d/default.conf`; after each round of changes, `nginx -s reload`, verified from inside the container with `curl`;
- the backend's homepage content is `BACKEND-V1`, used to tell "fresh content fetched from the origin" apart from "stale content from the cache."

## The Core Mechanism: Standing Up the Cache in Three Steps

Three steps are all you need to remember:

```nginx
proxy_cache_path /data/nginx/cache levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=7d use_temp_path=off;

location / {
    proxy_cache my_cache;        # enable it, pointing at the shared memory zone defined above
    proxy_cache_valid 200 302 10m;
}
```

The key parameters inside `proxy_cache_path`: `keys_zone` defines the shared memory zone for cache keys (required; `my_cache:10m` means zone name plus 10MB); `max_size` caps disk usage; `inactive` defines how long an entry can go unaccessed before being evicted. `proxy_cache_valid` sets TTL by status code — give error pages a short TTL, so a backend hiccup doesn't get a 404 magnified into ten minutes of caching.

A few defaults are worth memorizing. If `proxy_cache_key` is omitted, the default is `$scheme$proxy_host$request_uri` — the key contains only the URI, no user-identifying elements; example five shows the price of that shortcut. Without `inactive`, the default is 10 minutes — shorter than most services' TTL, so cold content gets evicted early. Official docs put `keys_zone` capacity at roughly 8000 cache keys per megabyte, so a 10MB zone covers six-figure entry counts; the real bulk is response bodies on disk, managed jointly by `max_size` and `inactive`. `levels=1:2` gives the cache directory a two-level hash of subdirectories, spreading hundreds of thousands of cache files out so a single directory isn't crushed under the file count.

## Example 1: A Minimal Working Config, and What MISS and HIT Mean

First, the full configuration, running:

```nginx
proxy_cache_path /data/nginx/cache levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=7d use_temp_path=off;

server {
    listen 80;

    location / {
        proxy_pass http://cache-backend;
        proxy_cache my_cache;
        proxy_cache_key "$request_method$request_uri$http_cookie";
        proxy_cache_valid 200 302 10m;
        proxy_cache_valid 404 1m;
        proxy_cache_bypass $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
        proxy_no_cache $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
        add_header X-Proxy-Cache $upstream_cache_status;
    }
}
```

Send the same request twice, and `$upstream_cache_status` writes the hit status straight into the response header:

![Figure 1](/images/csdn/figures/nginx-proxy-cache-csdn138807133-1.png)

The first time: MISS — no entry for this key in the cache, so Nginx goes to the origin and writes the response to disk. The second time: HIT — the backend is never touched, the response comes straight from local cache. When troubleshooting caching, check this header first; hit or not is immediately obvious.

## Example 2: bypass and no_cache Come in Pairs — Drop One Half and the Semantics Break

"Don't cache requests that carry a `Pragma: no-cache` header" is done with the `proxy_cache_bypass` / `proxy_no_cache` pair: the former governs "don't read," the latter governs "don't write." Keep the two variable lists identical and the semantics become a complete "bypass this request":

```nginx
proxy_cache_bypass $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
proxy_no_cache    $cookie_no_cache $arg_no_cache $http_pragma $http_authorization;
```

A live test verifying that the "don't write" half actually works — a BYPASS response must not enter the cache, so the ordinary request immediately after it must be a MISS:

![Figure 2](/images/csdn/figures/nginx-proxy-cache-csdn138807133-2.png)

How to read the three-shot sequence: the request with the `Pragma` header gets BYPASS (cache read skipped); the ordinary request right after gets MISS — if the BYPASS response had been written to disk, this would be a HIT, so the MISS is precisely the proof it wasn't written; only the next request after that is a HIT. Write `bypass` without `no_cache` and the response lands in the cache anyway, and the next user reads content that "was never supposed to be cached."

## Example 3: Personal Pages Always Go to the Origin

Dynamic content and personal data should never enter the cache. Give `/profile/` its own location; the condition `proxy_cache_bypass 1` is always true, which is equivalent to always going to the origin:

```nginx
location /profile/ {
    proxy_pass http://cache-backend;
    proxy_cache my_cache;
    proxy_cache_bypass 1;
    add_header X-Proxy-Cache $upstream_cache_status;
}
```

> Note: the original article omitted `proxy_cache my_cache;` in this block. Without it, `proxy_cache_bypass` has no cache to attach to (the directive depends on an already-enabled cache zone); the directive was restored according to its documented semantics during the rewrite.

In the live test, the always-true condition and the parameter-based bypass each get a shot:

![Figure 3](/images/csdn/figures/nginx-proxy-cache-csdn138807133-3.png)

`/profile/` returns 200 with BYPASS — every request goes to the origin; `?no_cache=1` matches `$arg_no_cache` and bypasses the same way. Every other path on the site keeps the Example 1 caching logic — this is the standard "cache globally, exempt locally" pattern.

## Wrong-Way Comparison: Two Real Faceplants

**Mistake one: `proxy_cache_path` inside a server block.** This directive is only allowed at the http level; put it at the wrong level and Nginx refuses to start:

![Figure 4](/images/csdn/figures/nginx-proxy-cache-csdn138807133-4.png)

The error points at the exact line: `"proxy_cache_path" directive is not allowed here`. A related trap at the same level is the directory itself: the path declared in `proxy_cache_path` is not created automatically, and if the directory doesn't exist, nginx startup fails with `mkdir() "/data/nginx/cache" failed` — run `mkdir -p` in your deploy script before starting.

**Mistake two: a cache key with no user-identifying element.** Simplify the key to `$request_method$request_uri`, and have two "users" request the same address one after the other:

![Figure 5](/images/csdn/figures/nginx-proxy-cache-csdn138807133-5.png)

alice's first request being MISS is normal, but bob's first request is a straight HIT — he's reading alice's cache entry. With nothing user-distinguishing in the key, everyone's requests map onto the same cache key. This is especially fatal for logged-in endpoints, and it's exactly why `$http_cookie` must stay in the key in the opening configuration.

## Caveats

- **`proxy_cache_path` goes at the http level, and create the directory in advance**. Wrong level, no startup (verified live); missing directory, no startup either (`mkdir() failed`, verified live); and the directory must be writable by the Nginx workers.
- **The cache key must contain something that distinguishes users**. Put cookies, tokens, and the like into `proxy_cache_key`, or users share each other's cache (verified live); conversely, don't sprinkle cookies into purely public content — the more scattered the keys, the lower the hit rate.
- **bypass and no_cache appear as a pair, with identical lists**. bypass without no_cache: sensitive responses still hit the disk. no_cache without bypass: requests still land on stale cache.
- **Backend cache headers take priority over `proxy_cache_valid`**. When the upstream response carries `Cache-Control`, `Expires`, or `X-Accel-Expires`, Nginx defers to it; `proxy_cache_valid` only applies when the response carries no cache headers at all (from the official docs; the backend in this post's experiment sent no cache headers, so this wasn't exercised separately).
- **Responses carrying `Set-Cookie` don't enter the cache**. Nginx by default sanitizes upstream response headers: when a response carries `Set-Cookie`, nothing is written to the cache, to prevent session cross-contamination. If a public page's hit rate is mysteriously low, capture packets first and check whether the backend is sending that header (official-docs behavior; this post's backend was a purely static responder, not exercised separately).
- **When the backend wobbles, let stale cache catch the fall**. `proxy_cache_use_stale error timeout http_500 http_502 http_503 http_504;` serves already-expired cache instead of an error page during upstream failure, and adding `proxy_cache_background_update on;` refreshes in the background while stale content is served (from the official docs; this post's experiment didn't cover failure scenarios, not exercised live).
- **Cache won't fully clear? Think of the cache loader**. About a minute after Nginx starts, the cache loader process loads cache metadata already on disk back into the memory zone. This experiment tripped over exactly that: after restarting the service thinking the cache was cleared, `/` returned a straight HIT — the old entry had been loaded back from disk by the loader. For a truly clean slate, stop the service, empty the cache directory, then start again.
- **Give 404 a short TTL**. `proxy_cache_valid 404 1m;` stops error pages from hammering the backend repeatedly for a minute, without nailing the failure into the cache for good.
- **During debugging, mount `add_header X-Proxy-Cache $upstream_cache_status;`** — HIT/MISS/BYPASS becomes readable at a glance, far faster than digging through logs.

## Wrap-Up

Back to the opening scenario: for that ninety percent of requests whose responses never change, the three directives `proxy_cache_path` + `proxy_cache` + `proxy_cache_valid` block them right at the Nginx layer. The three statuses map to three paths: MISS goes to the origin and writes to disk, HIT eats straight from the cache, BYPASS takes the detour — spell out "who detours" with bypass/no_cache, spell out "who shares which cache entry" with the cache key, and once those two are written correctly, proxy_cache stops producing incidents.

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
