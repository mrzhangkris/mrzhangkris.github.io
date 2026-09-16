---
title: "Installing OpenResty 1.31.1.1 from Source on AlmaLinux 9.8"
date: 2023-11-02 16:01:33
lang: en
updated: 2026-09-14
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1695668548342-c0c1ad479aee?w=1600&q=80&fm=jpg
---

A complete record of installing OpenResty 1.31.1.1 from source on AlmaLinux 9.8. OpenResty officially provides a dnf/yum repository, but when the software needs to go into a custom directory (this post installs to `/apps/openresty`), or when the environment can't reach external repositories, a source install gives you more control — all artifacts live under one prefix directory, so upgrades, rollbacks, and clean removals never touch the rest of the system.

How to choose between the two approaches: the official repository installs to a fixed location, `/usr/local/openresty`, with upgrades handled by the package manager — good for general scenarios. The source approach wins on version choice, custom directories, and independence from external repository availability — suited to production environments with directory standards or intranet isolation. This post documents the latter.

The whole flow was fully tested in an AlmaLinux 9.8 container (minimal install, dnf): dependencies installed, compiled, startup returned 200, and reload/stop exited 0. All screenshots come from that run; anything that can't be done in a container is explicitly marked.

> Note: the steps are identical for older environments (e.g., AlmaLinux 9.2 with OpenResty 1.21.4.2) — just swap the version number in the download URL; the entire flow works across the RHEL 9 family (RHEL/Rocky/AlmaLinux 9).

## Prerequisites

- AlmaLinux 9.8 (or a sibling RHEL 9 distribution), root privileges;
- Access to the official download page [OpenResty - Download](https://openresty.org/download);
- Disk: the source tarball is about 6 MB, the post-build source tree measured about 165 MB; with install artifacts, 1 GB of headroom is plenty;
- Minimal-install images don't ship wget by default — use the system's built-in curl for downloads (which is also why curl isn't in the dependency list; see step 2).

| Name | Version | Install method | Download URL |
| --- | --- | --- | --- |
| OpenResty | 1.31.1.1 | Manual source install | https://openresty.org/download/openresty-1.31.1.1.tar.gz |

## Deployment Plan

- Package storage directory: /data/software
- Software install directory: /apps/openresty
- Active configuration directory: /apps/openresty/nginx/conf/online
- Retired configuration directory: /apps/openresty/nginx/conf/offline

The online/offline dual directories are the escape hatch for config changes: production runs only the configs in online; when changing anything, prepare the new version in offline, and after it verifies clean, swap the two and reload to take effect. Rolling back is just swapping the directory names back — no need to touch the binary.

## Deployment Steps

### 1. Create a Non-Login User nginx

`-s /sbin/nologin` makes this account service-only, unable to log into a shell:

```bash
useradd -s /sbin/nologin nginx
```

Afterwards, confirm with `id nginx`; you should see the assigned uid and gid.

### 2. Install Dependencies

pcre-devel, zlib-devel, and openssl-devel are the build dependencies of Nginx's three core modules; gcc does the compiling; perl is needed by the OpenResty build process; make provides the `gmake` command:

```bash
dnf install perl pcre-devel zlib-devel openssl-devel gcc make -y
```

On el9, yum is just an alias for dnf — the two are equivalent. This post writes dnf throughout.

There's a pitfall here that every minimal-install environment will hit: including `curl` in the dependency list makes the entire dnf transaction fail — the image ships curl-minimal, which conflicts with the full curl package. The actual error:

![Figure 1](/images/csdn/figures/almalinux-openresty-csdn134184189-1.png)

The fix: drop `curl` from the list. The built-in curl-minimal is enough for downloading and verification; the full curl package is never needed in this flow. `make` is already present in some desktop/developer-preinstalled images; if unsure, check with `rpm -q make` first — reinstalling over an existing one does no harm.

A note on where this pitfall comes from: curl-minimal is the slimmed-down curl introduced in RHEL 8. In the CentOS 7 era, `yum install curl` had no conflicts at all — which is why this is the first place old articles break when copied onto el9.

### 3. Download and Extract the Package

```bash
cd /data/software/ && curl -O https://openresty.org/download/openresty-1.31.1.1.tar.gz
tar -zxvf openresty-1.31.1.1.tar.gz && cd openresty-1.31.1.1
```

After downloading, `ls -l` should show a tarball of about 6 MB; after extracting, `ls` shows directories like `configure` and `bundle`. Adjust the version number in the commands to match your actual downloaded package.

### 4. Build and Install

`--prefix` points the install at the planned directory:

```bash
./configure --prefix=/apps/openresty
gmake && gmake install
```

What the configure stage does is check that the compiler and dependency libraries are all present; once the checks pass, it generates the build directory and Makefile under the source tree — so when it errors, you don't have to dig far through logs: in the vast majority of cases, some devel package from step 2 is missing. Three conditions must line up for it to count as done: configure ends by printing the `gmake` and `gmake install` hints directly; the build finishes with no errors; and `ls /apps/openresty` shows the `nginx` directory (along with luajit, lualib, etc.). Excerpt of the actual output:

![Build and install flow](/images/csdn/figures/almalinux-openresty-csdn134184189.png)

### 5. Create the Planned Directories and Set Ownership

Copy the default configs into the online directory and hand ownership of the whole install tree to the nginx user:

```bash
mkdir /apps/openresty/nginx/conf/{online,offline}
cd /apps/openresty/nginx/conf/
cp nginx.conf mime.types online/
chown -R nginx:nginx /apps/openresty/
```

Verification: `ls /apps/openresty/nginx/conf/online/` should show two files, `nginx.conf` and `mime.types`.

### 6. Start and Verify

Start with `-c` explicitly pointing at the config in the online directory:

```bash
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf
```

The start command itself prints nothing, which is normal; then fetch the response code — a 200 means startup succeeded. Result obtained in the AlmaLinux 9.8 container:

![Figure 2](/images/csdn/figures/almalinux-openresty-csdn134184189-2.png)

While you're at it, check the version to confirm the installed build is the target one: `/apps/openresty/nginx/sbin/nginx -v` outputs `nginx version: openresty/1.31.1.1`.

## Common Commands

Start, reload, and stop all use `-c` to point explicitly at the config in the online directory:

```bash
# Start
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf

# Reload configuration
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf -s reload

# Stop immediately
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf -s stop

# Graceful stop (exits after finishing existing requests)
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf -s quit
```

All three actions — reload, stop, quit — measured exit code 0 in this run.

The `-c` flag is not an optional flourish: omit it and nginx reads the default path `conf/nginx.conf` (the original config in the install directory) instead of the active config in online — a classic hidden bug where "you changed the config but nothing happened" or "you reloaded a different file." Always keeping `-c` in the command nips it in the bud.

## When the Install Goes Wrong

The beauty of a source install is the clean teardown: everything lives in the single `/apps/openresty` directory. `rm -rf /apps/openresty`, then rerun `gmake install` from the extraction step — no need to touch anything else on the system. If you want to reclaim the user too, run `userdel nginx` afterwards.

## Common Errors

- **Dependency install fails with a curl conflict**: see the actual output in step 2. On a minimal-install environment, remove curl from the list and rerun.
- **`gmake: command not found`**: the make package isn't installed. Run `dnf install make -y` and retry.
- **Startup immediately fails with `bind() to 0.0.0.0:80 failed (98: Address already in use)`**: port 80 is already taken. Use `ss -lntp | grep :80` to find the occupier, stop it, or switch listen ports (source: standard nginx error).
- **Startup succeeds but curl gets nothing**: troubleshoot in this order — first re-check the start command's output for errors → check whether port 80 is occupied (`ss -lntp | grep 80`) → check whether the firewall is blocking it (`firewall-cmd --list-all`).

## Notes and Cautions

- A source install is not managed by the package manager; future upgrades require recompiling. Back up the conf directory.
- stop stops immediately; quit stops gracefully. Prefer quit in production. Both commands return immediately after sending the signal.
- The tested environment for this post was an AlmaLinux 9.8 container (minimal install, dnf, OpenResty 1.31.1.1); firewall- and systemd-related steps cannot be verified inside a container — those commands are standard AlmaLinux usage, source: official documentation.

> This article was rebuilt from the author's CSDN blog posts published between 2020 and 2024, originally published on CSDN.
