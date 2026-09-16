---
title: "Nginx Referer Hotlink Protection in Practice: Four Kinds of Requests Tested Against valid_referers"
date: 2024-05-29 08:45:00
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1697952431907-8542919a16b3?w=1600&q=80&fm=jpg
lang: en
---

Someone else's page hotlinks your images with an `<img>` tag, and the bandwidth bill lands on you — that's hotlinking. The `Referer` header in an HTTP request records which page the request jumped from, and Nginx's Referer module (`ngx_http_referer_module`) uses that field to judge where a request came from: it can block hotlinks, and it can also log the origin for traffic analysis.

**The core mechanism in one sentence: `valid_referers` lists the legal origins; requests that don't match flip the built-in `$invalid_referer` variable to non-empty, and an `if` block rejects them.** In this post, an nginx:alpine container runs four kinds of requests — with Referer, without Referer, empty header, hotlink header — each with captured results, and finishes by running a widely circulated misconfiguration for real to show what happens.

## Lab Environment and Mechanism Prerequisites

- official nginx:alpine image, version nginx/1.31.5; the referer module is a built-in standard module, no extra compile flags needed;
- requests are self-sent and self-received inside the container, with curl's `-H` manually constructing the Referer header.

First, be clear about Referer's trustworthiness: when a browser jumps from page A to page B, the request for B's resources usually carries a `Referer` header whose value is page A's URL. But it is client-supplied and can be forged outright. So this module's role is **coarse-grained origin control** — it blocks the low-cost freeloading of casually hotlinked pages, not strong security validation.

The module's three uses:

- **Hotlink protection**: only pages from specific origins may load your images, videos, and other resources; everything else is refused.
- **Statistics**: record `$http_referer` in the access log and analyze where traffic comes from.
- **Security control**: fend off a class of low-quality automated requests that carry no legal Referer.

## Example 1: Minimal Hotlink-Protection Config, Four Requests Tested

The most typical pattern is `valid_referers` plus `if`:

```nginx
server {
  listen 80 default_server;

  valid_referers none blocked yourwebsite.com;
  if ($invalid_referer) {
    return 403;
  }

  location / {
    return 200 "ok\n";
  }
}
```

Breaking down what this config does:

- `valid_referers none blocked yourwebsite.com;` defines the allowed Referer list: `none` allows requests **without** a Referer (typing a URL straight into the address bar is exactly this), `blocked` allows requests whose Referer header exists but is empty, or was stripped by a firewall/proxy, and the final domain is the legal origin;
- for requests that fail to match, `$invalid_referer` becomes `1`, the `if` triggers, and the server returns 403 immediately.

`valid_referers` accepts more than these three kinds. `server_names` waves through any request whose Referer carries this machine's own `server_name`; domains may carry `*` wildcards (both `*.example.com` and `example.*` are legal), and can carry a URI prefix — `www.example.org/galleries/` only admits requests that jumped from under that path; entries starting with `~` are regular expressions, and the regex matches the text after `http://` or `https://`. The whole match is case-insensitive, and the port inside the Referer is ignored during checking. Placement matters too: this directive may only appear at the `server` and `location` levels (per the official docs) — putting it in the `http` block simply does nothing, so don't overlook that layer when troubleshooting a "configured but not working" case.

With the config loaded, one request of each kind goes out; watch the response codes:

![Figure 1](/images/csdn/figures/nginx-referer-csdn139267748-1.png)

The matrix is clear: same-site origins pass, the hotlink origin gets 403, and no-origin plus empty-origin both pass per the `none` and `blocked` declarations. Whether to include `none` and `blocked` is a business decision — if users will open image URLs directly you must keep `none`; if a privacy proxy that strips Referer sits in front you must keep `blocked`; remove both and normal users get caught in the crossfire.

## Example 2: What Exactly Does blocked Block

`blocked` deserves its own test run, because it's the value most easily confused with `none`. curl sends a Referer header that **exists but is empty** using `-H "Referer;"`:

![Figure 2](/images/csdn/figures/nginx-referer-csdn139267748-2.png)

The result is 200. That is `blocked`'s semantics: the header was once present, but its value was stripped en route — enterprise gateways, privacy plugins, and HTTPS redirects all do this. If such requests were judged as hotlinking, every user coming from those environments would be blocked at once. Its weight can be weighed for real: delete `blocked` from the list and resend the same empty-header request — 403. That one-up-one-down is exactly the slice of legitimate traffic `blocked` stands guard for. A counter-reminder though: allowing both `none` and `blocked` means "requests with no origin are undefended" — a reasonable price for an image site, but for paid content think twice.

## Example 3: Origin Statistics — Log the Referer

Hotlink protection is "rejecting"; statistics is "recording." The core is a custom `log_format` capturing `$http_referer`:

```nginx
http {
  log_format referer_log '$remote_addr - $remote_user [$time_local] "$request" '
    '$status $body_bytes_sent "$http_referer" "$http_user_agent"';

  access_log /var/log/nginx/referer.log referer_log;

  server {
    listen 80;
    server_name yourwebsite.com;

    location / {
      valid_referers none blocked yourwebsite.com;
      if ($invalid_referer) {
        return 403;
      }
    }
  }
}
```

`$http_referer` and `$http_user_agent` record the referring page and the browser info respectively; writing `access_log` again inside a location overrides the http-level setting, sending just this traffic to its own file for separate accounting. The log line of a rejected hotlink request is ready-made evidence (the screenshot used a trimmed `$status "$http_referer"` format to focus on the origin field; in production, configure the full format from the example code block):

![Figure 3](/images/csdn/figures/nginx-referer-csdn139267748-3.png)

The `$http_referer` field dutifully recorded `https://evil.example/hotlink`. Once the logs accumulate, the uses are very practical: analyze where ad clicks come from, see which sites drive most of your traffic, and adjust content publishing strategy against origins.

## Misconfiguration Compared: allow With a Domain, nginx -t Fails on the Spot

In hotlink-protection configs circulating online, you'll often see access control appended after the `if`:

```nginx
valid_referers none blocked yourwebsite.com;
if ($invalid_referer) {
  return 403;
}
allow yourwebsite.com;   # hoping to add another layer of origin restriction
deny all;
```

This config refuses to load. `allow`/`deny` belong to the access module and only accept IP/CIDR (plus `unix:` and `all`) — **domains are not allowed**; the referer module's domain-matching ability cannot be transplanted over. Run `nginx -t` and watch it fail:

![Figure 4](/images/csdn/figures/nginx-referer-csdn139267748-4.png)

`invalid parameter "yourwebsite.com"` — the test fails outright. If you merely copy-pasted this in, the server won't start and it drags down other sites on the same machine; that's also why the rule is always `nginx -t` before every reload.

## Notes and Caveats

- Whether to add `none` and `blocked` depends on the business: allow users to open resources directly and you need `none`; have a Referer-stripping proxy in front and you need `blocked`; add neither, and you only accept requests carrying a legal domain.
- Referer can be forged. Hotlink protection stops the "casually hotlinked page" class of low-cost freeloading, not targeted forgery; strong validation should use signed URLs (secure_link) or login sessions.
- Once you have many origin domains, first use `server_names` to admit jumps pointing at yourself, then cover subdomains with wildcards like `*.example.com`; `~` regexes are the last resort — too many rules and nobody can maintain them anymore.
- After changes, verify with `nginx -t`, and before reloading confirm the log directory exists and the Nginx process has write permission.

## Wrapping Up

Back to the opening scenario: the bandwidth bill lands on you because the server trusts all origins by default. `valid_referers` turns "legal origins" into a whitelist, `$invalid_referer` hands the verdict back to `if`, and the tested matrix of four request kinds is the full behavior of this mechanism. Hotlink protection can't stop the determined, but it's enough to send the "casually hotlinking" crowd to find images elsewhere — and for most sites, this coarse-grained gate is already enough.

---

> This post was rewritten from the author's CSDN blog articles originally published between 2020 and 2024 on CSDN.
