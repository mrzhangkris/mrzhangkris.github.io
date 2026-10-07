---
title: "Nginx Rate Limiting in Practice: limit_req and limit_conn — When They Fire and How to Configure Them"
date: 2024-05-22 10:06:41
lang: en
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1580584126903-c17d41830450?w=1600&q=80&fm=jpg
---

In high-traffic scenarios, without constraints on clients a single runaway crawler can drag the backend down. Nginx provides two gates: limit_req throttles request frequency, and limit_conn caps concurrent connections. They look similar but police different dimensions — one governs "how many per second," the other "how many at the same time." This post explains when the two modules fire and how to configure them, and uses nginx/1.31.5 container tests to capture three typical behaviors: burst pass-through, strict rate-limit rejection, and concurrent-connection over-limit.

## Test Environment

- nginx/1.31.5 (nginx:alpine container)
- All tests ran inside the container itself (curl hitting 127.0.0.1), no port mapping
- limit_rate used to artificially slow responses and create a real concurrent-connection scenario

## The Core Mechanism in One Sentence

limit_req is built on a **token bucket**: tokens are added to the bucket at a steady rate defined by `rate`; each request takes one token, and a request that finds none is rejected. `burst` is the bucket's extra capacity, letting tokens accumulated over a short while be spent in one go. limit_conn is built on **live counting**: it tracks how many active connections a key (usually the client IP) currently holds and rejects new ones past the threshold.

## limit_req: Throttling Request Frequency

### Configuration

`limit_req_zone` declares a shared memory zone (http level only), and `limit_req` activates it at a specific location (http/server/location):

```nginx
http {
  # $binary_remote_addr as key, zone=one:10m allocates 10MB of shared memory, rate=1r/s means 1 request per second
  limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;

  server {
    listen 80;
    location /api/ {
      limit_req zone=one burst=5 nodelay;
      proxy_pass http://backend_service;
    }
  }
}
```

Parameter meanings:
- **zone=one**: references the shared memory zone named one
- **burst=5**: allows a burst of 5 requests through the queue
- **nodelay**: burst requests are handled immediately, without queueing delay

### Test 1: burst=5 nodelay, Firing 10 Requests at Once

rate=1r/s with burst=5 nodelay, 10 requests fired in an instant:

![burst=5 nodelay, 10-request volley, live test](/images/csdn/figures/nginx-limit-req-limit-conn-csdn139112232-1.png)

The result matches the token bucket model exactly: the bucket starts with 1 current token + 5 burst tokens = 6; the first 6 requests pass immediately (200), and from the 7th on, tokens are exhausted and requests are rejected (503). That is precisely what nodelay means — requests within the burst allowance are not queued but handled on the spot.

### Test 2: No burst, Strict 1r/s

Remove burst, leaving only `limit_req zone=one;`, fire 10 in a row, then one per second:

![Strict rate limiting without burst, live test](/images/csdn/figures/nginx-limit-req-limit-conn-csdn139112232-2.png)

Without burst the token bucket's capacity is zero and only the current rate counts: in the rapid series only the first request got a token; the rest all got 503. The one-per-second requests, replenished with a token each second, all passed. Comparing with Test 1 shows that burst's whole role is "how much burst to tolerate."

**Processing phase**: limit_req fires in the preaccess phase — and there is a classic trap here: if the same location contains a `return` directive, return executes earlier in the rewrite phase and limit_req never runs at all (see "Wrong Configuration").

## limit_conn: Capping Concurrent Connections

### Configuration

```nginx
http {
  limit_conn_zone $binary_remote_addr zone=addr:10m;

  server {
    location /api/ {
      limit_conn addr 10;   # At most 10 concurrent connections per client IP
      proxy_pass http://backend_service;
    }
  }
}
```

### Test 3: limit_conn=2 with 4 Concurrent Slow Requests

Concurrent-connection limits are awkward to test — a fast request's connection closes instantly, so you can't count "how many at once." Using `limit_rate 20k` slows the download of a 200KB file, letting 4 connections truly coexist:

![limit_conn over-limit, live test](/images/csdn/figures/nginx-limit-req-limit-conn-csdn139112232-3.png)

With `limit_conn addr 2`, only 2 of the 4 concurrent requests got a connection (200) and the other 2 were rejected immediately (503). Note that requests 1/2 passed and 3/4 were rejected — whoever establishes the connection first claims the quota, regardless of the order the requests were written in; this is exactly what concurrency contention looks like in reality.

**Processing phase**: limit_conn likewise fires in the preaccess phase, counting against the config the moment a connection is established.

## Logging and Status Codes

Rate limiting should leave traces; two directives control that:

- **limit_conn_log_level**: the log level when a connection is limited — info/notice/warn/error; warn recommended
- **limit_conn_status**: the status code returned when a connection is limited — default 503, customizable

limit_req's counterparts are limit_req_log_level and limit_req_status, used the same way.

## Wrong Configuration: return Bypasses limit_req

A high-frequency pitfall — wanting `return` for health checks or static responses while limit_req hangs in the same location:

```nginx
location /api/ {
    limit_req zone=one burst=5;
    return 200 "ok";   # Wrong: return executes earlier, in the rewrite phase
}
```

`return` belongs to the rewrite module and short-circuits during the rewrite phase; limit_req, living in the preaccess phase, never gets to run — the rate limit is decoration, and requests at any frequency get a 200. To verify limit_req actually works, the backend must be real content processing (a static file or proxy_pass) so the request actually reaches the preaccess phase. This is exactly why all three tests above used static files / slow downloads instead of return.

## Complete Configuration Example

Combining frequency limiting, connection limiting, log level, and status codes:

```nginx
http {
  limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;
  limit_conn_zone $binary_remote_addr zone=addr:10m;

  limit_conn_log_level warn;
  limit_conn_status 503;

  server {
    listen 80;
    server_name example.com;

    location /api/ {
      limit_req zone=one burst=5 nodelay;
      limit_conn addr 10;
      proxy_pass http://backend_service;
    }
  }
}
```

Both zones are declared at the http level for global reference; limit_req and limit_conn attach inside the location; when a limit fires, a warn log is written and 503 returned.

## Caveats

- `limit_req_zone` / `limit_conn_zone` may only be declared at the http level; `limit_req` / `limit_conn` are what take effect when attached to server or location. Declaration on one layer, use on another — the mix-up newbies hit most.
- `$binary_remote_addr` saves memory over the textual `$remote_addr` (fixed 4/16 bytes); it's the usual choice of key.
- rate is the average rate, burst decides how much burst is tolerated, and nodelay decides whether burst requests are handled immediately or queued — the three combine into very different limiting feels. Tune to your business traffic; clamping too hard hurts legitimate users.
- limit_req polices frequency, limit_conn polices concurrency; the two are orthogonal and usually deployed together: frequency against flooding, concurrency against hogging.
- A limit firing returns 503 by default and logs it; in production, wire limit_*_status into monitoring and alerting — a sudden spike in 503s usually means you are being flooded or capacity is running out.
- To verify rate limiting actually works, don't use `return` (it gets bypassed); use a static file or proxy_pass so requests reach the preaccess phase.

Two gates, two ends: limit_req uses a token bucket to flatten request-frequency spikes, and limit_conn uses live counting to clamp the concurrent-connection ceiling. Remember that both fire in the preaccess phase and both fear being short-circuited by return; keep zone declarations at the http level and activation at the location level, and rate limiting won't go wrong.

> This post was rewritten from the author's CSDN blog articles originally published between 2020 and 2024 on CSDN.
