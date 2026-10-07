---
title: "Nginx realip in Practice: Recovering the Real Client IP Hidden Behind a Proxy"
date: 2024-05-20 14:01:42
updated: 2026-09-14
lang: en
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=1600&q=80&fm=jpg
---

When Nginx acts as a reverse proxy, the `$remote_addr` the backend sees is usually the proxy's own IP, with the real client hidden in headers like `X-Forwarded-For`. If logging, rate limiting, or risk control rely on `$remote_addr` directly, the results are all distorted: bans land on the proxy, and rate limiting counts every user as one.

`ngx_http_realip_module` solves exactly this: it lets Nginx recover the real client IP from request headers sent by trusted proxies. **The core is just three directives — `set_real_ip_from` defines the trusted proxy list, `real_ip_header` specifies which header to read from, and `real_ip_recursive` decides whether to walk back through multiple proxy layers.** This post runs all three typical scenarios in an nginx:alpine container, with the actual output captured for each.

## Experiment Environment

- The official nginx:alpine image; `nginx -v` confirms nginx/1.31.5;
- Requests are sent and received inside the container: the source address of each request is 127.0.0.1, treated as the proxy layer forwarding the request;
- The client IP uses a non-loopback address (203.0.113.7 is from the documentation-reserved TEST-NET range), passed in via the `X-Forwarded-For` header.

Realip is a standard module and is included in most distribution prebuilt packages. Check before you start:

```bash
nginx -V 2>&1 | grep -o with-http_realip_module
```

![Figure 1](/images/csdn/figures/nginx-realip-ip-csdn139063602-1.png)

Output means it is enabled; if not, Nginx must be recompiled with the `--with-http_realip_module` flag.

## The Core Mechanism: One Trust Chain

Realip's working principle compresses into one sentence: **only for requests from the trusted list will Nginx overwrite `$remote_addr` with the value from the designated header.** Each directive governs one piece:

- **set_real_ip_from**: specifies the trusted proxies' IPs or CIDR ranges. Only requests from these addresses trigger the rewrite — this is the security boundary. Without it, anyone can forge headers and impersonate another IP.
- **real_ip_header**: which request header holds the real IP, typically `X-Forwarded-For` or `X-Real-IP`.
- **real_ip_recursive**: with multiple proxy layers set to `on`, Nginx walks back along the proxy chain from the end, skipping trusted addresses in the list, and takes the first address not in the list as the client IP.

All three directives can appear at the `http`, `server`, and `location` levels (per the official documentation). A globally uniform trust list goes in the `http` block once; when only individual sites sit behind a proxy, keep it inside the corresponding `server` block for tighter control. One easily misunderstood fact: realip only rewrites the `$remote_addr` variable — **it never touches the header itself**. In Experiment 1's output, the `xff=` line stays intact — that is the evidence. The header continues downstream unchanged, the downstream service applies its own list and does its own rewrite, and the two never interfere.

## Experiment 1: Minimal Configuration, Recover the IP First

```nginx
server {
  listen 80;
  set_real_ip_from 127.0.0.1;      # trust the proxy layer forwarding requests in this experiment
  real_ip_header      X-Forwarded-For;
  real_ip_recursive   off;

  location / {
    return 200 "remote_addr=$remote_addr\nxff=$http_x_forwarded_for\n";
  }
}
```

After reloading the configuration, simulate a request that passed through two proxy layers and carries the full proxy chain in its header:

```bash
curl -s -H "X-Forwarded-For: 203.0.113.7, 10.0.0.5" localhost
```

![Figure 2](/images/csdn/figures/nginx-realip-ip-csdn139063602-2.png)

`$remote_addr` changed from 127.0.0.1 to 10.0.0.5 — the rewrite took effect, and the access log records it too. Note the semantics of `off`: **take the last address in `X-Forwarded-For`, and stop there**, regardless of whether that address is trusted. 10.0.0.5 is in fact another hop in the proxy chain; it simply is not in the list, so `off` accepts it as-is.

## Experiment 2: real_ip_recursive on, Strip the Trusted Middle Layers

The more common production case is a multi-layer proxy: the edge proxy sees the previous hop's proxy IP, and the real client hides at the head of the chain. Add the middle layers to the trusted list and turn on recursion:

```nginx
set_real_ip_from 127.0.0.1;      # the directly connected forwarding layer
set_real_ip_from 10.0.0.5;       # the inner proxy in the chain
real_ip_header      X-Forwarded-For;
real_ip_recursive   on;
```

Send the same request again:

![Figure 3](/images/csdn/figures/nginx-realip-ip-csdn139063602-3.png)

The result changes from 10.0.0.5 to 203.0.113.7. The backtracking logic of `on`: check from the end of the header forward one by one — 10.0.0.5 is in the list, skip it; 203.0.113.7 is not in the list, accept it. **The recursive mode's answer is the real client beyond the proxy chain.**

## Experiment 3: Outside the List, the Header Counts for Nothing

The other side of the trust boundary matters just as much — when the source is not in the list, no amount of header crafting helps. Trust only an unrelated range, then forge the header from 127.0.0.1:

```nginx
set_real_ip_from 10.0.0.99;      # the request source of this experiment is not in the list
real_ip_header      X-Forwarded-For;
real_ip_recursive   on;
```

![Figure 4](/images/csdn/figures/nginx-realip-ip-csdn139063602-4.png)

`$remote_addr` does not move an inch — still the 127.0.0.1 of the TCP peer. That is what `set_real_ip_from` as a security boundary means: **realip's trustworthiness comes from the list, not from the header itself.**

## Wrong Configuration Compared: One Request, Two Answers

The easiest trap is forgetting recursion in a multi-layer proxy environment. Put Experiment 1 and Experiment 2 side by side:

![Figure 5](/images/csdn/figures/nginx-realip-ip-csdn139063602-5.png)

The same `X-Forwarded-For: 203.0.113.7, 10.0.0.5`: `off` yields 10.0.0.5, `on` yields 203.0.113.7. What exactly is wrong: **with `off`, any layer in the chain that is missing from the list gets treated as the client.** The consequences land on logging and rate limiting — bans hit your own inner proxy's IP, one ban takes it down with certainty, and every user routed through it goes down together.

The reverse trap exists too: in a single-proxy environment, pairing `recursive on` with an overly broad list (say, the entire `0.0.0.0/0`) amounts to declaring "anyone may pick their own client IP," throwing the forgery channel wide open. Write only the addresses of actually deployed proxies into the list. Always.

## A Few Common Combinations

The proxy topology changes the exact form slightly.

With a single fixed proxy, just write the single IP:

```nginx
set_real_ip_from 123.45.67.89;
real_ip_header X-Forwarded-For;
```

IPv6 proxies are supported the same way:

```nginx
set_real_ip_from 2001:0db8::/32;
real_ip_header X-Forwarded-For;
```

When a local proxy sits on the same machine (say, a fronting service on 127.0.0.1), its usual header is `X-Real-IP`:

```nginx
set_real_ip_from 127.0.0.1;
real_ip_header X-Real-IP;
```

When no request header is available and the upstream passes through at layer four (for example `proxy_protocol`), a different route applies: `listen 80 proxy_protocol;` reads the address from the protocol layer itself — beyond the scope of this post.

A word on logging: after realip takes effect, `$remote_addr` is the recovered real client IP; logging `$http_x_forwarded_for` alongside keeps the original header content for cross-checking during troubleshooting — Experiment 1's capture already shows this combination in action.

## Caveats

- Put only the proxy ranges that are actually deployed into `set_real_ip_from`; the wider the range, the more room forged headers have to impersonate IPs.
- `real_ip_recursive on` is only necessary with multi-layer proxies; on or off makes no difference with a single proxy. Multi-layer without it, and what you recover is the inner proxy's IP.
- `X-Forwarded-For` itself can be forged by clients; realip is trustworthy only because trusted proxies overwrite or append this header — the trust chain rests on `set_real_ip_from`, not on the header itself.
- After any configuration change, run `nginx -t` to validate before reloading, so a config error doesn't take the whole service down.

## Summary

Back to the opening problem: the proxy hid the real client inside request headers, and `$remote_addr` became distorted. The solution is the three-directive trust chain — the list defines who may forward, the header specifies where to read, and recursion decides how many layers to strip. Across all three experiments the pattern is identical: **whether the recovered IP is trustworthy depends on how tight the list is.** Keep the list under control, and the IP that logging, rate limiting, and risk control see is the address that is actually accountable.

---

> This article was reconstructed from the author's CSDN blog posts from 2020–2024, originally published on CSDN.
