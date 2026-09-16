---
title: "Nginx Round-Robin Load Balancing: Testing the Default Strategy and Its Boundaries"
date: 2024-05-31 10:37:01
lang: en
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx, Network Services]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1555664424-778a1e5e1b48?w=1600&q=80&fm=jpg
---

When Nginx acts as a reverse proxy, how to split traffic across multiple backends is the first question to answer. Round-Robin is the most basic answer: requests are handed to backends one by one in order, and when a cycle finishes, it starts over. It's also Nginx's default strategy — when the upstream block contains no load-balancing directive at all, round-robin is what you get. It's simple enough to be taken for granted and never looked at twice. But under what distribution does round-robin actually stay even, and where does traffic go when a backend dies? Worth testing before trusting.

This post is organized as hands-on configuration: first the test environment, then measured runs of three key behaviors — the round-robin sequence, weighted distribution, and failover on backend outage — and finally a set of easily-miswritten config comparisons. All output is from actual runs on nginx/1.31.5.

## Test Environment

Every example is reproducible in a single container: nginx/1.31.5 (docker image `nginx:alpine`), with three server blocks listening on 8081/8082/8083 simulating three backends (each responding with backend1/2/3), and port 80 reverse-proxying to the upstream; access_log records `$upstream_addr` to see where each request actually landed. When judging "who got the traffic," guessing is useless — this variable gives a definitive answer, and it works for outage debugging too. The experiment pins `worker_processes` to 1; the reason is the observation trap in Test 1.

## When Round-Robin Fits

Let's set the boundaries first, then look at the tests:

- **Similar backend configurations**: when machines perform about the same, round-robin splits naturally with zero tuning.
- **Stateless requests**: when it doesn't matter which machine a request lands on (sessions aren't pinned to a machine), round-robin is the most natural choice.
- **Light to moderate traffic**: small apps don't need fancier strategies — the default is a good answer.

Conversely, with wildly uneven backend performance or a need for session persistence, round-robin is a poor fit — the latter is covered in the notes at the end.

## Test 1: The Round-Robin Sequence

Start with the most basic even distribution:

```nginx
upstream backend {
  server 127.0.0.1:8081;
  server 127.0.0.1:8082;
  server 127.0.0.1:8083;
}

server {
  listen 80;
  location / {
    proxy_pass http://backend;
  }
}
```

Six requests in a row — exactly two full cycles — with access_log's `$upstream_addr` recording the real routing:

![Figure 1](/images/csdn/figures/nginx-round-robin-csdn139346197-1.png)

Strictly sequential rotation; after one full cycle it starts over from the top.

Production configs usually also carry a set of header passes in the location so backends get real client information — don't skip them:

```nginx
location / {
  proxy_pass http://backend;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

`X-Forwarded-For` uses `$proxy_add_x_forwarded_for` to append rather than overwrite, so under multi-level proxies the backend can see the full chain; without passing `Host`, the backend application always sees the upstream name instead of the domain the user actually visited.

One observation trap I genuinely hit during testing deserves a warning: the experiment originally ran under the default config (`worker_processes auto`), and 6 of 9 requests landed on 8081 — **the round-robin pointer is maintained independently per worker**. When a small number of short-lived requests spread across multiple workers, most requests happen to be each worker's "first request," and they all start from the first backend in the list. When a load test shows "uneven" distribution, check worker count and request volume before condemning round-robin; with workers pinned to 1, this experiment's sequence was perfectly strict.

## Test 2: weight — Leveling Out Uneven Machines

When machine performance differs, weight the strong ones:

```nginx
upstream backend {
  server 127.0.0.1:8081;
  server 127.0.0.1:8082 weight=2;
  server 127.0.0.1:8083;
}
```

Ten requests in a row, measured:

![Figure 2](/images/csdn/figures/nginx-round-robin-csdn139346197-2.png)

8082 received 5 requests, 8081 and 8083 got 2-3 each; the overall ratio matched 2:1:1. Note the ordering is not "8082 twice in a row, then the others" — Nginx uses a smooth weighted algorithm to interleave the high-weight machine's requests, avoiding momentary pressure spikes. So don't write assertion scripts against a fixed sequence — **verify by ratio**.

While we're here, let's meet the neighboring strategies that live in the upstream block: `least_conn` picks the backend with the fewest current connections, good for services with highly variable request durations; `ip_hash` maps each client IP to a fixed backend, the laziest workable solution for session persistence; `random two` picks two machines at random and takes the one with fewer connections (the `least_time` variant requires the commercial edition). They all replace the default round-robin inside the upstream block and stack with server-level parameters like weight and max_fails.

## Test 3: A Backend Dies — Where Does the Traffic Go?

Stop 8083's listener to simulate an outage (it's still in the upstream list in the config), and with `max_fails=3 fail_timeout=30s` fire 12 requests:

```nginx
upstream backend {
  server 127.0.0.1:8081 max_fails=3 fail_timeout=30s;
  server 127.0.0.1:8082 max_fails=3 fail_timeout=30s;
  server 127.0.0.1:8083 max_fails=3 fail_timeout=30s;
}
```

Measured results:

![Figure 3](/images/csdn/figures/nginx-round-robin-csdn139346197-3.png)

The client got nothing but 200s — **failover is completely transparent to users**. Of the 12 requests, 8083 was actually attempted 3 times (requests 3, 5, and 8, matching three `connect() failed (111: Connection refused)` entries in error_log), and `$upstream_addr` recorded two segments like `8083, 8081`: try 8083 first, fail, immediately hand off to the next machine to answer. After 3 failures filled `max_fails=3`, 8083 was marked down: the last 4 requests never touched it, and it wasn't retried for 30 seconds. When the window expired, Nginx probed with a live request (indeed observed in the experiment), and on another failure the timer restarted — once the backend recovers, it automatically rejoins the rotation. That's the point of the max_fails/fail_timeout pair: **passive health checking**, using failure counts instead of active probes — good enough for small deployments.

## A Comparison Set: Configs That Are Easy to Get Wrong

**Mistake one: writing round-robin as if it were a directive**

```nginx
# Wrong: nginx has no round_robin directive
upstream backend {
  round_robin;
  server 127.0.0.1:8081;
}

# Right: writing nothing IS round-robin; the default is correct
upstream backend {
  server 127.0.0.1:8081;
}
```

Measured: `nginx -t` fails immediately with `unknown directive "round_robin"` — round-robin is the default behavior, not a directive; you won't find a syntax entry for it in the official docs either.

**Mistake two: assuming uneven observation means round-robin is broken** — that's the multi-worker trap from Test 1 above. Pin `worker_processes 1` or increase the request volume before drawing conclusions.

## Notes and Cautions

- **Session persistence**: for applications that need sessions pinned to one machine, round-robin is the wrong choice; consider `ip_hash` or externalizing session state to Redis.
- **Weight changes require a reload**: weight changes the request ratio and takes effect only after reloading the config; it is not a runtime dynamic adjustment. Watch for momentary jitter when adjusting production weights.
- **Slow-machine protection**: when performance gaps are large, level with weight, or throttle slow machines with `max_conns` to keep a slow node from dragging out the overall P99.
- **keepalive is not automatic**: for `keepalive 32` in an upstream to actually work, you must add both `proxy_http_version 1.1;` and `proxy_set_header Connection "";`, clearing the default HTTP/1.0 short-connection behavior (explicitly required by the official docs; reuse performance not separately measured in this post). Note it's a pool of idle per-worker connections to the backend, not a concurrency cap.
- **Backup machines**: `server ... backup;` takes no traffic normally and steps in only when all non-backup nodes are down (or removed). It and max_fails's passive ejection are two complementary layers — the former decides "who takes over," the latter decides "when a bad node leaves."

## Summary

Stringing the three tests together: round-robin itself is strictly sequential (barring the multi-worker observation artifact), weight levels out machine differences by ratio, and after an outage max_fails/fail_timeout passively ejects the bad node while failover stays invisible to users. The right posture for the default strategy: **use the default config with confidence; when distribution looks uneven, check your observation method first; wildly unequal performance and session stickiness are its real boundaries**. Before the next Nginx goes live, curl through these three behaviors once each — more reassuring than any documentation.

---

> This article was rebuilt from the author's CSDN blog posts published between 2020 and 2024, originally published on CSDN.
