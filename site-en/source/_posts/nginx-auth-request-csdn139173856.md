---
title: "The Nginx auth_request Module: Handing Authentication to an External Service"
date: 2024-05-25 09:00:00
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1462826303086-329426d1aef5?w=1600&q=80&fm=jpg
lang: en
---

When you want access control on a path but don't want to copy authentication logic into every backend service, Nginx's auth_request module exists for exactly that scenario: Nginx forwards the request to an authentication endpoint first, gets a status code back, and then decides whether to allow or reject. This post runs the entire chain in an nginx:1.28 container — allow, two kinds of rejection, endpoint protection — plus two configuration pitfalls that make auth_request silently stop working.

## Lab Environment

- Docker container `nginx:1.28-alpine` (nginx/1.28.3, tested 2026-09; all output below comes from this experiment).
- auth_request is an optional module: a self-compiled Nginx needs `--with-http_auth_request_module`; the official Docker image includes it, confirmable via `nginx -V`.
- Structure: two servers in one Nginx — port 8080 plays the "external authentication service" (judging by request header), port 80 is the protected main site. In production, replace the 8080 with your real authentication service.

## The Core Mechanism in One Sentence

`auth_request /_auth;` makes Nginx fire an **internal subrequest** to `/_auth` during the access phase and adjudicate by the subrequest's status code: 2xx allows, 401/403 rejects, and any other status code is handled as a subrequest error — the client only ever sees 500. All the authentication logic lives in the auth endpoint; Nginx only reads status codes.

## Experiment 1: Allow and Reject, Three Status Codes

Complete configuration; the auth endpoint judges by the Authorization header and also demonstrates path-level control by original URI:

```nginx
server {                          # authentication service (swap for a real auth system in production)
  listen 8080;
  location /auth {
    if ($http_authorization != "Basic dXNlcm5hbWU6cGFzc3dvcmQ=") { return 401; }
    if ($http_x_original_uri ~ /admin) { return 403; }
    return 200;
  }
}

server {                          # protected main site
  listen 80;
  root /usr/share/nginx/html;

  location /protected/ {
    auth_request /_auth;
    error_page 401 = @error401;
    error_page 403 = @error403;
  }

  location = /_auth {
    internal;
    proxy_pass http://127.0.0.1:8080/auth;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Original-URI $request_uri;
  }

  location @error401 { return 401 "Unauthorized\n"; }
  location @error403 { return 403 "Forbidden\n"; }
}
```

Three requests matched to the rules: with correct credentials to `/protected/data.txt`, without credentials to the same path, and with correct credentials to `/protected/admin/panel.txt`:

![Figure 1](/images/csdn/figures/nginx-auth-request-csdn139173856-1.png)

The three result lines map to the three rules: correct credentials are allowed through and get `SECRET DATA`; no credentials get stopped by 401; the `/admin` path is rejected with 403 even with correct credentials — the authentication service read `X-Original-URI` and made a path-level judgment.

## Experiment 2: X-Original-URI, the Key to Path-Level Authorization

The 403 in Experiment 1 was possible because this line passes the user's original path to the authentication service:

```nginx
proxy_set_header X-Original-URI $request_uri;
```

Without it, the authentication service only knows "who this person is", not "where they want to go" — it can do global authentication but not path-level authorization. When more context is needed, append it the same way, e.g. `X-Original-Method $request_method`. The auth endpoint uses this to decide "can this user access this path", which is exactly the basic shape of API gateways and SSO integration.

## Experiment 3: internal — Never Expose the Auth Endpoint

`/_auth` should only ever be reached by internal subrequests. The config adds `internal;`; hitting it directly from outside was tested:

![Figure 2](/images/csdn/figures/nginx-auth-request-csdn139173856-2.png)

It returns 404 — external users cannot even probe for the endpoint's existence, while the subrequest keeps working. The risk of omitting it: `/auth` becomes publicly reachable, anyone can request it directly to probe the authentication service's response behavior — effectively showing the attacker the inner workings of the door lock. The original example exposed the auth location on a public path; this is a mandatory correction after actually running it.

## Wrong-Way Comparison: Two Kinds of "Looks Configured"

**Wrong way one**: using `return` to serve content inside a location that has auth_request:

```nginx
# Wrong: return executes in the rewrite phase, earlier than the access phase
location /protected/ {
  auth_request /_auth;
  return 200 "OK\n";    # authentication is skipped; anyone gets OK
}
```

The observed symptom is exactly "returns 200 even without credentials" — auth_request never ran at all. `return` and `rewrite` belong to the rewrite phase, which runs before the access phase where auth_request lives; the normal exit of a protected location should be a static file or `proxy_pass`.

![Figure 3](/images/csdn/figures/nginx-auth-request-csdn139173856-3.png)

**Wrong way two**: omitting `proxy_pass_request_body off;` and `proxy_set_header Content-Length "";`. These two lines look insignificant, but first a mechanism needs clarifying: **the auth subrequest is always GET** (determined by Nginx's subrequest mechanism; in testing, even when the main request was POST, the authentication service's log still recorded `method=GET`). The consequence of the omission: the main request's body gets forwarded along with this GET subrequest to the authentication service — its access log shows a GET carrying a body like `Content-Length: 3`.

A permissive mock endpoint (if + return) doesn't care, so the config "looks fine"; a real authentication service will expose it — services that strictly enforce "GET must not carry a body", validate Content-Length, or do signature verification all respond with an immediate 4xx, and authentication fails inexplicably. The two paired directives exist precisely to cut this forwarding chain: the first doesn't forward the request body, the second empties the Content-Length header to keep HTTP framing correct.

![Figure 4](/images/csdn/figures/nginx-auth-request-csdn139173856-4.png)

## Caveats

- **The status-code contract must be enforced strictly**: the authentication service allows on 2xx and rejects on 401/403; other values such as 302/500 are treated by Nginx as subrequest errors — in testing the client uniformly received 500 Internal Server Error (not the authentication service's original status passed through), which easily misleads troubleshooting. Converge every non-contractual exit inside the authentication service to 401/403.
- **The request body never reaches the authentication service**: the subrequest is always GET, and with the two body-off directives configured the main request body will not arrive; for scenarios that authenticate based on body content, auth_request is not a direct fit — have the backend call the authentication system itself after receiving the request.
- **Add internal to the auth endpoint**: only internal subrequests may reach it, preventing external probing of the endpoint's behavior.
- **Swap the demo config for a real service**: the if + return mock authentication service in the experiments is for demonstration only; in production use a real authentication system (SSO, OAuth2 introspection, etc.) and have it listen only on localhost or an internal address.

## Summary

Back to the opening scenario: write the authentication logic once and share it across all backends — auth_request turns that into a status-code contract with a single subrequest. The complete checklist from the live run: `auth_request` points to an internal subrequest endpoint, the endpoint passes through `X-Original-URI` for path-level authorization, `error_page` catches 401/403, and `proxy_pass_request_body off` plus `Content-Length ""` turn off request-body forwarding; also remember the two failure modes — a rewrite-phase `return` jumps the queue ahead of authentication, and omitting the body-off directives silently hands the body to the authentication service, which permissive backends won't notice and strict ones reject outright. Get these points right and this lightweight gateway authentication will hold traffic steadily.

---

> This article was rewritten from the author's CSDN blog posts originally published between 2020 and 2024.
