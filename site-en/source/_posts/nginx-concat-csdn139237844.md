---
title: "The Nginx Concat Module: Installing It and Merging Static Assets"
date: 2024-05-27 14:41:46
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1506399558188-acca6f8cbf41?w=1600&q=80&fm=jpg
lang: en
---

When a page references a dozen-plus CSS/JS files, the browser has to fire a dozen-plus requests — the Concat module lets the server merge multiple files into one response, cutting both request count and network latency. It's a third-party module from Alibaba's Tengine family that stock Nginx doesn't ship. This post compiles it for real inside a container following the original article's installation approach, then live-tests its actual usage (`??` URL merging), type constraints, and over-limit protections one by one.

## Installation: Third-Party Modules Go Through --add-module

Concat isn't in the official distribution; installation is "get the source, compile it into Nginx" in four steps (tested and passing in an Alpine container; module repo alibaba/nginx-http-concat, Nginx 1.28.0):

```bash
git clone https://github.com/alibaba/nginx-http-concat.git
cd nginx-1.28.0
./configure --add-module=/path/to/nginx-http-concat
make && make install
```

> Note: the repository address given in the original article, `alibaba/ngx_http_concat_module`, was verified not to exist (GitHub 404); the real repository name is `nginx-http-concat`.

**Verification point**: after compiling, `nginx -V` should show `--add-module=.../nginx-http-concat`; `nginx -t` must stop reporting unknown directive before the install counts as done.

## The Core Mechanism in One Sentence

Concat's trigger is unusual — **it's written into the URL**: request `/css/??a.css,b.css`, and the file list after the two question marks is what gets merged, with Nginx concatenating those files, in order, into one response. The directives only switch the feature on and draw its boundaries.

## Configuration and Examples

```nginx
server {
  listen 80;
  root /usr/local/nginx/html;

  location /css/ {
    concat on;
    concat_max_files 10;
    concat_types text/css application/javascript;
  }
}
```

- `concat on;` turns on the merging feature;
- `concat_max_files 10;` caps a single merge request at 10 files, guarding against overlong-URL attacks;
- `concat_types` restricts the mergeable MIME types (text/css and application/x-javascript are included by default);
- `concat_unique on` (the default) requires a single merge to be all same-type files; only with `off` may CSS and JS mix.

### Example 1: Merging Three CSS Files

Prepare style1.css, style2.css, style3.css, and merge them with one URL:

![Figure 1](/images/csdn/figures/nginx-concat-csdn139237844-1.png)

The rule bodies of the three files are concatenated, in URL order, into one response. Compared with requesting them one by one, the browser sends a single request over a single connection — in the HTTP/1.1 era, that was a genuine performance optimization.

### Example 2: Mixed Types and concat_unique

With the default `concat_unique on`, stuffing CSS and JS into the same request gets rejected (400); only after declaring `concat_unique off;` can css and js merge into one response — a live comparison of both behaviors:

![Figure 2](/images/csdn/figures/nginx-concat-csdn139237844-2.png)

> Note: the mixed-type live test used css+js in the same directory; any URL carrying `../` cross-directory references gets a flat 400 (the module guards against path traversal, and `concat_unique off` does not relax this) — don't mistake "unique off" for a license to merge across directories.

### Example 3: Three 400s at the Boundaries

The failure modes of merge requests each carry their own meaning — three measured live: a missing file returns **404**; a file count over `concat_max_files` returns **400** with `client sent too many concat filenames` recorded in error.log; and one sneaky form — **a file whose MIME type isn't in `concat_types` sneaks into the request, straight 400 with nothing written to error.log**. The third is the nastiest: forget `include mime.types;` and every CSS gets judged as the default type, so merges fail with a silent 400 across the board.

![Figure 3](/images/csdn/figures/nginx-concat-csdn139237844-3.png)

## Caveats

- **mime.types must be in place first**: in the `http` block, `include mime.types;` before talking about concat, or type matching fails and every merge returns a log-less 400 (tripped over in testing).
- **When upgrading Nginx, take the module along**: concat is compiled in; if `--add-module` gets lost during a reinstall/upgrade, the concat directives in your config turn into unknown directive immediately.
- **Give concat_max_files a value that fits your business**: it's an anti-abuse ceiling, not a performance parameter; set it to the page's real reference count plus headroom — too large and the protection loses its meaning.
- **Reassess the payoff in the HTTP/2 era**: multiplexing shrinks the gains from request merging, and concatenation breaks individual caching — change one file's content and the entire merged URL's cache goes invalid. Keep it in legacy projects as needed; for new projects, test before adopting.

## Wrap-Up

Back to the opening scenario: a dozen-plus static-file requests compressed into one — Concat does it with a single `??` URL, and the whole config surface is three to five directives: `concat on`, `concat_max_files`, `concat_types`. Three boundaries to take away from the live runs: the repository's real address is `alibaba/nginx-http-concat`; types not covered by `concat_types` fail with a silent 400 (include mime.types first); and file counts over `concat_max_files` are rejected outright. Whether to use it in a new project — first check whether your users are still on HTTP/1.1.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
