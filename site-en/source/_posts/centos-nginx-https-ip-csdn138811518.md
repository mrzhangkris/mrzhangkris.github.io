---
title: "Nginx HTTPS with IP Access Denied: default_server Rejects the Handshake"
date: 2024-05-14 08:30:00
updated: 2026-09-14
categories: [Tech, Nginx]
lang: en
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1600&q=80&fm=jpg
---

Even after a site moves to HTTPS, people will still scan port 443 using the bare IP—such requests carry a Host that isn't your domain and should be rejected at the handshake stage. This post records the complete process of setting up HTTPS on Nginx while blocking IP access, including one config pitfall hit during testing: the `if` + `&&` Host-check style simply cannot pass Nginx's syntax check, and the correct approach is a `default_server` catch-all that refuses the handshake. Everything was verified live in an nginx:alpine container (nginx/1.31.5, self-signed certificate), with the CentOS 7 old-Nginx differences attached at the end.

## The Core Mechanism in One Sentence

HTTPS is determined by the certificate plus `listen 443 ssl`; the key to blocking IP access is that TLS requests for non-target domains fall into the `default_server` block where SNI matching fails—configure that block to refuse the handshake outright, and IP-direct connections never reach your business site.

## Preparation and Certificate Issuance

Confirm two things before starting: Nginx is installed on the server, and the domain has a valid SSL/TLS certificate. A free certificate from Let's Encrypt works fine; the companion Certbot automates both issuance and the Nginx configuration:

```bash
dnf install -y certbot python3-certbot-nginx   # Rocky/RHEL 9, requires EPEL
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

> Note: the Certbot issuance flow depends on a real domain and a reachable port 80, so it was not run inside the container—source: official Certbot documentation. On CentOS 7 the equivalent is `yum install epel-release certbot-nginx`.

Certbot will try to modify the Nginx configuration automatically; the following is the full manual version, with paths matching wherever Certbot actually issues the certificates.

## Nginx Configuration: HTTPS Plus IP-Direct Rejection

Create `/etc/nginx/conf.d/yourdomain.com.conf` with three blocks, each doing one job: port 80 redirects everything, port 443's default_server rejects handshakes from non-target domains, and the business block serves only its own domain:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

# TLS requests for anything other than yourdomain.com (including direct IP access) land here
server {
    listen 443 ssl default_server;
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_reject_handshake on;    # nginx >= 1.19.4
}

server {
    listen 443 ssl;
    http2 on;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # optional: session reuse to reduce handshake overhead
    # ssl_session_cache shared:SSL:1m;
    # ssl_session_timeout 10m;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
    }
}
```

The certificate in the default_server block can be the same pair as the business block's, but it must genuinely exist—`nginx -t` checks, and with the files missing Nginx won't start at all. Test the syntax first after editing, then reload once it passes:

```bash
nginx -t
systemctl reload nginx
```

Tested with this configuration (nginx/1.31.5 container, self-signed certificate): the syntax check passed cleanly—

![Figure 1](/images/csdn/figures/centos-nginx-https-ip-csdn138811518-1.png)

After startup, three kinds of requests were verified: domain access returned 200 with HTTP/2 in effect, and port 80 gave the expected 301—

![Figure 2](/images/csdn/figures/centos-nginx-https-ip-csdn138811518-2.png)

Direct IP access to 443 was rejected at the TLS handshake stage, without even producing an HTTP status code:

![Figure 3](/images/csdn/figures/centos-nginx-https-ip-csdn138811518-3.png)

`tlsv1 unrecognized name` is exactly what `ssl_reject_handshake on` does: Nginx can't find a matching SNI domain, pushes the handshake straight back, and the scanner gets a TLS-level error instead of your site's response.

Two version notes: `ssl_reject_handshake` requires nginx 1.19.4 or later, and the old combined style `listen 443 ssl http2` triggers a deprecation warning on newer versions (tested on 1.31.5, see the figure below)—new configurations should uniformly use `listen 443 ssl;` plus a separate `http2 on;` line:

![Figure 4](/images/csdn/figures/centos-nginx-https-ip-csdn138811518-4.png)

## Wrong Configuration, for Comparison

Searching "nginx block IP access" easily turns up this style:

```nginx
if ($host != yourdomain.com && $host != www.yourdomain.com) {
    return 403;
}
```

Tested: `nginx -t` fails outright with `invalid condition "$host"`, and the config never comes up:

![Figure 5](/images/csdn/figures/centos-nginx-https-ip-csdn138811518-5.png)

Nginx's if directive comes from the rewrite module and supports only single-condition checks—no `&&` or `||` combinations. Configs like this, copied from old blog posts, can't even pass the syntax check. And even written as two separate ifs, they only intercept HTTP-layer requests: the TLS handshake happens before HTTP, so the browser's certificate-warning experience remains. default_server plus `ssl_reject_handshake` rejects at the handshake stage—a far cleaner approach.

## Troubleshooting When Access Fails

If the configuration is correct but HTTPS still fails, the blockage is most likely the firewall or a WAF.

Firewall: open the https service (port 443) in firewalld:

```bash
firewall-cmd --permanent --zone=public --add-service=https
firewall-cmd --reload
```

After running these, the output of `firewall-cmd --list-services` should include https.

WAF: when running a WAF like ModSecurity, check whether a rule is blocking legitimate HTTPS requests—over-strict WAF configs mistakenly rejecting normal traffic are not rare, and the blocks show up in the error log.

## Things to Watch Out For

- Write certificate paths according to where Certbot actually issued them, usually under `/etc/letsencrypt/live/<domain>/`; the default_server block likewise needs a working certificate pair—with the files missing, Nginx won't start.
- Run `nginx -t` before every reload of a changed Nginx config; never go live with syntax errors. The if-combined-condition pitfall in this post is exactly what that step catches.
- Verify with `curl -k --resolve domain:443:serverIP https://domain/`—faster than editing local hosts, and it distinguishes "handshake rejected" (a curl TLS error) from "returns 403" (an HTTP-layer block).
- After Certbot renews, the certificate paths don't change, but Nginx must be reloaded once to pick up the new certificates; `certbot --nginx` mode handles this automatically.
- CentOS 7's nginx 1.16 has no `ssl_reject_handshake` (introduced in 1.19.4) and no separate `http2 on;` directive—on old versions, replace the default_server block with a `return 444;` fallback and keep the old combined http2 syntax.

## Summary

Back to the opening scenario: IP traffic scanning 443 shouldn't be hitting your business site. Certbot handles the certificate; rejecting direct IP access goes to `default_server` plus `ssl_reject_handshake`; after configuring, `nginx -t` plus one two-ended curl verification—domain access works, IP handshakes get rejected, and port 80 redirects cleanly. With those results, this configuration is closed out.

---

> This article was rewritten from the author's CSDN blog posts originally published between 2020 and 2024.
