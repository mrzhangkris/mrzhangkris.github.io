---
title: "Nginx map Module in Practice: Replacing if Branches with Variable Mapping"
date: 2024-05-30 15:19:33
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1640955785023-1854685dae05?w=1600&q=80&fm=jpg
updated: 2026-09-14
lang: en
---

It happens all the time when writing Nginx configs: one variable needs different handling depending on its value, and branching with a pile of ifs quickly makes the config unreadable — and Nginx's if inside a location is infamous (IfIsEvil), full of behavioral traps. The map module exists for exactly this scenario: it derives the value of one variable from the value of another, with the mapping table written centrally in a map block where the logic is plain at a glance.

This post verified four typical usages in an nginx/1.31.5 container: static lookups, regex mapping, canary traffic splitting, and hostnames wildcards — every configuration was actually run.

## Lab Environment

- nginx/1.31.5 (nginx:alpine container, self-tested with curl inside the container)
- Verification method: the map's result variable was echoed directly with `return 200` (in redirect scenarios the echo replaces a real 301, keeping redirect loops from interfering with observation)

## The Core Mechanism in One Sentence

map is defined at the http level and turns a "source variable → result variable" mapping into a table; the result is **lazily evaluated** — it does not traverse the table on every request, but computes once when a request actually uses the result variable, organized internally as a hash, so the overhead is tiny.

## Example 1: Static Mapping — Table-Driven Redirect by URL

The original scenario: compute a redirect target from $uri.

```nginx
http {
  map $uri $redirect_url {
    /old-page   /new-page;
    /about      /about-us;
    default     /not-found;
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      return 301 $redirect_url;
    }
  }
}
```

A request for /old-page redirects to /new-page; /about redirects to /about-us; any other URL falls to the default branch's /not-found. In testing, return 301 was replaced by the echo to observe the mapping result:

![Static map lookup, verified](/images/csdn/figures/nginx-map-csdn139325428-1.png)

The whole redirect table is those three lines in the map block — editing the table beats editing a pile of ifs by a mile. This is map's core advantage over if: data and logic separated, and adding a rule is adding a line.

## Example 2: Regex Mapping — Classifying Devices by User-Agent

When a map's source value starts with `~` it is a regex (case-sensitive); `~*` is case-insensitive:

```nginx
map $http_user_agent $is_mobile {
    ~*(android|iphone|mobile)  1;
    default                    0;
}
```

Requests with two kinds of UA, verified:

![Regex map, verified](/images/csdn/figures/nginx-map-csdn139325428-2.png)

Mobile UAs got 1 and desktop got 0; downstream config can use `if ($is_mobile)` directly or feed $is_mobile into access_log as a marker field — the "judgment" is collapsed into the map, and the location only "uses" it.

## Example 3: Canary Splitting — Choosing a Backend by Cookie

The classic canary-release move: users carrying a particular cookie route to the new version. The `$cookie_XXX` variable reads any cookie's value directly as a mapping source:

```nginx
map $cookie_version $backend {
    v2       http://127.0.0.1:8081;
    default  http://127.0.0.1:8080;
}

server {
    location / {
        proxy_pass $backend;
    }
}
```

Requests with and without a `version=v2` cookie, verified:

![Cookie canary split, verified](/images/csdn/figures/nginx-map-csdn139325428-3.png)

A tester sets their cookie to v2 and lands in the new version; ordinary users follow default into the old one — the canary list shifts from "edit the config file and reload" to "issue a cookie," which the ops side can control.

## Example 4: hostnames Wildcards — Table Lookup by Domain

After adding the `hostnames` parameter in a map block, source values match by hostname rules, supporting `*` wildcard prefixes and `.` wildcard suffixes:

```nginx
map $http_x_flag $out {
    hostnames;
    a.example.com   "hit-a";
    *.example.com   "hit-wildcard";
    default         "miss";
}
```

Three different values, verified (passed in via the X-Flag request header):

![hostnames wildcard, verified](/images/csdn/figures/nginx-map-csdn139325428-4.png)

Useful for routing multi-tenant traffic by domain and for whitelist domain checks. Note that in hostnames mode **exact matches take precedence over wildcards**, and a wildcard may only appear at the start (`*.example.com`) or the end (`www.example.*`) — double-sided wildcards like `*example*` are not allowed.

## Style Essentials

- A map block can only be defined at the **http level**, never inside server/location;
- Each line reads `source value mapped value;`, and the mapped value may contain variables (e.g. `"/go/$1"` combined with regex capture groups);
- The `default` line defines the fallback — **without a default, the fallback is an empty string**, and downstream instructions handed an empty value often behave unexpectedly; always write default explicitly;
- A source value starting with `~`/`~*` is a regex, otherwise it matches as an exact string (wildcards supported in hostnames mode);
- Multiple map blocks may be defined, with result variable names globally unique;
- Result variables are lazily evaluated: computed only when a request uses them, not at all otherwise.

## The Wrong Way: if Inside location for the Same Logic

A typical if pattern that map can replace:

```nginx
location / {
    if ($http_user_agent ~* "android|iphone") {
        set $mobile 1;
    }
    # ... then branch on $mobile
}
```

Two problems: first, if inside a location is a rewrite-module directive, and combined with directives other than set/rewrite (proxy_pass, try_files) its behavior turns erratic — the official wiki's dedicated page "If is Evil" has a long accident list; second, the same judgment logic is scattered across every location, and changing one spot means searching the whole file. map gathers the mapping into one table at the http level, locations only read variables, and both problems vanish. **Principle: any value-to-value logic that map can express, if should not.**

## Caveats

- map is defined at the http level and takes effect globally; don't let result variable names collide with built-in variables or other modules' variables (a collision makes nginx -t fail outright — which is at least a good way to fail).
- The original article said "map matches on every request, and too many rules may hurt performance" — more precisely: the result variable is computed only when used; string keys hash in O(1), regex keys are tried in order one by one. Performance only becomes a concern with large tables full of regexes; a pure string mapping of a few thousand entries is no strain.
- Test mapping rules carefully before shipping, especially the default branch — a missing default falls back to an empty string, and `return 301 $redirect_url` becomes a redirect to an empty address.
- When mapping rules change frequently (daily), consider putting the table into an include'd separate file and `nginx -s reload` for a smooth effect; beyond that frequency you want Lua (OpenResty) or an external config center — don't use map as dynamic configuration.
- The fastest way to verify map behavior is this post's echo method: `return 200 "$variable"`, one curl and you see it, no guessing.

The essence of the map module is "turning branching logic into a data table": static lookups, regex, wildcards, and cookie reads — four verified usages covering the vast majority of scenarios. Remember three iron rules — define at http level, always write default, map over if when possible — and your config stays both short and steady.

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
