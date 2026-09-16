---
title: "The Nginx addition Module: Splicing Subrequest Content into the Main Response"
date: 2024-05-28 10:20:58
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1680992046626-418f7e910589?w=1600&q=80&fm=jpg
lang: en
---

Pages often carry small fragments served by separate endpoints — ad slots, footers, recommendation boxes. Letting the browser fetch them with extra requests drives up request counts and backend load. Nginx's addition module offers another approach: at the Nginx layer, splice the subrequest's response body in front of or behind the main response, so the client gets the complete content in a single request. This post runs through its configuration, boundaries, and one widely circulated outdated directive in an nginx:1.28 container.

## Lab Environment

- Docker container `nginx:1.28-alpine` (nginx/1.28.3, tested 2026-09).
- The official image is compiled with the addition module (`nginx -V` shows `--with-http_addition_module`), but note: this is an **optional module**, not included by default in every distribution's package — confirm before deploying.
- Prepare three files: `main.html` (main document), `banner.html` (banner), `footer.html` (footer).

## The Core Mechanism in One Sentence

addition is a filter module: as a response passes through Nginx, it fires another internal request to a **subrequest** (the URI given by `add_before_body` / `add_after_body`) and inserts the subrequest's response body before or after the main response body. The client is oblivious throughout — the browser sees a single response.

## Experiment 1: Appending a Footer to Every Page

The simplest scenario — append the same footer to all HTML pages:

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;

  location ~ \.html$ {
    add_after_body /footer.html;
  }
}
```

Request the main document and see what comes back:

![Figure 1](/images/csdn/figures/nginx-addition-csdn139259142-1.png)

In the response body, `<div>FOOTER</div>` follows `<h1>MAIN</h1>` immediately — the footer content was fetched by Nginx's internal request to `/footer.html` and spliced in; the client got it in one request.

## Experiment 2: Ad Banner + Footer, a Front-and-Back Sandwich

Sandwich the main response: banner in front, footer behind:

```nginx
location = /main-both.html {
  add_before_body /banner.html;
  add_after_body /footer.html;
}
```

![Figure 2](/images/csdn/figures/nginx-addition-csdn139259142-2.png)

The response order is `BANNER → MAIN → FOOTER`: the `add_before_body` subrequest runs first, the main response sits in the middle, and `add_after_body` closes it out. Multiple directives concatenate in this fixed order — adjusting positions means adjusting the order of these two directives.

## Experiment 3: addition_types Draws the MIME Boundary

addition by default **only processes `text/html`**. Give a `text/plain` file an `add_after_body` and check whether it takes effect:

```nginx
location = /note.txt {
  add_after_body /footer.html;
}
```

![Figure 3](/images/csdn/figures/nginx-addition-csdn139259142-3.png)

`note.txt` comes back unchanged — the footer was not spliced in, because its Content-Type is `text/plain`, outside the default processing scope. To extend the scope, use `addition_types`:

```nginx
addition_types text/plain;
```

Tested: with this line added in the location, the same footer really does get appended to the end of the `text/plain` response (second half of Figure 3); for arbitrary types use the wildcard value `addition_types *;`. Forgetting this boundary costs you "configured but not working" — when troubleshooting, check the response's Content-Type first.

## Wrong-Way Comparison: addition on Is a Deprecated Directive

Numerous old tutorials online (including the first version of this article's original) start with `addition on;`. Tested: current nginx rejects the directive outright:

```nginx
# Wrong: directive from old versions, now removed
addition on;
# nginx: [emerg] unknown directive "addition"

# Right: the module is on by default; just write the two add directives
add_before_body /banner.html;
add_after_body /footer.html;
```

![Figure 4](/images/csdn/figures/nginx-addition-csdn139259142-4.png)

The `[emerg] unknown directive "addition"` error appears at the `nginx -t` stage and the configuration fails to load. Likewise, `addition_output_charset` is not a real directive either — tested, it is rejected the same way. The addition module's current directives number exactly three: `add_before_body`, `add_after_body`, `addition_types`. If a config copied from an old tutorial won't start, this is most likely where it's stuck.

## Caveats

- **The module is not compiled in by default**. The official documentation states `--with-http_addition_module` must be enabled explicitly; with a self-compiled or minimal distribution package, first `nginx -V` to confirm the module is present, then `nginx -t` to verify the directives are recognized.
- **By default only text/html gets spliced**. Other MIME types need explicit permission via `addition_types`, otherwise the configuration silently does nothing.
- **Cancel inheritance with an empty string**. `add_before_body "";` cancels the append configuration inherited from the parent level (http/server). Tested: with `add_after_body /footer.html;` configured at server level, writing `add_after_body "";` in one location means that location's response no longer gets the footer, while the other locations inherit as usual.

![Figure 5](/images/csdn/figures/nginx-addition-csdn139259142-5.png)

- **Performance has a cost**. Every append is an internal subrequest; with many fragments and heavy traffic, load on both Nginx and the backend rises — weigh the feature and its cost together.
- **Content consistency**. The spliced page needs every fragment's styling and structure to line up; when fragments are maintained by different teams they drift apart easily, so check the fragments together when redesigning.

## Summary

Back to the opening scenario: small fragments like ad slots and footers don't need an extra browser trip — the addition module splices the content into the main response with subrequests at the Nginx layer, and a single `add_after_body` gives every page on the site a uniform footer. Three rules from the live run: the current directives are exactly `add_before_body`, `add_after_body`, `addition_types`; the default scope is `text/html` only; and the old tutorials' `addition on;` has been removed — copying it verbatim gets you an immediate `unknown directive`.

---

> This article was rewritten from the author's CSDN blog posts originally published between 2020 and 2024.
