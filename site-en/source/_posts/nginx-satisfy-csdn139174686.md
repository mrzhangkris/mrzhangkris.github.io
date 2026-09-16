---
title: "The Nginx satisfy Directive: Combining Multiple Access Controls"
date: 2024-05-25 09:15:00
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1667670778881-537035257bd8?w=1600&q=80&fm=jpg
lang: en
---

When a location carries both an IP whitelist and password authentication, how many checkpoints does a request have to pass? The `satisfy` directive answers exactly that: `any` means passing any single checkpoint is enough, `all` means every checkpoint must be passed. Policies like "password-free inside the intranet, password required from outside" are built entirely on it. But its interplay with the writing order of allow/deny, and its relationship with the return directive, hide several traps that only real testing reveals.

This post is organized around hands-on configuration: it first lays out the lab environment, then uses four configurations with real output to verify the any/all combination semantics, the ordering trap, and return's priority. All output shown is from nginx/1.31.5 live runs.

## The Lab Environment

All examples are reproducible inside a container:

- nginx/1.31.5 (docker image `nginx:alpine`);
- the password file was generated with `openssl passwd -apr1` (apr1 hash) written to `/etc/nginx/.htpasswd`, account `user`, password `password1`;
- curl inside the container originates from 127.0.0.1; in the experiments it plays the role of the "whitelisted intranet IP";
- the protected content is a real static file; after each round of changes, reload and then verify (reload is asynchronous — a curl fired immediately may land on a worker still running the old config, so when something "doesn't take effect," wait a second first).

## The Mechanism in One Sentence

`satisfy` decides the **logical relationship between multiple access checkpoints**: "checkpoints" here means the access module's allow/deny (IP control) and auth_basic (password authentication). `any` is "or" — passing any one checkpoint suffices; `all` is "and" — every checkpoint must be passed. Without satisfy, the default is `all`.

The default of `all` is the security-conservative choice: with every checkpoint required, a misconfigured one doesn't swing the door wide open; whereas the "or" semantics, once misconfigured (say, an allow range written too broadly), downgrades the entire defense line to a single checkpoint. So any "pass if either allows" requirement must explicitly declare `satisfy any`, forcing that downgrade to happen on paper where it can be reviewed.

## Example 1: satisfy any, Password-Free for the Intranet

An IP whitelist plus password authentication, with `satisfy any` turning the two into an "or":

```nginx
server {
  listen 80;
  satisfy any;

  allow 127.0.0.1;   # the whitelist (plays the intranet in this experiment)
  deny all;

  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / { root /usr/share/nginx/html; }
}
```

Live test of the two requests from the whitelisted IP:

![Figure 1](/images/csdn/figures/nginx-satisfy-csdn139174686-1.png)

Inside the whitelist, no credentials, straight 200 — once the IP checkpoint lets the request through, the password checkpoint **is never even consulted**; even a wrong password sails through. This is exactly how "password-free inside, password required outside" is implemented: intranet IPs walk through the allow gate, while outside sources, blocked by deny all, have only the password gate left.

## Example 2: satisfy all, Double Verification

Swap only `any` for `all`, and the semantics become "and":

```nginx
satisfy all;

allow 127.0.0.1;
deny all;
auth_basic "Restricted";
auth_basic_user_file /etc/nginx/.htpasswd;
```

Three requests from the same whitelisted IP, tested live:

![Figure 2](/images/csdn/figures/nginx-satisfy-csdn139174686-2.png)

No credentials, 401; wrong password, 401; right password, 200 — IP and password are both indispensable. This suits scenarios like "office-subnet-only access, and visitors must log in under their real identity." On authentication failure Nginx replies 401 with a `WWW-Authenticate: Restricted` header, and the browser uses that header to pop up the account/password dialog — the realm string comes from the `auth_basic` directive's argument. Comparing the outputs of Example 1 and Example 2 makes the point visible at a glance: what satisfy changes is the and/or relationship between checkpoints; nothing else in the config moved by a character.

The selection criterion is a single question: **is the relationship between checkpoints "trust stacking" or "substitution"?** Password-free intranet is substitution (IP trust is already sufficient; the password is compensation for the outside), so use any. Defense in depth is trust stacking (the IP merely scopes the range; identity still requires a real login), so use all. When unsure, stick with the default all — it can only keep people out, never let in those who shouldn't be.

The other half of "password required from outside" deserves its own live shot: make the request come from an IP outside the whitelist (in the experiment, fired from another container), and the two semantics immediately part ways —

![Figure 3](/images/csdn/figures/nginx-satisfy-csdn139174686-3.png)

Under `satisfy any`, a non-whitelisted source, rejected by deny all, has only the password gate left, and with correct credentials it still gets 200 — that's the complete closed loop of "password-free inside, password required outside." Under `satisfy all`, the same source with a perfectly correct password gets a 403 instead of a 401: the IP checkpoint didn't pass, so the password gate never even opens. When troubleshooting a ticket of "the password is right but I still can't get in," first check whether the source IP is on the allow list, then check whether the response is 403 or 401 — the status code tells you directly which checkpoint blocked it.

This combination doesn't have to blanket the whole site. Both auth_basic and allow/deny can be pushed down to the location level, narrowing control to a single directory:

```nginx
location /admin/ {
  satisfy any;
  allow 10.0.0.0/8;    # office subnet, password-free
  deny all;
  auth_basic "Admin";
  auth_basic_user_file /etc/nginx/.htpasswd;
}
```

Inheritance is also worth committing to memory: auth_basic written in a server block is inherited by child locations, so to exempt a particular path from authentication (say, a callback URL for monitoring probes), you must write `auth_basic off;` explicitly in that location — miss it, and the probe keeps collecting 401s while the alarm rings for reasons you can't figure out.

## The Wrong Way: the deny all Ordering Trap

allow/deny rules are **checked one by one in written order, stopping at the first match**. Put `deny all` first:

```nginx
# wrong: deny all matches every source, and allow never gets a turn
deny all;
allow 127.0.0.1;

# right: specific ranges first, deny all as the catch-all
allow 127.0.0.1;
deny all;
```

The wrong version under `satisfy any`, tested live:

![Figure 4](/images/csdn/figures/nginx-satisfy-csdn139174686-4.png)

The IP checkpoint says "no" to every request, the whitelist is effectively dead, and under `satisfy any` only the password gate can still admit anyone. The danger: `nginx -t` reacts not at all to this kind of logic error — the syntax is perfectly fine while the policy has quietly changed shape. **Any policy touching allow/deny must be curled from different sources in a test environment after every change**.

## return Outranks Every Checkpoint

However strict the access control, it can't stop return in the rewrite phase:

```nginx
server {
  listen 81;
  satisfy any;

  deny all;
  allow 127.0.0.1;

  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location /secret { return 404; }
  location / { root /usr/share/nginx/html; }
}
```

A credential-less request to `/secret`, tested live:

![Figure 5](/images/csdn/figures/nginx-satisfy-csdn139174686-5.png)

Straight 404 — the IP check and password authentication were never executed. The reason: `return` terminates the request in the rewrite phase, while both the access checks and auth_basic live in the later access phase. Used in reverse, this trait is the clean way to "shut a path completely"; but there's a flip side: **using `return 200 "..."` to answer inside a protected location makes the entire access control inapplicable to it** — the design of this very experiment tripped over exactly that.

## Caveats

- `satisfy` can be placed in http, server, or location blocks, taking effect layer by layer inward; when omitted, the default is `all`, and "pass if either allows" must be written explicitly as `satisfy any`.
- Under `satisfy all`, a source not on the allow list gets 403 even with the right password (tested above); under `satisfy any`, it starts at 401 and gets through with the right password. Those two status codes are your troubleshooting entry point.
- allow/deny takes the first matching rule in written order; when `deny all` and specific ranges share a block, order decides everything, and `nginx -t` checks syntax, not logic.
- Don't put `return` in protected paths — living in the rewrite phase, it nullifies auth_basic and allow/deny alike (tested above).
- Generate `.htpasswd` with `htpasswd` or `openssl passwd -apr1`, and keep it out of the web root; in container environments nginx:alpine doesn't ship openssl, so generate the file outside and mount it in.

## Wrap-Up

Back to the opening question: with an IP whitelist and password authentication on the same location, how many checkpoints must a request pass — under `satisfy any`, one is enough; under `satisfy all`, not one may be skipped. Live testing also clarified two variables "outside the checkpoints": the writing order of allow/deny decides whether the IP checkpoint itself functions at all, and return in the rewrite phase can skip the entire layer of checkpoints in one stroke. After configuring, run three kinds of requests — whitelisted without credentials, whitelisted with a wrong password, non-whitelisted without credentials — and the differences among the three semantics (any/all/wrong order) reveal themselves immediately.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
