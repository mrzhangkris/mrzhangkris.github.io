---
title: "The Nginx mirror Module: A Practical Guide to Traffic Mirroring"
date: 2024-05-26 09:15:00
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1515630278258-407f66498911?w=1600&q=80&fm=jpg
updated: 2026-09-14
lang: en
---

Want to replay production traffic in a real environment without affecting users? That is exactly what Nginx's mirror module does: every incoming request, in addition to going to the primary backend, gets a copy forwarded to one or more mirror backends. The mirror request's response is discarded outright, and the client never notices a thing. This post covers what the mirror module is for, how to configure it, and the common pitfalls.

## What the mirror Module Is For

The mirror module mirrors client requests to a set of backend servers: the request is not only passed to the primary backend, it is also copied and sent to additional backends. Three typical needs:

- **Testing and debugging**: mirror production traffic into a test environment and use real traffic for debugging and performance testing.
- **Data analysis**: mirror traffic to a dedicated analytics backend for real-time collection and analysis, without touching main-service performance.
- **Migrations and upgrades**: when migrating to a new system or upgrading the existing one, verify that the new system can absorb the same traffic and load.

## Use Cases

- **Security testing**: run security tests and vulnerability analysis without touching the production system.
- **Traffic monitoring**: monitor and analyze production traffic in real time.
- **Performance tuning**: compare different configurations under load in a test environment.

## Lab Environment

- nginx/1.31.5 (nginx:alpine container)
- Primary backend 127.0.0.1:8081, mirror backend 127.0.0.1:8082 (both plain nginx `return` inside the container, with separate access logs)
- Verification method: send one request from the client, then compare the two backends' logs — whether the copy arrived and what the URI became is plainly visible in the logs

The core mechanism in one sentence: the mirror directive makes Nginx fire an extra **subrequest** to a designated location for every matching request; the subrequest's response is discarded, and the client only ever sees the primary backend's response.

## Caveats First

- **Resource consumption**: mirrored traffic adds load to the network and to backend servers; assess the performance impact before going live.
- **Data privacy**: mirrored traffic may carry sensitive data; make sure you don't violate privacy policies or data-protection regulations.
- **Result reliability**: mirror request responses never reach the client, so user experience is unaffected; but if the mirror side errors out, don't misread it as a problem in the primary path.

## A Basic Example

The mirror module is included in a default Nginx build; if you compile custom, first confirm the module is present.

```nginx
http {

  # Define the mirror backend server
  upstream mirror_backend {
    server mirror.example.com;
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      # Configure the primary backend
      proxy_pass http://main_backend;

      # Mirror the request conditionally
      if ($http_mirror_enabled = "true") {  # HTTP header match goes here
        mirror /mirror;
      }
    }

    # Mirror location
    location /mirror {
      internal;  # Marks this location as callable only from inside Nginx

      # Send mirror requests to the mirror backend server
      proxy_pass http://mirror_backend;
    }
  }
}
```

> Note: the source material wrote the variable here as `$http_mirror-enabled`. Nginx variable names contain no hyphens, so it has been conservatively corrected to `$http_mirror_enabled` (corresponding to the `Mirror-Enabled` header, with hyphens mapped to underscores).

Block-by-block explanation:

- **upstream mirror_backend**: defines the backend server that receives mirror requests.
- **location /**: the main request handler; whether a request is mirrored depends on the value of the `Mirror-Enabled` header.
- **mirror**: designates the path that handles mirror requests; when the header value is true, the request is mirrored to /mirror.
- **location /mirror**: declared internal, callable only by Nginx itself; mirror requests are forwarded to mirror_backend here.

The HTTP header match guarantees that only requests meeting the condition get mirrored, rather than blindly copying everything.

The configured behavior, verified in practice — one request to the main entry, and here is what each backend's log recorded:

![Mirror basic behavior, verified: one request, two logs](/images/csdn/figures/nginx-mirror-csdn139179059-1.png)

Two details worth noting: the client's response comes from the primary backend (MAIN-BACKEND), while the mirror side's response is discarded; and the mirror subrequest's URI is **the path the mirror directive points at** (/mirror), not the original URI (/api/test) — but **query parameters are preserved as-is** (?q=1). If the mirror backend wants the original path, it must read it from a header or the logs; $uri won't give it.

## What the internal Directive Does

internal is a critical piece of a mirror setup: once a location is marked internal, it can only be invoked from inside Nginx; external clients cannot reach it directly. This guarantees mirror requests originate only within Nginx, which both improves security and keeps /mirror from being hit directly by bad actors. Verified in practice:

![internal in effect, verified: external direct hit on /mirror rejected](/images/csdn/figures/nginx-mirror-csdn139179059-2.png)

### Extension: Mirroring by Path and Parameter

Besides matching on headers, you can restrict to a path and inspect URL arguments:

```nginx
http {

  upstream main_backend {
    server main.example.com;
  }

  upstream mirror_backend {
    server mirror.example.com;
  }

  server {
    listen 80;
    server_name example.com;

    location /api/v1/ {  # Restrict matching to a specific path
      proxy_pass http://main_backend;

      # Mirror only when the request carries a `mirror=true` argument
      if ($arg_mirror = "true") {
        mirror /mirror-api;
      }
    }

    # Other paths: no mirroring, plain proxying only
    location / {
      proxy_pass http://main_backend;
    }

    location /mirror-api {
      internal;
      proxy_pass http://mirror_backend;
    }
  }
}
```

Only requests hitting /api/v1/ with a mirror=true argument trigger mirroring; every other path is proxied as usual. The condition granularity can be refined further to fit your business.

## Mirror Logs

Mirrored traffic needs logs of its own, otherwise a problem on the mirror side is impossible to analyze. Give mirror requests a dedicated log:

```nginx
http {
  log_format mirror '$remote_addr - $remote_user [$time_local] "$request" '
    '$status $body_bytes_sent "$http_referer" '
    '"$http_user_agent" "$http_x_forwarded_for"';

  access_log /var/log/nginx/mirror_access.log mirror;

  upstream main_backend {
    server main.example.com;
  }

  upstream mirror_backend {
    server mirror.example.com;
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      proxy_pass http://main_backend;

      if ($http_x_mirror_enabled = "true") {
        mirror /mirror;
      }
    }

    location /mirror {
      internal;
      proxy_pass http://mirror_backend;
    }
  }
}
```

Mirror request logs land in /var/log/nginx/mirror_access.log. Note this example matches the `X-Mirror-Enabled` header, whose variable is `$http_x_mirror_enabled`.

## Advanced Mirror Conditions

### Mirror by Request Method

Mirror only write requests such as POST/PUT and ignore GET:

```nginx
location / {
  proxy_pass http://main_backend;

  if ($request_method = POST) {
    mirror /mirror-post;
  }
}

location /mirror-post {
  internal;
  proxy_pass http://mirror_backend;
}
```

(The upstream definitions in the http block are the same as in the previous example and are omitted here.)

### Mirror by User Agent

Combine with the map module to detect mobile clients and mirror only requests from mobile devices:

```nginx
http {

  upstream main_backend {
    server main.example.com;
  }

  upstream mirror_backend {
    server mirror.example.com;
  }

  map $http_user_agent $is_mobile {
    default 0;
    "~*Mobile" 1;
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      proxy_pass http://main_backend;

      if ($is_mobile) {
        mirror /mirror-mobile;
      }
    }

    location /mirror-mobile {
      internal;
      proxy_pass http://mirror_backend;
    }
  }
}
```

### Mirror by Request Path

Match traffic to specific paths with a regex:

```nginx
location / {
  proxy_pass http://main_backend;

  if ($request_uri ~* "^/special-path/") {
    mirror /mirror-special;
  }
}

location /mirror-special {
  internal;
  proxy_pass http://mirror_backend;
}
```

### Monitoring and Alerting

Wire mirrored traffic into your monitoring stack:

1. **Log analysis**: parse Nginx access logs (including the mirror log) with Logstash, store them in Elasticsearch, and search/analyze there.
2. **Monitoring and alerting**: collect Nginx metrics with Prometheus, build dashboards and alert rules in Grafana, and fire an alert when mirror request volume exceeds expectations.

## Performance Tuning and Load Management

Mirroring amplifies backend load; the techniques below keep the cost under control.

### Enable Caching for the Mirror Path

```nginx
http {
  proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=1g inactive=60m use_temp_path=off;

  upstream main_backend {
    server main.example.com;
  }

  upstream mirror_backend {
    server mirror.example.com;
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      proxy_pass http://main_backend;

      if ($http_mirror_enabled = "true") {
        mirror /mirror;
      }
    }

    location /mirror {
      internal;
      proxy_cache my_cache;
      proxy_pass http://mirror_backend;
    }
  }
}
```

### Adjust Mirror Conditions Dynamically

Using variables and conditional statements, mirroring can be controlled dynamically against real-time needs — for example, toggling mirroring on and off based on system load.

### Throttle Mirror Traffic with limit_req

```nginx
http {
  limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;

  upstream main_backend {
    server main.example.com;
  }

  upstream mirror_backend {
    server mirror.example.com;
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      proxy_pass http://main_backend;

      if ($http_mirror_enabled = "true") {
        mirror /mirror;
      }
    }

    location /mirror {
      internal;
      limit_req zone=one;
      proxy_pass http://mirror_backend;
    }
  }
}
```

## Common Problems and Fixes

**The mirror server collapses under high concurrency**: use limit_req to cap mirror requests per second; configure multiple mirror servers in the upstream to share the load.

**Mirror results don't match the original request**: make sure the mirror request and the original request run under identical environment configuration; compare via logs and pin down the cause of the mismatch.

**Mirrored traffic slows down production**: mirror only when necessary and use conditional statements for fine-grained control; use caching to reduce the load from mirror requests.

## Best Practices

1. **Plan and assess up front**: before implementing mirroring, evaluate its impact on overall system performance.
2. **Fine-grained control**: gate mirroring on request method, path, user agent, and similar conditions to avoid pointless mirror traffic.
3. **Security**: mirror requests may contain sensitive data; handle them properly and follow data privacy and compliance requirements.
4. **Monitoring and logs**: watch mirror traffic in real time and analyze logs to catch potential problems early.
5. **Ramp up gradually**: for major changes, increase mirrored traffic step by step and verify effectiveness and stability — don't flip a large-scale switch all at once.

## Points to Watch

- The mirror path must be declared `internal`, otherwise outsiders can hit the mirror entry directly.
- Mirror request responses never go back to the client; never make any primary-path decision based on the mirror side's response.
- Be careful with variable names: Nginx variables have no hyphens; the `Mirror-Enabled` header corresponds to `$http_mirror_enabled`.
- Mirroring is an amplifier — keep at least one of conditions, caching, and rate limiting in place, or the mirror backend will be the first thing to buckle at traffic peaks.

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
