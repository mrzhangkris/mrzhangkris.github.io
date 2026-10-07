---
title: "Nginx autoindex: Making Directories Directly Browsable in the Browser"
date: 2024-05-13 15:42:16
updated: 2026-09-14
lang: en
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1639066648921-82d4500abf1a?w=1600&q=80&fm=jpg
---

You have a batch of files on a server you want colleagues to browse directly, without writing any pages — autoindex is Nginx's built-in directory listing: when the requested directory holds no default index file such as index.html, Nginx automatically generates an HTML page listing links to every file and subdirectory. This post, in an nginx:1.28 container, runs through the switch, the two display options, the JSON output, and two classic cases of "why am I not seeing a listing".

## Lab Environment

- Docker container `nginx:1.28-alpine` (nginx/1.28.3, tested 2026-09; autoindex is a standard module, compiled in by default).
- Three test directories: `files/` (holding three files: readme.txt, big-archive.tar, app.log), `plain/` (an empty directory, nothing configured), and `with-index/` (containing both index.html and other.txt).

## The Core Mechanism in One Sentence

When Nginx receives a request pointing to a directory, it first looks for a default index file per the index directive; if none is found, `autoindex on` decides whether it generates a directory listing page (on) or returns 403 Forbidden (off by default). The listing page is generated on the fly by Nginx; it does not exist on disk.

## Example One: On vs. Off — the Difference Between 403 and a Listing

First look at a directory with nothing configured — `plain/` has no index.html and no autoindex:

```nginx
location /plain/ { }
```

Requesting it returns 403 Forbidden. Add `autoindex on` and look at `files/`:

```nginx
location /files/ {
  root /usr/share/nginx/html;
  autoindex on;
  autoindex_exact_size off;
  autoindex_localtime on;
}
```

![Figure 1](/images/csdn/figures/nginx-autoindex-csdn138805950-1.png)

Same Nginx: `plain/` gives 403 while `files/` turns into a linked file listing — the size of `big-archive.tar` displays as `1M` (the friendly-unit effect of `autoindex_exact_size off`), and the timestamps are the server's local time (`autoindex_localtime on`). These two options do not affect functionality, only the readability of the listing: `autoindex_exact_size` defaults to on, showing exact byte counts; `autoindex_localtime` defaults to off, showing GMT times.

## Example Two: autoindex_format json, a Directory Manifest for Scripts

Browsers want HTML; scripts want structured data. `autoindex_format` (introduced in 1.7.9) supports four outputs: `html | xml | json | jsonp`:

```nginx
location /json/ {
  alias /usr/share/nginx/html/files/;
  autoindex on;
  autoindex_format json;
}
```

![Figure 2](/images/csdn/figures/nginx-autoindex-csdn138805950-2.png)

The same directory, and in the JSON output every file carries four fields — name/type/mtime/size — with size as the exact byte count (unaffected by `autoindex_exact_size`). Paired with `curl`, a single command handles small jobs like directory syncs and delta checks:

```bash
curl -s http://example.com/json/ | grep -o '"size":[0-9]*'
```

## Wrong-Way Comparison: Two Reasons a Listing Does Not Appear

**Reason one: the directory contains index.html.** `with-index/` holds both index.html and other.txt; even with `autoindex on` enabled, requesting it returns the content of index.html — the index file outranks the directory listing:

```
# Wrong assumption: with autoindex on you will always see a listing
curl localhost/with-index/
# Actual return: <h1>I am index.html</h1>
```

**Reason two: autoindex neither enabled nor any index file present** — that is Example One's 403. To troubleshoot "why no listing", go in this order: first check whether an index.html in the directory is shadowing it, then whether `autoindex on` actually took effect on the right location.

![Figure 3](/images/csdn/figures/nginx-autoindex-csdn138805950-3.png)

## Notes

- **autoindex exposes a directory as-is**; directories holding configuration, backups, or sensitive data must never enable it; for directories that do, tighten access with auth_basic or allow/deny.
- **A 403 is not necessarily "no permission"** — it can also be a directory that should have autoindex but lacks it; when troubleshooting, first distinguish the two 403 semantics: "access denied" vs. "listing feature missing".
- **The listing page is generated dynamically**; a large directory (tens of thousands of files) is walked on every request — for high-traffic large directories consider caching or a pre-generated static index.
- **Under the json format, exact_size has no effect**; size is always the exact byte count, so in scripts just compare it numerically.

## Summary

Back to the opening scenario: without writing a single line of code, make a batch of files browsable — one switch, `autoindex on`, does it; `autoindex_exact_size` and `autoindex_localtime` make the listing friendlier to read; and `autoindex_format json` even lets scripts consume it directly. Remember the two boundaries: when index.html is present in the directory, the listing is shadowed; a directory with nothing configured gives 403, not an empty listing. Internal document distribution and build-artifact showcases — this feature set fits them perfectly.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
