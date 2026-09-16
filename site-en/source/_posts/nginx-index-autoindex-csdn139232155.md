---
title: "Nginx index and autoindex Modules: Default Homepages and Directory Listings, Tested"
date: 2024-05-27 10:44:21
lang: en
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1562408590-e32931084e23?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

When deploying a site with Nginx, directory access comes down to two questions: when a user visits a directory, which file gets returned first? And when the directory has no default file, does Nginx answer with 403, 404, or a file listing? The first question belongs to the index module, the second to the autoindex module. Misconfigure these two and the most common symptom is a homepage that returns 403 out of nowhere. This article covers both modules' directives side by side, with container tests showing order-based hit resolution, a 403 in the wild, and the listing effect.

## Experiment Environment

nginx/1.31.5 container (docker image `nginx:alpine`, a throwaway container, deleted after use), site root at the image's default `/usr/share/nginx/html`, configuration in `conf.d/default.conf`, `nginx -s reload` after every round of changes, and curl inside the container for verification.

## Each Module Answers One Question

The core mechanism in one sentence: **the index module decides the "directory → default file" mapping; the autoindex module decides "when there is no default file, whether the directory itself should have its contents listed".**

The two modules are often mentioned together, but their responsibilities are entirely different: index is a mapping rule, answering "when `/` is requested, which file is actually read"; autoindex is a fallback switch that only kicks in for "a directory request that found none of the files index specified". Once you understand this division of labor, you won't confuse which directive to tune when the homepage 403s — a 403 means index found no file, and autoindex is either off or you didn't dare turn it on.

## Example 1: index Hits in Order

The index directive defines a directory's default files; you can list several, and Nginx searches in the written order, returning the first file that exists:

```nginx
server {
  listen 80;
  server_name example.com;

  root /usr/share/nginx/html;

  index index.html index.htm;

  location / {
    try_files $uri $uri/ =404;
  }
}
```

What "in order" really means is clearest with a test. Put two files in the site root, each containing one recognizable line:

![index directive order-based hit test](/images/csdn/figures/nginx-index-autoindex-csdn139232155-1.png)

In the first round both files exist and the one listed first, `index.html`, wins; delete it and request again, and `index.htm` is hit. The `$uri/` in `try_files $uri $uri/ =404` is exactly where the index module gets triggered — when a request lands on a directory, it is handed to the index directive to keep searching for the default file.

Beyond the site homepage, this "ordered lookup" has a practical trick: multilingual sites arrange default files by priority, `index index.en.html index.fr.html index.html;`, so a missing language version automatically falls back to the default version.

## Example 2: A 403 in the Wild — All Default Files Gone

Delete every file from Example 1 and request the same directory to see what Nginx gives:

![403 scene and autoindex switch test](/images/csdn/figures/nginx-index-autoindex-csdn139232155-2.png)

The first line of output is how most people meet 403 for the first time: **the directory exists, autoindex is off (the default), Nginx refuses to list contents and returns 403 Forbidden — not 404**. 404 means "the resource does not exist"; 403, in this context, means "the directory is there, but I'm not telling you what's inside" — the semantics are correct, it just scares people who aren't familiar with it.

In the second configuration, with autoindex turned on, the same directory returns the file listing. This is also the fixed routine for debugging 403s: first confirm whether the request is a directory and whether the directory contains the default file index specifies, then decide whether to add the file or turn on the listing.

## Example 3: autoindex's Two Auxiliary Parameters

autoindex has three directives in total; besides the main switch `autoindex on|off`, there are two modifiers:

- `autoindex_localtime on|off`: the timezone of file times in the listing. Default off shows UTC, on shows the server's local time;
- `autoindex_exact_size on|off`: the display format of file sizes. Default on shows exact byte counts, off rounds to K/M/G.

Write out the full configuration, drop in a large file, and look at the effect:

```nginx
server {
  listen 80;
  server_name files.example.com;

  root /var/www/files;

  location / {
    autoindex on;
    autoindex_localtime on;
    autoindex_exact_size off;
  }
}
```

Tested against a directory with mixed file sizes, watching the size column's display pattern:

![autoindex_exact_size off display pattern test](/images/csdn/figures/nginx-index-autoindex-csdn139232155-3.png)

The pattern deserves its own note: **off does not round everything**. In the test, a 1500-byte file still displayed `1500`, while 2.5MB (2621440 bytes) displayed `3M` and 488KB displayed `488K` — Nginx's rule is that files under 10KB keep exact byte counts, and only beyond that get rounded to K, M (2.5MB rounding to 3M is the evidence; this behavior deviates from the official documentation's "rounded to kilobytes" wording — it is test-confirmed). For a download site where you want visitors to see magnitudes at a glance, off fits; for checksum comparison, on is safer.

## Two Typical Wrong Configurations

**Mistake one: the requested file 404s, so you turn on autoindex**

```nginx
# Wrong: autoindex only affects directory requests; it cannot save a nonexistent file path
location / {
  autoindex on;   # Turned on, yet /missing.html still 404s
}

# Right: a missing file path calls for a fallback, not a directory listing
location / {
  try_files $uri $uri/ /index.html;
}
```

What's wrong: autoindex intervenes only when "the request ends with `/` and lands on a real, existing directory". Visiting a nonexistent file path never reaches the directory layer, so autoindex does nothing — and meanwhile exposes the directory for free.

**Mistake two: autoindex bare on a sensitive directory**

```nginx
# Wrong: the backup directory is fully public; any visitor can browse and download
location /backup {
  autoindex on;
}

# Right: if you really need a listing, put authentication or access control in front first
location /backup {
  autoindex on;
  auth_basic "restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;
}
```

What's wrong: once autoindex is on, every file under the directory (including ones you didn't realize could be scanned) enters the public listing — effectively handing a filename inventory to scanners. If a listing is genuinely needed, put at least auth_basic or allow/deny in front.

## Notes

- **Security before convenience**: autoindex is a double-edged sword; don't enable it on sensitive directories in production. When you must, tighten with auth_basic or allow/deny, and confirm the directory contains no keys, backups, logs, or the like.
- **Large directories have overhead**: autoindex scans the directory in real time and generates HTML on every request; directories with tens of thousands of files show perceptible latency on every listing — for those, switch to a pre-generated index or stop offering listings publicly.
- **Distinguish 403 from 404**: a 403 on a directory request means check whether the index default file exists and whether autoindex is on; a 404 means the path itself doesn't exist or a `try_files` fallback branch was hit. The two debug in different directions.
- **The listing page is plain**: autoindex's generated HTML is minimal, with no sorting or search. For public downloads, third-party modules like fancyindex or a frontend static index page are the common upgrade path.

## Summary

Back to the opening's two questions: which file a directory returns first is decided by the index directive in order — the test confirmed "earlier in the list wins"; and what gets served when no default file exists is decided by autoindex — off means 403, on means a file listing, with rounding display carrying subtle rules that differ by file size. Next time your homepage 403s, don't rush to restart — check whether the index file is missing or autoindex is off.

> This article was restructured from the author's 2020-2024 CSDN blog posts, originally published on CSDN.
