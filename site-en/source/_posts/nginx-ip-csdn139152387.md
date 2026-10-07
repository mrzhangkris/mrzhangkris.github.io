---
title: "Restricting IP Access in Nginx: allow and deny"
date: 2024-05-23 16:58:55
lang: en
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1592659762303-90081d34b277?w=1600&q=80&fm=jpg
---

Ops scenarios constantly call for restricting access to certain IPs: the admin entrance open only to the company subnet, an API directory reserved for the monitoring machine. Nginx provides two directives for this, `allow` and `deny`. The rules themselves are two lines, but three spots — matching order, scope, and subnet syntax — can easily produce "configured but not working" or "locked myself out too." This post tests each of the three typical patterns in a container, then uses a wrongly-ordered counterexample to show why the rules must be "allow first, deny last."

## Test Environment

Conclusions should be reproducible, so here are the conditions:

- nginx/1.31.5 (docker image `nginx:alpine`, throwaway container, deleted after use);
- Site root at `/var/www/html`, `curl` to verify status codes, changes applied with `nginx -s reload`;
- Two source IPs were available inside the container: loopback `127.0.0.1` and the container NIC `172.17.0.3` — perfect for the "on-list / off-list" comparison.

## Matching Rule: First Hit Wins

The core mechanism in one sentence: **Nginx compares the source IP against the allow/deny rules in written order, stops at the first hit, and rejects only if nothing matches — so write the allow list first and finish with `deny all` as the catch-all.**

One sentence for each directive:

- **allow**: permit the specified IP or CIDR subnet;
- **deny**: reject the specified IP or CIDR subnet.

They can be placed in `http`, `server`, or `location` blocks, and scope follows the block: a `server` block governs the whole site, a `location` block only that path.

## Example 1: Single-IP Whitelist

Requirement: only the specified IP can access, everyone else is rejected. In production, replace `192.168.1.1` with your office egress IP:

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    # Allow access from the specified IP address
    allow 192.168.1.1;
    # Deny access from all other IP addresses
    deny all;

    root /var/www/html;
    index index.html;
  }
}
```

Tested in the container, with the same structure run through two states — with the machine's loopback on the list, requests returned 200; after switching the allowed entry to `192.168.1.1` (the local machine is not on the list), the same request immediately became 403:

![Single-IP whitelist test](/images/csdn/figures/nginx-ip-csdn139152387-1.png)

403 is the standard response when allow/deny rejects; the error log carries a matching line, `access forbidden by rule` — seeing it during troubleshooting means the request died on the IP rules, not on file permissions or routing.

## Example 2: Subnet Allow (CIDR Syntax)

Open the entire site to one internal subnet only. Subnets use CIDR notation (`10.0.0.0/24`); single IPs are written as plain addresses:

```nginx
server {
  listen 80;
  server_name example.com;

  # Allow access from the IP 10.0.0.1
  allow 10.0.0.1;
  # Allow access from IPs within the 10.0.0.0/24 subnet
  allow 10.0.0.0/24;
  # Deny access from all other IP addresses
  deny all;

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

For the test I verified the boundary with one subnet plus two IPs: in the container I reproduced subnet-allow with `127.0.0.0/8` — a request from the loopback IP hit the subnet and returned 200, while a request from the container NIC `172.17.0.3` fell outside the subnet and returned 403. Same machine, two sources, one allowed and one rejected:

![Subnet allow test](/images/csdn/figures/nginx-ip-csdn139152387-2.png)

Note that CIDR matches the **source IP**, regardless of which address the request targets: in that 403 request above, the client was also visiting this very server — it was rejected purely because its source wasn't in `127.0.0.0/8`.

## Example 3: Locking a Single Path

Admin panels and management APIs usually occupy just one path of a site. To lock `/admin` without affecting the rest, put the rules in the corresponding `location` block:

```nginx
server {
  listen 80;
  server_name example.com;

  location /admin {
    # Allow specific IPs to access the /admin path
    allow 192.168.1.1;
    deny all;

    root /var/www/html;
    index index.html;
  }

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

The test was exactly this shape: the local machine `127.0.0.1` wasn't on `/admin`'s allow list — `/admin` returned 403 while the homepage returned 200. The rules' power was strictly confined to their block:

![Location-level restriction test](/images/csdn/figures/nginx-ip-csdn139152387-3.png)

## The Wrong Way: deny all Placed Before allow

Since rules match in order and "first hit wins," once `deny all` is written first, every request hits it on rule one and all the allows behind it become decoration:

```nginx
# Wrong: deny all first, whitelist rendered useless
deny all;
allow 127.0.0.1;

# Right: list the allowed entries first; deny all only as the catch-all
allow 127.0.0.1;
deny all;
```

I tested the wrong version: even though the source was `127.0.0.1` — on the whitelist — the result was still 403:

![Wrong-order test](/images/csdn/figures/nginx-ip-csdn139152387-4.png)

Where it goes wrong: sequential matching means "the first rule holds veto power." The catch-all `deny all` goes at the end precisely so it's hit only in the one case of "not on the list."

## How to Apply Changes

After editing the config, don't just restart — follow the standard two steps: validate syntax first, then reload gracefully:

```bash
# Test the Nginx configuration file for syntax errors
sudo nginx -t

# Reload Nginx to apply the new configuration
sudo systemctl reload nginx
```

Every syntax error that `nginx -t` misses will make the reload fail and leave old and new configs coexisting — if your rules work "sometimes but not always," first confirm whether the reload ever actually succeeded.

## Notes and Cautions

- allow/deny match in written order. Reversing the order (e.g., `deny all` first) kills every allow behind it — the number-one pitfall, tested in this post.
- Rule scope follows the block: a `server` block governs the whole site, a `location` block only its path. Don't accidentally write admin-only rules at the `server` level.
- Subnets use CIDR notation (e.g., `10.0.0.0/24`); single IPs are written as plain addresses.
- With a reverse proxy or CDN in front, the source IP Nginx sees may be the proxy's, not the user's real IP. Whitelist "the address Nginx actually sees" — handle it with the `realip` module or by allowing the proxy subnet.
- For sensitive paths like admin panels and management APIs, pair the IP whitelist with authentication — don't rely on a single layer.

## Summary

Back to the two opening scenarios: the company subnet viewing the admin panel, the monitoring machine pulling APIs — both are the same model of "allow the list, reject the rest": `allow` lists the entries, `deny all` is the catch-all, written in the right block, with the catch-all always last. After configuring, run `nginx -t` before reloading; when a 403 appears, look for `access forbidden by rule` in the logs — and IP access control stops being a gamble and becomes a verifiable set of rules.

> This article was rebuilt from the author's CSDN blog posts published between 2020 and 2024, originally published on CSDN.
