---
title: "Replacing Content Before It's Returned: Nginx sub_filter"
date: 2024-05-28 09:23:07
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1483058712412-4245e9b90334?w=1600&q=80&fm=jpg
lang: en
---

The backend code is inconvenient to change, but a certain domain or a certain sensitive word in the response simply must be swapped out — this kind of job is exactly what Nginx's sub module (`ngx_http_sub_module`) is for: replacing designated strings in the content before the response goes back to the client. In reverse-proxy scenarios — domain migration, link rewriting, sensitive-word filtering — not one line of backend code gets touched. But the three high-frequency faceplants — "only the first occurrence got replaced," "it doesn't work on JSON," "it dies once compression is on" — are all planted by configuration defaults, worth testing through once to see clearly.

This post is organized around hands-on configuration: it first lays out the lab environment, then tests the three default behaviors in order — replacement count, content types, compression. All output shown is from nginx/1.31.5 live runs (the official image compiles in the sub module by default; check with `nginx -V`).

## What It Can Do

- **Dynamically modify response content**: replace specific strings in the response — sensitive words, stale resource addresses — with the backend service left completely untouched.
- **Link rewriting**: uniformly swap old URL strings appearing in the response (such as `http://old.example.com`) for the new address, smoothing the migration period.
- **Inject shared fragments**: use a high-frequency marker as the anchor — for example, replace `</body>` with `<script src="/stats.js"></script></body>` — to attach an analytics script to every response site-wide, with zero template changes.

Note that it performs **literal string replacement**, not regex matching. Complex scenarios needing regex replacement generally require a third-party module (such as substitutions4nginx's `subs_filter`) or handling at the application layer.

The typical combo when migrating domains behind a reverse proxy: first `sub_filter` swaps the old domain for the new one in outbound responses, then a 301 redirects inbound requests for the old domain as well — outbound content and inbound traffic closed up in one pass. Rules scale as needed; 1.9.4+ supports multiple rules at the same level, and the common pairing is "one rule for links in HTML, one for resource addresses in API JSON," with `sub_filter_types` fencing in each rule's scope separately.

## The Lab Environment

A single container simulates the full chain: port 8081 plays the "upstream backend" (a static directory holding a `page.html` containing two occurrences of `old.example.com` and a `data.json` containing one, with gzip on), and port 80 reverse-proxies it with sub_filter attached. The client is curl.

## Configuration Example

```nginx
server {
  listen 80;

  location / {
    proxy_pass http://127.0.0.1:8081;
    sub_filter "old.example.com" "new.example.com";
    sub_filter_once off;
    sub_filter_types application/json;
  }
}
```

Three directives, each minding one thing:

- `sub_filter 'old_string' 'new_string';` defines a replacement rule, swapping `old_string` for `new_string` in the response.
- `sub_filter_once off;` replaces **every** occurrence in the response; the default `on` replaces only the first.
- `sub_filter_types application/json;` brings JSON into the processing scope. By default only `text/html` is processed; CSS, JS, and JSON all pass through untouched.

sub_filter only applies to locations where it is explicitly configured; the inheritance rule is "only if a level writes no sub_filter at all does it inherit from the level above" — the moment you write a first rule in a location, every other rule at the server level goes dead, so multiple rules must be written at the same level. 1.9.4+ also allows variables in both the searched and replacement strings, so you can splice in `$host`, `$arg_*`, and other runtime values for dynamic rewriting; `sub_filter_types` accepts multiple MIME types in one go, and in extreme cases `*` wildcards all types (0.8.29+).

## Live Test 1: Only the First Occurrence Gets Replaced by Default

The same response contains two occurrences of the target string; here's the difference between the default config and `sub_filter_once off`:

![Figure 1](/images/csdn/figures/nginx-sub-csdn139253978-1.png)

In the default-on output, old and new domains coexist — it replaced the first occurrence and called it a day. Domain migration scenarios almost always need `off`; otherwise the page ends up half new links, half old links, which is more confusing than not replacing at all. An incidental discovery from testing: the test page's first occurrence was deliberately written as the mixed-case `Old.Example.com`, and it got replaced anyway — matching is **case-insensitive** (per the official documentation). That's both fault tolerance and potential collateral damage (watch out when the body happens to contain same-name case variants).

## Live Test 2: Only text/html Is Processed by Default

`data.json` contains the same string; under the default config it passes through untouched, and after adding `sub_filter_types` the replacement takes effect:

![Figure 2](/images/csdn/figures/nginx-sub-csdn139253978-2.png)

Frontend-backend interaction nowadays runs heavily on JSON APIs, and relying only on the default text/html scope frequently "looks like it's not working" — check first whether the response's Content-Type is on the `sub_filter_types` list.

## Live Test 3: Compression Is Replacement's Natural Enemy

The upstream has gzip on, the client requests with `Accept-Encoding: gzip`, and the proxy has no extra configuration — the live test received a blob of gzip binary, with no replacement whatsoever: upstream compression happens before the content ever leaves the backend, so what Nginx receives is a compressed byte stream, and literal matching has nothing to grab onto. After adding one line, `proxy_set_header Accept-Encoding "";`, telling the upstream "I want uncompressed content," the replacement came back to life:

![Figure 3](/images/csdn/figures/nginx-sub-csdn139253978-3.png)

That is the complete chain behind "sub_filter conflicts with compression." To have both (compress after replacing, to save bandwidth), you can also turn on gzip at the Nginx layer — responses to the client still get compressed by Nginx; only the upstream-to-Nginx leg runs in plaintext, a bandwidth cost usually acceptable on intranet links. Conversely, if the upstream must keep compression on and it can't be turned off (third-party SaaS origins and the like), sub_filter is unsolvable on that chain: either push the upstream to support an "uncompressed" exit, or move the replacement to the application layer — Nginx has no "decompress, replace, recompress identically" switch at this layer.

## Caveats

- **Performance overhead**: replacement happens while the response body streams through Nginx; under large response bodies and high concurrency the cost is perceptible, so run a load test before production.
- **Conflict with compression**: in reverse-proxy scenarios, remember to add `proxy_set_header Accept-Encoding "";` so the upstream returns uncompressed content — only then does replacement have a chance to work (tested above).
- **Caching semantics**: replacement happens at the content-return stage, and what's stored in the cache is the pre-replacement original; once sub_filter is enabled, responses lose `Content-Length` (switching to chunked transfer — measured: response headers became `Transfer-Encoding: chunked`), which affects some client logic that depends on content length. For scenarios relying on Last-Modified for cache negotiation, turn on `sub_filter_last_modified on;` (1.5.1+) to keep the upstream timestamp — by default it is removed.
- **Multiple rules**: writing multiple `sub_filter` rules at the same configuration level requires Nginx 1.9.4 and above; older versions get one rule only.
- **Don't use it for strong security filtering**: string replacement cannot stop mutated injection content; security filtering needs dedicated mechanisms, and sub_filter is fit only for deterministic text replacement.

## Wrap-Up

Back to the "not one backend line changed" starting point: a single `sub_filter` rule really can take over the content-swap job, but three live tests exposed its three default-value traps — only the first occurrence replaced by default (needs `off`), only text/html handled by default (types must be added explicitly), and total failure the moment the upstream compresses (needs `Accept-Encoding` cleared). Troubleshoot "replacement not working" along these three steps: count how many occurrences got replaced, check whether the Content-Type is in the processing scope, confirm the upstream isn't returning compressed content. Only after all three are ruled out do you get to suspect anything else.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
