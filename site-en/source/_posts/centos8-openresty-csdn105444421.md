---
title: "Installing OpenResty 1.19.3.1 from Source (Linked to a Self-Built OpenSSL): Works on RHEL 8/9, Tested on Rocky 9"
date: 2020-04-10 23:09:21
lang: en
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1564457461758-8ff96e439e83?w=1600&q=80&fm=jpg
---

OpenResty bundles Nginx and a set of Lua modules into one package, and when you need custom build options, installing from source is the standard route. This post records the complete steps for source-installing OpenResty 1.19.3.1 on the RHEL family (identical commands on CentOS 8 / Rocky 9), with the focus on pointing `--with-openssl` correctly — it wants the OpenSSL **source directory**, not the install directory; get this wrong and the build fails outright. Everything here was reproduced in a Rocky Linux 9.3 container: configure, make, install, startup, through to a curl 200.

## Prerequisites

- An RHEL 8/9-family server, root or sudo access (the tested environment here is a rockylinux:9.3 container).
- The build toolchain: gcc, make, perl (OpenResty's configure script is driven by perl).
- Libraries: pcre-devel (required by the URL rewrite module), zlib-devel (gzip compression).
- An OpenSSL source tarball (openssl-3.1.4 in this post), unpacked at any path, say /usr/local/src/openssl-3.1.4.

## Step 1: Install Dependencies

```bash
dnf install gcc make perl pcre-devel zlib-devel wget -y
```

Verification point: `rpm -q pcre-devel zlib-devel` shows both packages present. Without pcre-devel, configure exits while checking the PCRE library — the tested error is shown in the "Common Errors" figure.

## Step 2: Download and Unpack the Sources

Get the source tarball from the [OpenResty download page](https://openresty.org/en/download.html):

```bash
wget https://openresty.org/download/openresty-1.19.3.1.tar.gz
tar -zxvf openresty-1.19.3.1.tar.gz
tar -zxvf openssl-3.1.4.tar.gz
cd openresty-1.19.3.1
```

## Step 3: Configure and Build

```bash
./configure --with-http_ssl_module --with-http_v2_module \
  --with-openssl=/usr/local/src/openssl-3.1.4
make -j$(nproc)
make install
```

The semantics of `--with-openssl` deserve a special note: nginx (OpenResty included) will, at build time, **treat the given directory as an OpenSSL source tree, compile it in place, and statically link it** — so it must point to the unpacked source directory, not the directory produced by `make install`. If the install directory happens to lack a Makefile, the build fails at the OpenSSL step. Only if your habit is to unpack the OpenSSL source into /usr/local/openssl and compile it in place will the paths "coincidentally" agree.

Verification point: configure finishes with no ERROR and prints build hints at the tail. As tested (Rocky 9.3 container), the tail looks like this:

![Figure 1](/images/csdn/figures/centos8-openresty-csdn105444421-1.png)

make ends and exits without errors; OpenResty builds LuaJIT, nginx, and all bundled modules in turn, taking a few minutes.

## Step 4: Verify and Start

The install location is fixed at /usr/local/openresty/. Verify the version, then start and confirm the service is really responding:

```bash
/usr/local/openresty/nginx/sbin/nginx -v
/usr/local/openresty/nginx/sbin/nginx
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/
```

![Figure 2](/images/csdn/figures/centos8-openresty-csdn105444421-2.png)

Two verification points: the version printed by `nginx -v` carries the openresty/ prefix, confirming it is OpenResty's nginx rather than some other nginx that may exist on the system; and curl getting a 200 shows the service is truly up, not merely installed.

## Common Errors

**Missing PCRE**: without pcre-devel, configure exits (exit 1) after three consecutive `not found` lines while checking the PCRE library, and the outer script reports `the HTTP rewrite module requires the PCRE library.`. Tested output:

![Figure 3](/images/csdn/figures/centos8-openresty-csdn105444421-3.png)

Install pcre-devel and rerun configure — no cache clearing needed.

**Wrong OpenSSL path**: pointing `--with-openssl` at the install directory instead of the source directory fails the build at the OpenSSL step (verbatim record). Fix: point it at the source directory and rerun configure, make.

## Uninstall and Rollback

Uninstalling a source install is simple: stop the process, then `rm -rf /usr/local/openresty/` — no system directories polluted. That is one advantage of building from source over rpm installs: everything lives under one prefix directory, and rollback is clean.

## Notes

- `--with-openssl` must point to an OpenSSL source tree, statically compiled into nginx at build time; pointing it at the install directory is the most common failure point in articles of this kind.
- Build OpenSSL itself per the [official OpenSSL documentation](https://www.openssl.org/source/); choose security-patch versions according to production requirements; verify the sha256 against the official site after downloading the source.
- A source-installed OpenResty lives entirely under /usr/local/openresty/; start and stop with its own `nginx` binary (`/usr/local/openresty/nginx/sbin/nginx -s stop|reload`), and never mix in the system nginx.
- For production, add a systemd unit to manage the OpenResty process instead of manual start/stop.
- 1.19.3.1 is a 2020-era version line; new projects should use OpenResty's official yum repo or a newer source release. The value of this post's procedure is the act of "custom-building from source" itself — swap in the version you need.

---

> This article was restructured from the author's 2020-2024 CSDN blog posts, originally published on CSDN.
