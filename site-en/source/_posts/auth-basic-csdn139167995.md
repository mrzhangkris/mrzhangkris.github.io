---
title: "Nginx auth_basic: Basic Authentication Configuration Examples and Hardening"
date: 2024-05-24 10:24:22
updated: 2026-09-14
categories: [Tech, Ops]
lang: en
tags: [Ops]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1580106815433-a5b1d1d53d85?w=1600&q=80&fm=jpg
---

When internal admin pages or monitoring dashboards shouldn't sit naked on the public internet, but you're not ready for a full OAuth setup, Nginx's built-in auth_basic module fills the gap exactly—two lines of configuration plus a password file keep every anonymous request out. This article covers the basic configuration, common hardening combinations, two classic mistakes, and finishes with advanced usage under OpenResty. All configurations were tested inside an nginx/1.31.5 container (the `nginx:alpine` docker image), and every status code shown comes from a real run.

## What auth_basic Is and When to Use It

auth_basic does something simple: it requires a username and password from clients accessing a specified resource, and rejects anyone who can't produce them. The mechanism is straightforward, which makes it a good fit for non-sensitive data or internal admin environments—dev and test environments, ops backends and monitoring pages, and temporary resources not yet ready to go fully public are all typical spots for it.

## Lab Environment

An nginx/1.31.5 container (`nginx:alpine`), with htpasswd installed via `apk add apache2-utils`. In production, replace `example.com` with your own domain and make sure it sits behind HTTPS.

## Basic Configuration

### Step 1: Create the Password File

Generate it with htpasswd; Nginx is fully compatible with the password file format it produces. htpasswd isn't part of a default system install, so install it per your distribution and generate:

```bash
apk add apache2-utils        # Alpine (tested in this article's container)
dnf install httpd-tools -y   # RHEL 9 family (same package name in the CentOS 7 era; use yum there)
htpasswd -c /etc/nginx/.htpasswd user1  # press Enter and type the password interactively; use -bc in scripts for non-interactive mode
```

### Step 2: Modify the Nginx Configuration

Enable authentication with `auth_basic` in a server or location block, and point `auth_basic_user_file` at the password file:

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    auth_basic "Restricted Area";  # title shown in the authentication dialog
    auth_basic_user_file /etc/nginx/.htpasswd;  # password file

    proxy_pass http://localhost:8080;  # proxy authenticated requests to the backend service
  }
}
```

Each of the three directives handles one thing: `auth_basic` enables authentication and sets the dialog title, `auth_basic_user_file` points to the password file generated in the previous step, and `proxy_pass` forwards authenticated requests to the backend service.

After applying the configuration, fire one request for each of the three credential states to verify. Test results (the backend was simulated with a static page):

![Figure 1](/images/csdn/figures/auth-basic-csdn139167995-1.png)

OpenResty fully inherits Nginx's auth_basic module—the configuration syntax is unchanged, so it works as-is once you swap `server_name` for your own domain.

## Common Hardening Combinations

Basic authentication is a single door, so in practice you usually stack a few more restrictions on top.

### Rate Limiting with limit_req

Use the limit_req module to cap the access rate per IP and blunt brute-force attempts:

```nginx
http {
  # define a rate-limiting zone
  limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;

  server {
    listen 80;
    server_name example.com;

    location / {
      auth_basic "Restricted Area";
      auth_basic_user_file /etc/nginx/.htpasswd;

      # apply rate limiting using the zone defined above
      limit_req zone=one burst=5 nodelay;

      proxy_pass http://localhost:8080;
    }
  }
}
```

`limit_req_zone` defines a rate-limiting zone named one (`10m` is the shared memory that stores per-IP rate state), and `limit_req` applies it in the location: it allows 5 burst requests and rejects anything over speed immediately.

The effect of rate limiting on "slow brute-forcing" can be measured directly. With rate=1r/s and burst=3, five requests fired back to back:

![Figure 2](/images/csdn/figures/auth-basic-csdn139167995-2.png)

Once the burst quota was exhausted, the 5th request got a 503 outright.

### A Custom Authentication Failure Page

By default, failed authentication returns a 401 Unauthorized error page. To swap in your own page, use the error_page directive:

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    auth_basic "Restricted Area";
    auth_basic_user_file /etc/nginx/.htpasswd;

    error_page 401 /custom_401.html;
    location = /custom_401.html {
      root /usr/share/nginx/html;  # directory holding the custom error page
      internal;  # ensure this page cannot be accessed directly
    }

    proxy_pass http://localhost:8080;
  }
}
```

`error_page 401 /custom_401.html;` redirects to the custom page when authentication fails, and `internal` guarantees the page can only be reached through an nginx internal redirect. In testing, the response body the client received on authentication failure was exactly this custom page.

### IP Whitelisting with allow/deny

When your sources are relatively fixed, narrow the IP range with allow/deny first, then layer authentication on top:

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    # allow a specific IP range
    allow 10.99.0.0/16;
    deny all;

    auth_basic "Restricted Area";
    auth_basic_user_file /etc/nginx/.htpasswd;

    proxy_pass http://localhost:8080;
  }
}
```

`allow 10.99.0.0/16;` admits addresses from 10.99.0.0 to 10.99.255.255, and `deny all;` rejects every other source. In testing, sources outside the whitelist got an immediate 403 (error.log logged `access forbidden by rule`) without even seeing the authentication dialog:

![Figure 3](/images/csdn/figures/auth-basic-csdn139167995-3.png)

## A Comparison: Two Wrong Ways to Do It

**Mistake one: the password file is unreadable to worker processes**

If you generate the file with htpasswd as root and casually chmod it to 640, the worker processes (which usually run as the nginx user) can no longer read it:

```nginx
# Wrong: root:root 640, worker read fails
auth_basic_user_file /etc/nginx/.htpasswd;

# Right: make sure the worker user can read it (e.g. 644, or fix ownership)
auth_basic_user_file /etc/nginx/.htpasswd;
```

The configuration is syntactically perfect, but in testing every request that carried credentials returned 500—the problem isn't syntax, it's permissions. When troubleshooting, check error.log first: the run logged `[crit] open() "/etc/nginx/.htpasswd" failed (13: Permission denied)`, pointing straight at the password file itself. After restoring the permissions to 644 or reassigning the file to the worker user, the same credentials immediately returned 200 again.

![Figure 4](/images/csdn/figures/auth-basic-csdn139167995-4.png)

**Mistake two: simulating the backend with return in the same location**

When testing whether a configuration takes effect, some people put `return 200 "OK";` in the location instead of proxy_pass—and then get a 200 without any credentials, wrongly concluding that auth_basic is broken. The cause is processing order: `return` runs in the rewrite phase, while `auth_basic` runs in the access phase after it, so the request never survives long enough to reach authentication. Testing auth_basic requires actual content served in the content phase (proxy_pass or a static file).

## Things to Watch Out For

- **Credentials are base64-encoded, not encrypted.** Basic auth passes credentials through an HTTP header, which amounts to transmitting them in the clear. Put it behind HTTPS without exception, and never use it to protect sensitive information.
- **Password file permissions are a hidden mine.** Correct syntax doesn't mean working configuration: when workers can't read the password file, the whole site returns 500 (verified above). After fixing permissions, run `nginx -t` before reloading, then curl through the flow once more.
- **Rate limiting and whitelisting come before authentication.** limit_req slows brute-force attempts, allow/deny cuts down the source range, and authentication only does the final check—stack the three layers as needed.
- **Switch mechanisms for high-concurrency, large-scale scenarios.** Every request reads the password file and computes a hash, which doesn't pay off at high volume; move to a more secure and efficient authentication mechanism instead.

## Advanced Usage on OpenResty

OpenResty supports embedding Lua scripts, which pushes authentication logic up to the level of querying databases or integrating OAuth. Here's an example that validates a username and password directly in code:

```nginx
http {
  lua_shared_dict tokens 10m;

  server {
    listen 80;
    server_name openresty-example.com;

    location / {
      access_by_lua_block {
        local auth = ngx.var.http_authorization
        if not auth or auth == "" then
          ngx.header["WWW-Authenticate"] = 'Basic realm="Restricted Area"'
          ngx.exit(ngx.HTTP_UNAUTHORIZED)
        end

        local user_pass = ngx.decode_base64(auth:sub(7))
        local username, password = user_pass:match("^(.-):(.*)$")

        if not (username == "user1" and password == "password1") then
          ngx.exit(ngx.HTTP_UNAUTHORIZED)
        end
      }

      proxy_pass http://localhost:8080;
    }
  }
}
```

> Note: the original Chinese article showed `ngx.headerWWW-Authenticate` here—the quotes and square brackets were lost in formatting. It has been restored to `ngx.header["WWW-Authenticate"]` per the OpenResty ngx.header API.

The script flow: after grabbing the `Authorization` header, decode the base64 first (the `Basic ` prefix takes 6 characters, so `sub(7)` starts from position 7), split out the username and password, compare them, and return 401 on a mismatch.

## References

1. [Nginx Documentation: HTTP Basic Auth](http://nginx.org/en/docs/http/ngx_http_auth_basic_module.html)
2. [OpenResty Documentation](https://openresty.org/)
3. [Apache HTTP Server Documentation](https://httpd.apache.org/docs/2.4/programs/htpasswd.html)
4. [Nginx Documentation: Limit Request](http://nginx.org/en/docs/http/ngx_http_limit_req_module.html)
5. [Nginx Documentation: Error Page](http://nginx.org/en/docs/http/ngx_http_core_module.html#error_page)

## Summary

- auth_basic answers "who may open this page" and suits dev/test environments, internal admin systems, and temporarily protected resources.
- Its credentials are base64-encoded, not encrypted—always sit it behind HTTPS and never use it to protect sensitive information.
- When authentication alone isn't enough, combine limit_req against brute force, error_page for a custom failure page, and allow/deny to narrow sources as needed.
- For more complex authentication logic, OpenResty's Lua scripting is a ready-made extension point.
- Verify in the field starting from the basic combination: 401 without credentials, 200 with the right ones—once both curls pass, layer on rate limiting and the whitelist step by step.

---

> This article was rewritten from the author's CSDN blog posts originally published between 2020 and 2024.
