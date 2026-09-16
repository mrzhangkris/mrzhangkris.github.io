---
title: "Nginx root vs alias: One Appends, the Other Replaces"
date: 2024-05-13 15:27:15
updated: 2026-09-14
categories: [Tech, Nginx]
lang: en
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1697577418970-95d99b5a55cf?w=1600&q=80&fm=jpg
---

When configuring static file serving, both `root` and `alias` tell Nginx which directory on the filesystem to look in. The two directives look alike but do different jobs, and the consequence of confusing them is immediate: a 404, or a file that isn't the one you wanted at all. The most classic failure scene: the config looks right from every angle, yet error_log holds a path you never wrote.

This article is organized around hands-on configuration: first the lab environment, then three sets of configs with real output demonstrating the "append" and "replace" behaviors, followed by live tests of the two easiest path-joining traps. All outputs are actual results from nginx/1.31.5.

## Lab Environment

Everything is reproducible inside a container:

- nginx/1.31.5 (docker image `nginx:alpine`);
- Document directory `/usr/share/nginx/html` (containing `index.html` and `images/logo.png`, with contents INDEX and LOGO respectively);
- A separate resource directory `/data/uploads/logo.png` (content UPLOAD) for alias mapping;
- Config mounted at `/etc/nginx/conf.d/`, reload after changes, verified with curl inside the container.

## The Mechanism in One Sentence: root Appends, alias Replaces

The entire difference between the two directives condenses into one sentence: **root appends the full URI after itself; alias replaces the location-matched prefix with itself**. root can be written at any level—http, server, or location; alias can only be written inside a location. Once root is set in the server block, all internal locations inherit that value unless they write their own to override it—an inheritance rule just like most value-type Nginx directives: the nearest declaration wins.

## Example 1: root, URI Concatenated As-Is

The typical setup when the site's document root is `/var/www/html`:

```nginx
server {
  listen 80;
  server_name example.com;

  root /usr/share/nginx/html;

  location / {
    try_files $uri $uri/ =404;
  }
}
```

Request `/images/logo.png`, and Nginx looks for `/usr/share/nginx/html` + `/images/logo.png`:

![Figure 1](/images/csdn/figures/nginx-root-alias-csdn138805077-1.png)

Note that the concatenation is "as-is": whatever the URI looks like, that's what gets appended, with nothing stripped. That's why root has a low mental burden—URL structure and disk structure are exactly the same. This property also means that swapping root inside a sub-path location still carries the prefix along: `location /static/ { root /data; }` reads `/data/static/a.png` for `/static/a.png`, not `/data/a.png`. The "strip the prefix" semantics is alias's job—which is exactly the next section.

## Example 2: alias, the Matched Prefix Gets Replaced

You want `/images` in the URL to map to `/data/uploads` on disk without exposing the real directory name in the URL:

```nginx
server {
  listen 81;
  server_name localhost;
  root /usr/share/nginx/html;

  location / {
    try_files $uri $uri/ =404;
  }

  location /images/ {
    alias /data/uploads/;
  }
}
```

Same URI `/images/logo.png`, but this time we get UPLOAD—alias took effect:

![Figure 2](/images/csdn/figures/nginx-root-alias-csdn138805077-2.png)

Reading the result: the `/images/` prefix matched by the location was replaced with `/data/uploads/`, so the actual read is `/data/uploads/logo.png`. There's another easily missed behavior here: `location /images/` has a longer prefix than `location /` and wins the priority, so **the same-named LOGO under html/images is completely shadowed**—once the alias location matches, the root rules are entirely off the table for this request.

## Example 3: Regex Locations Require a Capture Group

For cases prefix matching can't cover (say, filenames needing regex processing), use a regex location with alias:

```nginx
location ~ ^/images/(.+)$ {
  alias /data/uploads/$1;
}
```

Tested with `/images/logo.png`, which returned UPLOAD normally:

![Figure 3](/images/csdn/figures/nginx-root-alias-csdn138805077-3.png)

The `$1` here is not optional: inside a regex location, alias **must** reference a capture group—omit it and Nginx errors out at startup, and the config never passes `nginx -t`.

## When to Use Which

There's exactly one criterion: **are the URL structure and the disk structure the same**.

If they match (the vast majority of static sites), use root—declare it once in the server block and it applies globally, the URL is the path, and the mental burden is lowest. Use alias only when they don't: resources live outside the document root (say, dynamically generated reports land in their own directory), or you want to hide the real directory structure (a URL exposing directory names like `/backups/` is practically handing scanners a checklist). alias's replacement mechanism exists precisely for this "URL looks one way, disk looks another" need; the price is that you have to watch the joining rules yourself—the next two sections are all about its traps.

## Wrong Configuration: Mismatched Trailing Slashes, Paths Fuse Together

alias's most classic trap—a location with a trailing slash but an alias value without one:

```nginx
# Wrong: alias is missing the trailing /
location /images/ {
  alias /data/uploads;
}

# Right: both sides end with /, aligned
location /images/ {
  alias /data/uploads/;
}
```

Tested, the wrong version 404s directly, and the path in error_log cuts straight to the point:

![Figure 4](/images/csdn/figures/nginx-root-alias-csdn138805077-4.png)

`/data/uploads` + `logo.png` = `/data/uploadslogo.png`—the remainder after the location strips `/images/` gets glued straight onto the alias value, missing the separator in between. This is the value of "check error_log first when debugging path issues": Nginx prints the full path it actually attempted, and whether the join is right is obvious at a glance.

The reverse misalignment (no slash on the location, slash on the alias) returned 200 in testing—the remainder `/logo.png` produced `/data/uploads//logo.png`, and the filesystem tolerated the double slash. **Working doesn't mean correct**: directory-level semantics depend on slash alignment, and keeping both sides consistent is what keeps you from blowing up in other environments.

## Field Test: The Truth About try_files with alias

Old community posts often claim "try_files joins the wrong path under alias." Tested on nginx/1.31.5:

```nginx
location /images/ {
  alias /data/uploads/;
  try_files $uri =404;
}
```

Existing files returned 200, missing files fell back to 404 correctly. With error_log at debug level (the official image ships an `nginx-debug` binary), requesting a path that certainly doesn't exist produced a log stating the checked path was `/data/uploads/nope.png`—single slash, assembled under "prefix replacement" semantics; the old behavior of joining a double-slash wrong path no longer exists in this version. But when you reuse the config on older versions, don't assume it's correct—turning on debug logging, or simply curling a path that certainly doesn't exist to verify the behavior, is a fixed pre-deployment step.

![Figure 5](/images/csdn/figures/nginx-root-alias-csdn138805077-5.png)

## Things to Watch Out For

- **Align trailing slashes on both sides**: the location and the alias value should both end with `/` (or neither). Misalignment at best fuses paths into 404s (tested above), at worst produces erratic behavior in configs with directory semantics.
- **alias in a regex location must reference the capture group**: `alias /data/uploads/$1;`—omitting it is a startup error; reference as many capture groups as you wrote, don't go from memory.
- **alias can only be written inside a location**, while root works at all four levels; use root for a site-wide uniform root directory, alias for mapping outlying locations.
- **Regex locations outrank plain prefix locations**: `location ~ ^/images/(.+)$` will steal requests from `location /images/` (unless the latter adds the `^~` modifier); don't let two rules both be able to hit the same resource.
- **An alias location shadows root**: once it matches, root is entirely ineffective for that request (tested above); when debugging "the file is clearly there but can't be read," first check whether an alias intercepted it.
- **Turn on error_log first when debugging path issues**: the path inside `open() "..." failed` is the exact path Nginx actually assembled, and 90% of root/alias problems surface in that one line.

## Summary

Back to the opening scene of "the config looks right from every angle, yet error_log holds an unfamiliar path": root appends the full URI after the root directory, while alias replaces the location prefix with the target path—once you understand "append vs replace," a fused path like `/data/uploadslogo.png` immediately reveals a missing slash. After writing the config, make two fixed moves: pass `nginx -t` for syntax, then curl one existing path and one path that certainly doesn't exist, and cross-check the full attempted path in error_log. That intercepts every path-joining trap before go-live.

---

> This article was rewritten from the author's CSDN blog posts originally published between 2020 and 2024.
