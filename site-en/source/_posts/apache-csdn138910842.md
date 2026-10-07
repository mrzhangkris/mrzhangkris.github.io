---
title: "Smooth Apache Upgrades: The Complete Path from 2.4.41 to 2.4.46"
date: 2024-05-18 10:30:00
updated: 2026-09-14
categories: [Tech, Ops]
tags: [Ops]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1535957998253-26ae1ef29506?w=1600&q=80&fm=jpg
lang: en
---

Upgrading Apache by uninstalling the old version and installing the new one straight over it costs you an outage window. The approach recorded here: compile and install the new version into its own directory, migrate the config over, bring it up on a separate port and test it, and only after it proves stable perform the switchover — keeping the upgrade's impact on production as small as possible. Once you've walked the whole flow, old and new coexist and you can switch back at any time.

This two-version-parallel flow was fully re-tested in a Rocky Linux 9 container: with the old 2.4.41 serving on port 80, the new 2.4.46 tested independently on 8080, neither interfering with the other; the version outputs and the parallel/switchover verification results in this post all come from that run. Historical releases downloaded from the archive site still work on today's network.

## Prerequisites

- A Linux server with Apache HTTP Server installed, with root or sudo privileges;
- A build environment: gcc, make, pcre-devel, expat-devel, openssl-devel, plus wget for downloads (one `dnf install` covers it on RHEL 9 family);
- The current Apache config files and key data backed up before the upgrade.

There's also a download-level prerequisite: historical versions like 2.4.46 are no longer in the main download list at [httpd.apache.org](http://httpd.apache.org/); get them from [archive.apache.org/dist/httpd](https://archive.apache.org/dist/httpd/). The same goes for the two build dependencies apr and apr-util. The method itself doesn't care about versions — the same flow applies to upgrading to the latest current 2.4.x.

## The Upgrade Flow at a Glance

1. **Preparation**: confirm the current version and get to know the target version.
2. **Install the new version**: install it into its own directory without touching the old one.
3. **Config check and adjustment**: migrate the old config into the new version's directory and confirm compatibility.
4. **Test the new version**: bring the new version up and test it without disturbing the running old one.
5. **Switch versions**: once the new one is stable, stop the old and start the new.
6. **Monitoring**: after the upgrade, watch performance and logs.

## Complete Walkthrough

Take the 2.4.41 → 2.4.46 upgrade as an example and go through the whole flow. To make verification results unmistakable, each version's `htdocs/index.html` is pre-written with its own version marker (e.g. `v2.4.41-old-serving`); whichever marker curl returns tells you which instance answered.

### Step 1: Confirm the Current Version

```bash
/usr/local/apache2.4.41/bin/apachectl -v
```

Note the version number in the output — that's the upgrade's starting point and your rollback reference. Tested output:

![Confirming the current version](/images/csdn/figures/apache-csdn138910842.png)

### Step 2: Download the New Version and Build Dependencies

apr and apr-util get extracted into the source tree's `srclib/` so that configure builds them in with `--with-included-apr`:

```bash
wget https://archive.apache.org/dist/httpd/httpd-2.4.46.tar.gz
wget https://archive.apache.org/dist/apr/apr-1.7.4.tar.gz
wget https://archive.apache.org/dist/apr/apr-util-1.6.3.tar.gz
tar -xzf httpd-2.4.46.tar.gz
tar -xzf apr-1.7.4.tar.gz  && mv apr-1.7.4    httpd-2.4.46/srclib/apr
tar -xzf apr-util-1.6.3.tar.gz && mv apr-util-1.6.3 httpd-2.4.46/srclib/apr-util
```

Verify: `ls httpd-2.4.46/srclib/` should show both `apr` and `apr-util` directories.

### Step 3: Compile and Install

`--prefix` points at a version-numbered directory of its own — this is the key to the whole procedure: the two sets of binaries never interfere, and switching or rolling back is just starting and stopping a different directory.

```bash
cd httpd-2.4.46
./configure --prefix=/usr/local/apache2.4.46 --with-included-apr
make
make install
```

The signal that compile and install succeeded is the new version's own `apachectl -v` reporting the target version. Tested output:

![Verifying compile and install](/images/csdn/figures/apache-csdn138910842-1.png)

### Step 4: Migrate the Config (the Step Most Likely to Bite)

Copy the old version's config files wholesale into the new version's directory:

```bash
cp -R /usr/local/apache2.4.41/conf/* /usr/local/apache2.4.46/conf/
```

Don't rush to start it after copying. `make install` writes each build's `ServerRoot` to its own prefix, so the copied-over httpd.conf still has `ServerRoot` pointing at `/usr/local/apache2.4.41` — and this is exactly where the test run tripped: the new version started with the old path, read the old version's pid file, and reported `httpd (pid xxx) already running` with no new instance on 8080 at all. Confirm with grep, then change it to the new prefix:

```bash
grep "^ServerRoot" /usr/local/apache2.4.46/conf/httpd.conf
sed -i "s|apache2.4.41|apache2.4.46|g" /usr/local/apache2.4.46/conf/httpd.conf
grep "^ServerRoot" /usr/local/apache2.4.46/conf/httpd.conf
```

This sed also replaces any other hard-coded old-prefix paths in the conf. Relative paths such as the modules directory all hang off ServerRoot, so fixing it fixes them.

### Step 5: Test the New Version

The core constraint of this step is that **the new version must not fight the running old version for port 80**. The migrated config Listens on 80, so starting it directly would collide; change Listen to a temporary test port (8080) first and switch it back after testing:

```bash
sed -i 's/^Listen 80/Listen 8080/' /usr/local/apache2.4.46/conf/httpd.conf
/usr/local/apache2.4.46/bin/apachectl -k start -f /usr/local/apache2.4.46/conf/httpd.conf
```

`-f` specifies which config file to read and cannot be omitted. After startup, curl both ports — the new version answers on 8080 while the old one keeps serving on 80, neither affected. Tested result:

![Old and new in parallel](/images/csdn/figures/apache-csdn138910842-2.png)

### Step 6: Switch Versions

Execute the switchover once testing is clean. Note that the new version is still running its test instance on 8080 at this point — stop it before restarting with the config changed back to 80:

```bash
sed -i 's/^Listen 8080/Listen 80/' /usr/local/apache2.4.46/conf/httpd.conf
/usr/local/apache2.4.46/bin/apachectl -k stop -f /usr/local/apache2.4.46/conf/httpd.conf
/usr/local/apache2.4.41/bin/apachectl -k stop
sleep 2
/usr/local/apache2.4.46/bin/apachectl -k start
```

One detail from testing worth recording: starting the new version immediately after stopping the old one hits `(98)Address already in use: AH00072: could not bind to address 0.0.0.0:80` — the old process's listening port hasn't been released yet. `sleep 2` before starting fixes it. Verification after the switchover: port 80 is now handled by 2.4.46, returning the new version's marker:

![Switchover complete](/images/csdn/figures/apache-csdn138910842-3.png)

Follow up with one more round of business-side curl checks on core endpoints and an error-log scan, and the upgrade is wrapped up. There is a seconds-level gap between stopping the old and starting the new — that's the boundary of this approach; for strictly zero downtime, drain the node at the load-balancer layer before switching.

### Post-Upgrade Monitoring

The switchover isn't the finish line. For the first hour, watch three things: whether `tail -f /usr/local/apache2.4.46/logs/error_log` shows new errors; whether `curl` response codes and latencies for core endpoints match pre-upgrade values; whether connection counts drop off abnormally. Log levels and module behavior can differ subtly between versions, and a full regression round before business peak beats any offline testing.

## Wrong Approaches and What They Cost

| Wrong approach | Actual consequence |
| --- | --- |
| Running `make install` directly over the old prefix | Old binaries replaced in place, rollback becomes impossible, downtime window maximized |
| Starting after migrating config without fixing `ServerRoot` | New version reads the old pid file and reports already running; the new instance never comes up |
| Starting the new version immediately after stopping the old | Port not yet released; reports `(98)Address already in use: AH00072` |
| Starting the new version without `-f` | Reads config from the default path; what you tested and what you switch may not be the same file |

Two of these — ServerRoot and port release — actually reproduced during this test run. The avoidance rule boils down to one sentence: independent directory + explicit paths + allow time for the port to be released.

## How to Roll Back When Something Goes Wrong

Rolling back is the switchover in reverse: `/usr/local/apache2.4.46/bin/apachectl -k stop` stops the new version, wait a second or two, then `/usr/local/apache2.4.41/bin/apachectl -k start` brings the old one back. The old directory was never touched throughout — that's the most valuable property of the independent-directory design.

## Notes and Caveats

- Always back up config files and necessary data before upgrading; that's your confidence in the rollback if the switchover fails.
- Test the new version thoroughly before the real switchover: config compatibility and service stability should both be settled in testing, never carried into production.
- After migrating config you must check `ServerRoot` — it's the biggest hidden pit of the dual-directory upgrade, with the symptom "already running" but no new instance anywhere.
- Seeing `AH00558: Could not reliably determine the server's fully qualified domain name` at startup is only a reminder and doesn't affect service; setting `ServerName` in httpd.conf clears it (the test environment showed the same message).
- Always download historical versions from archive.apache.org; the downloads main site keeps only the current recommended version, and wget-ing main-site links gets you a 404.

> This post was rewritten from the author's CSDN blog articles originally published between 2020 and 2024 on CSDN.
