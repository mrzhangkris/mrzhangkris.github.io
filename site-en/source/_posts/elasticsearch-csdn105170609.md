---
title: "Installing Elasticsearch 7.6.1: Manual tarball Deployment with a Custom JDK"
date: 2020-03-29 10:05:30
categories: [Tech, Elasticsearch]
lang: en
tags: [Elasticsearch]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1762163516269-3c143e04175c?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

To get Elasticsearch running quickly on Linux, manual deployment with the official tarball is the most direct route. This post records the complete installation of Elasticsearch 7.6.1 (the no-jdk build, which ships without a JDK): install the JDK first, create a dedicated user, then extract, point the setup at the JDK path, start, and verify. Every step carries a verification point, and the key error messages all come from real runs.

What you end up with is a single-node ES listening on port 9200, where `curl 127.0.0.1:9200` returns the version JSON and the cluster health is green.

## Prerequisites

- OS: Linux x86_64 (the live test environment for this post was a rockylinux:9 container, linux/amd64, with the ES 7.6.1 no-jdk tarball; the flow is identical on other distributions—platform-specific errors are covered under "Common Errors")
- JDK: 11 (ES 7.6.1 officially supports JDK 11; the no-jdk build doesn't include one, so it must be installed first)
- Privileges: root (for the installation phase) plus a regular user (for the run phase—ES refuses to start as root)
- System parameters: `vm.max_map_count ≥ 262144` and file descriptors ≥ 65536 (the bootstrap checks at ES startup enforce these)
- Disk/memory: the default heap is 1GB (-Xms1g -Xmx1g); reserve space on the data disk

## Installing the JDK

Install the basic tools first, then the JDK:

```bash
dnf install -y wget tar
dnf install -y java-11-openjdk.x86_64
```

On Rocky 9, `/usr/bin/yum` is a symlink to dnf, so the old command still works; on CentOS 7, just swap dnf back for yum.

Verification point: `java --version` outputs openjdk 11.x. The actual install was 11.0.25:

![Figure 1](/images/csdn/figures/elasticsearch-csdn105170609-1.png)

`dnf search jdk` lists all JDK packages in the repos by keyword (the original post used `yum search "*jdk*"` to find the package name; the two are equivalent). Pick `java-11-openjdk` from the results and install it. OpenJDK installs under /usr/lib/jvm/ by default, and that's the path you'll need for JAVA_HOME later.

## Creating the elasticsearch User and Group

```bash
groupadd es
useradd es -g es
```

Verification point: `id es` outputs the uid/gid. `groupadd` creates the es group; `useradd` creates the es user, with `-g` assigning it to the es group.

Why create the user first: **Elasticsearch refuses to start as root**. This is a hard restriction—running it directly as root gets rejected (the actual error appears later in this post). So you need a regular user ready beforehand.

## Downloading and Extracting the Package

Download the package from the [Elasticsearch website](https://www.elastic.co/cn/downloads/elasticsearch). This post uses elasticsearch-7.6.1 in the no-jdk build (the package doesn't include a JDK, which is why the JDK had to be installed first):

```bash
wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-7.6.1-no-jdk-linux-x86_64.tar.gz
tar -zxf elasticsearch-7.6.1-no-jdk-linux-x86_64.tar.gz
```

Verification point: after extraction you get an `elasticsearch-7.6.1/` directory containing bin, config, lib, and other subdirectories.

> Field note: the download URL above was re-verified on 2026-09-14 and still works (HTTP 200, 148131656 bytes).

## Specifying the JDK Path in elasticsearch-env

The no-jdk build carries no JDK of its own, so the startup script errors out immediately when it can't find Java:

```text
could not find java in bundled jdk at .../elasticsearch-7.6.1/jdk/bin/java
```

You need to declare JAVA_HOME in the startup script's environment file. Edit bin/elasticsearch-env, locate the line that checks JAVA_HOME (in 7.6.1 it's line 39, `if [ ! -z "$JAVA_HOME" ]; then`), and insert the assignment on the line **above** it:

```bash
cd elasticsearch-7.6.1/bin/
vim elasticsearch-env
```

What to insert (replace the path with your own JDK path—`ls -d /usr/lib/jvm/java-11-openjdk-*` will show it; the path below is the real one from this Rocky 9 run):

```bash
# now set the path to java
JAVA_HOME=/usr/lib/jvm/java-11-openjdk-11.0.25.0.9-7.el9.x86_64
if [ ! -z "$JAVA_HOME" ]; then
  JAVA="$JAVA_HOME/bin/java"
  JAVA_TYPE="JAVA_HOME"
```

Verification point: `grep JAVA_HOME bin/elasticsearch-env` shows the inserted assignment line.

> Field note: the 7.6.1 elasticsearch-env has **no** commented-out `#JAVA_HOME=` line to uncomment—you can only insert the assignment manually before the if check. Many tutorials online say "uncomment the line"; if you can't find that comment in this version, that's normal.

## Adjusting System Parameters

The bootstrap checks at ES startup enforce two system parameters and refuse to start if they fall short (in production mode):

```bash
# virtual memory map count (run as root)
sysctl -w vm.max_map_count=262144
echo 'vm.max_map_count=262144' >> /etc/sysctl.conf

# file descriptors (applies to the es user)
echo 'es soft nofile 65536' >> /etc/security/limits.conf
echo 'es hard nofile 65536' >> /etc/security/limits.conf
```

Verification point: `cat /proc/sys/vm/max_map_count` outputs ≥ 262144; `su es -c 'ulimit -n'` outputs 65536.

## Starting elasticsearch

Hand the installation directory to the es user, then start as es. Two path issues hit during the actual run, so let's clear them up front:

- **Don't put the installation directory under /root.** The es user can't enter /root (mode 700), so after `su es` a `cd` fails outright with Permission denied—in this run the problem was solved by placing the directory under /opt;
- **Minimal systems need procps-ng.** The `-d` background start depends on the `ps` command, and on a Rocky 9 minimal environment (container) the run hit `./elasticsearch: line 58: ps: command not found`—`dnf install -y procps-ng` fixes it.

```bash
mv elasticsearch-7.6.1 /opt/            # don't put it under /root
dnf install -y procps-ng                # add the ps command on minimal systems
chown -R es:es /opt/elasticsearch-7.6.1
su es
cd /opt/elasticsearch-7.6.1/bin/
./elasticsearch          # start in the foreground
./elasticsearch -d -p /tmp/es.pid   # start in the background and record the PID
```

**If you forget to switch users and start directly as root**, you'll see this error, captured during the actual run—the most classic rejection in the entire ES installation process:

![Figure 2](/images/csdn/figures/elasticsearch-csdn105170609-2.png)

## Verification

Open a new terminal and hit port 9200 with curl; a response with version info means the startup succeeded:

```bash
curl 127.0.0.1:9200
```

Verification point: the response is JSON and `version.number` is 7.6.1. Actual output (excerpt):

![Figure 3](/images/csdn/figures/elasticsearch-csdn105170609-3.png)

Then confirm the cluster health:

```bash
curl '127.0.0.1:9200/_cluster/health?pretty'
```

A single-node empty cluster should return `"status" : "green"` (actual result). If it shows yellow, it's usually because replica shards have nowhere to be allocated (a single node has no second node to host replicas). It doesn't affect an empty cluster—set `number_of_replicas` to 0 when creating indices and it turns green.

## Common Errors

- **`could not find java in bundled jdk`**: the no-jdk build has no JAVA_HOME configured—insert the assignment in elasticsearch-env as described above. If you'd rather skip that step, switch to the bundled-JDK package (its filename has no -no-jdk).
- **`can not run elasticsearch as root`**: you started it as root—switch to a regular user (es in this post) and run again.
- **`max virtual memory areas vm.max_map_count [65530] is too low`**: blocked by a bootstrap check—adjust sysctl as described above.
- **`max file descriptors [4096] for elasticsearch process is too low`**: same idea—adjust limits.conf, then re-login as the es user for it to take effect.
- **`failed to obtain node locks, tried [[.../data]] with lock id [0]`**: the data directory is locked by another ES process—usually the previous node is still running (first `kill $(cat /tmp/es.pid)` or find the process with `jps`); it can also mean an old cluster's data directory was reused, in which case empty it or use a different directory.
- **No 7.6.1 available for ARM machines**: 7.6.1 officially shipped only a linux-x86_64 build (the aarch64 tarball download link returned 404 as tested on 2026-09-14); the official linux-aarch64 builds only start from 7.8 (the 7.8.1 aarch64 package returned HTTP 200 as tested). On ARM, either upgrade the version or use the official Docker image to handle the cross-architecture situation.

## Things to Watch Out For

- Elasticsearch refuses to start as root, so always run it with the es user created earlier; the installation directory needs `chown -R es:es`, otherwise the es user can't write to the data/logs directories.
- The no-jdk package ships without a JDK, so JAVA_HOME must be set in elasticsearch-env before startup, or it won't come up; if you'd rather skip that step, switch to the bundled-JDK package.
- Verification only requires checking the response on port 9200: `version.number` in the returned JSON is the currently running version.
- `./elasticsearch` runs in the foreground and the process follows the terminal; once verified, switch to the `-d` background mode or systemd management as needed.
- The heap defaults to 1GB; in production set it to half the machine's memory (change -Xms/-Xmx in config/jvm.options), and the two values must be equal.
- Rollback plan: a tarball deployment leaves no system services behind—stop the process (`kill $(cat /tmp/es.pid)`), delete the extracted directory, and it's fully uninstalled; restore the sysctl/limits changes as needed.

From installing the JDK to a green curl, the pitfalls of the whole flow concentrate in three places: the no-jdk build needs JAVA_HOME set manually, root can't start it, and the bootstrap checks intercept system parameters. Clear those three hurdles, and a tarball-deployed ES is a clean presence—unzip and it works, delete the directory and it's gone.

> This article was rewritten from the author's CSDN blog posts originally published between 2020 and 2024.
