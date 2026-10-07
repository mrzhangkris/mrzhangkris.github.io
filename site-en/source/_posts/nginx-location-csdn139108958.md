---
title: "Nginx location Matching Rules, Verified in Practice: Priority, Regex Order, and Nesting"
date: 2024-05-22 09:37:37
lang: en
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

Which location block handles an incoming request is decided by Nginx's location matching rules. There are many conflicting accounts of these rules online — "longest match wins," "regex first," and other versions circulate, some of them simply wrong. This post tests all four matching modes one by one in an nginx/1.31.5 container and delivers verified priority conclusions: how exact matches hit, what `^~` actually "skips," whether regex is order-based or longest-based, and how nested locations take effect.

## Experiment Environment

- nginx/1.31.5 (nginx:alpine container)
- Verification method: put `return 200 "marker"` in each location, curl different URIs, and read the returned marker — the winning block is obvious at a glance. This is also the most practical trick for debugging location problems.

## The Four Matching Modes

| Syntax | Name | Semantics |
|------|------|------|
| `location = /uri` | Exact match | Hits only when the URI is fully equal |
| `location ^~ /uri` | Prefix match (skips regex) | When the prefix hits and is the longest of its kind, regex is not consulted |
| `location ~ regex` | Regex match (case-sensitive) | Takes the first hit in configuration order |
| `location ~* regex` | Regex match (case-insensitive) | Same as above |
| `location /uri` | Plain prefix match | Remember the longest one, keep checking regex |

## Matching Order (Verified Conclusions)

The complete flow Nginx follows for one request:

1. **Check exact matches `=` first**: a hit is used immediately and the search ends;
2. **Then check all prefix matches** (plain prefixes and `^~` compared together) and remember the **longest** one:
   - If the longest prefix carries `^~`: adopt it directly, **skipping regex**;
   - Otherwise stash it and continue to the next step;
3. **Check regexes in configuration order** (`~` and `~*`): the first hit is adopted immediately;
4. **If no regex hits**: fall back to the longest prefix stashed in step 2.

One-line mnemonic: **exact > longest prefix (`^~` settles it immediately) > regex (order first) > plain prefix as the fallback**.

> Note: the source text wrote the order as "exact → prefix → regex → ^~", placing `^~` after regex — that is wrong. `^~` is a modifier on prefix matching whose whole purpose is to intercept **before** regex. The order above is the result of cross-checking the experiments against the official documentation (the location section of ngx_http_core_module).

## Experiment 1: All Four Modes Compete Together

Configuration (excerpt):

```nginx
server {
  listen 80;
  location = /exact        { return 200 "A"; }  # exact match
  location ^~ /static      { return 200 "B"; }  # ^~ prefix
  location ~ \.php$        { return 200 "D"; }  # regex (case-sensitive)
  location ~* \.(gif|jpg)$ { return 200 "C"; }  # regex (case-insensitive)
  location /prefix         { return 200 "E"; }  # plain prefix
  location /               { return 200 "F"; }  # fallback
}
```

The verified hit for each URI:

![All four location modes tested side by side](/images/csdn/figures/nginx-location-csdn139108958-1.png)

Three noteworthy hits:

- **`/static/a.php` hits `^~ /static`, not `~ \.php$`** — this is the hard evidence of `^~` "skipping regex": in the prefix stage it is the longest match (/static beats /), it carries `^~`, so it settles immediately and the regexes never get a turn;
- **`/exact/aaa` does not hit `= /exact`** and falls to the default block — an exact match requires full URI equality; one extra path segment already disqualifies it;
- **`/b.JPG` hits the case-insensitive `~*` regex** — the uppercase extension is caught by `~*`; with `~` it would slip through.

## Experiment 2: Regex Is "Order First," Not "Longest First"

A widely circulated claim says "regex picks the longest match." The experiment proves that wrong:

```nginx
location ~ /a     { return 200 "A"; }    # the short one written first
location ~ /a/b/c { return 200 "ABC"; }  # the long one written after
```

The request `/a/b/c` matches both regexes — which one wins?

![Regex order-first verified](/images/csdn/figures/nginx-location-csdn139108958-2.png)

The result: the shorter pattern written first, `~ /a`, wins. **Regex takes the first hit in configuration-file order, regardless of length** — the order of regex blocks is their priority. To make a more specific rule take precedence, write it earlier.

## Experiment 3: Nested location

A location block can nest further location blocks, applying special handling to specific sub-paths under a given path:

```nginx
location /images {
  root /var/www/images;
  location ~ \.jpg$ {
    # applies only to jpg files under /images
  }
}
```

Verified: a fallback return in the parent /images block, with `~ \.jpg$` nested inside:

![Nested location verified](/images/csdn/figures/nginx-location-csdn139108958-3.png)

`/images/pic.jpg` hits the inner regex while `/images/pic.png` stays with the outer block — nested locations only subdivide further within the parent block's path scope and inherit the parent's context (root, proxy settings, etc.). It is the standard idiom for "directory-level config plus file-type-level exceptions."

## A Wrong Pattern: Ordering Regexes by "Intuition"

A classic incident scene — writing the broad regex before the specific one:

```nginx
location ~ ^/api/     { proxy_pass http://backend; }   # broad, written first
location ~ ^/api/v2/  { proxy_pass http://new_backend; } # specific, written after
```

By the verified order-first rule, every `/api/v2/...` request is captured by the first block and the second never takes effect — no configuration error, normal logs, just routing silently wrong. The fix: specific first, broad after; or simply use prefix matching (`location /api/v2/` + `location /api/`) — prefixes are matched by longest and are immune to write order.

## Comprehensive Example

A typical configuration combining several modes:

```nginx
server {
  listen 80;
  server_name example.com;

  location = / {
    return 200 'Exact match for root';
  }

  location / {
    return 200 'Default root prefix match';
  }

  location ^~ /static {
    return 200 'Static files';
  }

  location ~ \.php$ {
    fastcgi_pass 127.0.0.1:9000;
    include fastcgi_params;
  }

  location /images {
    root /data;

    location ~ \.jpg$ {
      return 200 'JPEG image';
    }
  }
}
```

Checked line by line against the verified rules:

- `location = /` matches only the exact root-path request, and a hit ends the search immediately — the best choice for high-frequency fixed paths (home page, health checks);
- `location ^~ /static` handles the static directory entirely by prefix, so even a URI ending in .php never falls into FastCGI;
- `location ~ \.php$` matches every request ending in .php and routes it to FastCGI;
- `location /images` and its nested `~ \.jpg$` handle the directory and the JPEG files inside it respectively;
- `location /` is the fallback that catches everything left over.

## Caveats

- An exact match `=` ends the search immediately on a hit — not even regexes are consulted. For high-frequency fixed paths (like `/` or `/healthz`) it offers the best performance.
- Regex takes the first hit in configuration-file order, unrelated to "longest match" (Experiment 2); the order of regex blocks is their priority. Within the same class of rules: specific first, broad after.
- The value of `^~` is skipping regex: when you know a prefix should be handled entirely as a prefix (like a static directory), add it to avoid being unexpectedly intercepted by a later regex (the /static/a.php case in Experiment 1).
- Plain prefix matches compete on **longest** (/prefix/sub hits /prefix, not /) — different from the regex order rule; don't mix them up.
- Nested locations only subdivide further within the parent location's path scope and inherit the parent block's context.
- When unsure which location actually wins, don't guess — use this post's verification method: temporarily drop `return 200 "marker"` into the candidate locations, curl, and read the result; or check the access log. Run `nginx -t` after every configuration change before reloading.

For location matching, memorizing articles helps less than testing once with the marker method: `=` settles immediately, `^~` intercepts regex, regex goes by order, prefixes go by longest — four sentences covering the full behavior. After every adjustment of location order, sweep the key URIs with return markers, and silent routing failures have nowhere to hide.

> This article was reconstructed from the author's CSDN blog posts from 2020–2024, originally published on CSDN.
