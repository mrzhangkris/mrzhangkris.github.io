---
title: "Running Tomcat in Daemon Mode with jsvc: Tested on Rocky Linux 9"
date: 2020-03-25 01:04:21
updated: 2026-09-14
categories: [Tech, Tomcat]
tags: [Tomcat]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1519086588705-c935fdedcc14?w=1600&q=80&fm=jpg
lang: en
---

A Tomcat started with `startup.sh` hangs off your current shell: closing the terminal or dropping the session can take the process down with it, and permission management is all-or-nothing through the starting user. Daemon mode uses jsvc to turn Tomcat into a proper service process: a root-side controller handles startup and signal handling, while the JVM runs under a dedicated non-login user, with start/stop managed through the companion `daemon.sh start/stop`. This post walks the whole process on Rocky Linux 9 with Tomcat 9.0.121 + OpenJDK 11 — compiling jsvc, configuring daemon.sh, verifying startup, and closing the loop on shutdown.

Follow it end to end and you'll end up with: a compiled jsvc, a daemon-mode Tomcat running as the tomcat user, and a reusable set of start/stop commands.

## Prerequisites

- OS: Rocky Linux 9 (this post was tested in a rockylinux:9 container, aarch64)
- Software versions: Tomcat 9.0.121 (official tarball), commons-daemon 1.6.1, java-11-openjdk 11.0.25
- Privileges: root or sudo (needed for compiling and creating the user)
- Network: access to the tomcat.apache.org download source

## Install Dependencies and Prepare the User

jsvc is a C program, so the build toolchain and the JDK headers are both non-negotiable. One command installs everything on Rocky 9:

```bash
dnf install -y java-11-openjdk-devel gcc make wget tar gzip
```

Note that you install `java-11-openjdk-devel`, not the runtime package — only the devel variant ships the include headers that the configure step needs. Confirm the versions afterward:

![Figure 1](/images/csdn/figures/tomcat-daemon-csdn105083974-1.png)

Create a dedicated non-login user; Tomcat will run under this identity from here on:

```bash
groupadd tomcat
useradd -g tomcat -s /usr/sbin/nologin tomcat
```

Then download and extract Tomcat; this post installs it under /opt:

```bash
cd /opt
wget https://dlcdn.apache.org/tomcat/tomcat-9/v9.0.121/bin/apache-tomcat-9.0.121.tar.gz
tar -zxf apache-tomcat-9.0.121.tar.gz
```

One misconception to clear up first: quite a few sources online (including an earlier version of this post) claim that recent Tomcat releases ship a ready-made jsvc in the bin directory, no compiling needed. **9.0.121, tested, is not like that** — bin/ contains only the `commons-daemon-native.tar.gz` source archive, `daemon.sh` is there too, but the jsvc binary is not. The compile step cannot be skipped; the good news is that on a fresh system it passes on the first try.

## Compile jsvc

Enter Tomcat's bin directory, unpack the source archive, and build in the unix subdirectory:

```bash
cd /opt/apache-tomcat-9.0.121/bin
tar -zxf commons-daemon-native.tar.gz
cd commons-daemon-1.6.1-native-src/unix
```

`--with-java` must point at the actual JDK path (`readlink -f /usr/lib/jvm/java-11-openjdk` gets you there). Once configure passes, run make:

```bash
./configure --with-java=/usr/lib/jvm/java-11-openjdk-11.0.25.0.9-7.el9.aarch64
make
```

Tested output:

![Figure 2](/images/csdn/figures/tomcat-daemon-csdn105083974-2.png)

When configure prints `*** All done ***` the checks have passed; after make finishes, the jsvc executable appears in the current directory. Copy it into Tomcat's bin directory:

```bash
cp jsvc ../../
```

With dependencies installed, configure passed on the first run on Rocky 9 — none of the classic triple failures from older posts ("missing gcc, missing JDK headers, missing make"). Those belong to older environments and are kept for reference in the "Historical Version Differences" section at the end.

## Configure Daemon Mode

First hand directory ownership to the tomcat user and make daemon.sh executable:

```bash
cd /opt/apache-tomcat-9.0.121
chown -R tomcat:tomcat .
chmod a+x bin/daemon.sh
```

Two settings inside daemon.sh relate to the runtime identity. The default of `TOMCAT_USER` is already tomcat, so if you created a user with that name this line needs no change:

```bash
test ".$TOMCAT_USER" = . && TOMCAT_USER=tomcat
```

JAVA_HOME handling has changed over the years. In 9.0.121's daemon.sh there is no `# JAVA_HOME=/opt/jdk-...` comment line left to uncomment; the current logic is: when unset, the JDK path is inferred automatically from the java on PATH, and the `--java-home` argument also supports passing it explicitly. **Passing it explicitly is recommended** — I tested this in a minimal container: when the environment has no which command, auto-detection fails and jsvc receives an empty -java-home argument; explicit specification removes that environmental dependency:

```bash
bin/daemon.sh --java-home /usr/lib/jvm/java-11-openjdk-11.0.25.0.9-7.el9.aarch64 start
```

## Start and Verify

After start, wait about ten seconds for Tomcat to finish initializing, then verify on two levels:

![Figure 3](/images/csdn/figures/tomcat-daemon-csdn105083974-3.png)

Functional level: `curl http://localhost:8080/` returns 200 and a browser opens the Tomcat welcome page (if a remote machine can't reach it, first check whether the firewall allows 8080). Log level: `logs/catalina-daemon.out` showing `Server startup in [N] milliseconds` and `Starting ProtocolHandler ["http-nio-8080"]` means success.

## Day-to-Day Operations

```text
bin/daemon.sh start   Start
bin/daemon.sh stop    Stop
bin/daemon.sh version Show version
logs/catalina-daemon.out View logs
```

The daemon-mode process structure is worth a look — it's the essential difference from startup.sh:

![Figure 4](/images/csdn/figures/tomcat-daemon-csdn105083974-4.png)

The jsvc under root is the control process (pid file at `logs/catalina-daemon.pid`); the child it forks switches to the tomcat user to run the JVM. After stop, probe 8080 with curl once more — connection refused means the stop completed. On exit jsvc also removes the pid file, a detail you can use as corroboration that stopping succeeded. The tested process arguments also reveal two thoughtful defaults: `-wait 10` makes the start command wait until Tomcat has truly finished initializing before returning (instead of firing the signal and walking away), and `-umask 0027` tightens the default permissions of new files to group-readable.

Besides start, there is one more subcommand: `run` — foreground mode, with logs printed directly to the current terminal:

![Figure 5](/images/csdn/figures/tomcat-daemon-csdn105083974-5.png)

One difference from start is easy to get wrong: run mode does not switch identity — tested in the foreground, both jsvc processes run as root; the tomcat user isolation only applies in start mode. The process hangs in the foreground, so closing the terminal or killing it manually takes Tomcat down with it. It's the most convenient mode for tweaking config and watching startup errors; for anything long-running in production, use start/stop.

## When Startup Fails, Look Here First

If curl can't get through after start, troubleshoot in this order:

- **Check the logs**: `logs/catalina-daemon.out` collects all startup output; the last line before `Server startup in [N] milliseconds` is usually the failure reason. Access logs are written daily to `logs/catalina.YYYY-MM-DD.log`.
- **Check the process arguments**: `ps -ef | grep jsvc` — check whether `-java-home` is empty. If it is, daemon.sh's auto-detection didn't kick in; switch to an explicit `--java-home` (a pit this post's testing actually hit).
- **Check the port**: startup fails when 8080 is already taken by another process; use `ss -ltnp | grep 8080` to see who holds it. If remote machines can't reach the server but local curl works, the firewall isn't allowing the port (under firewalld: `firewall-cmd --permanent --add-port=8080/tcp && firewall-cmd --reload`).

> Note: the two firewalld commands were not executed inside the container (containers have no systemd); they are standard firewalld usage. Every other troubleshooting item above was tested in this run.

## Historical Version Differences (CentOS 8, Recorded 2020)

When the original article was first configured on CentOS 8 + Tomcat 9.0.33, it hit three configure errors. Their signatures are preserved here so readers on older environments can match their symptoms:

1. `configure: error: no acceptable C compiler found in $PATH` — no compiler installed; `dnf install gcc`.
2. `configure: error: Java Home not defined. Rerun with --with-java=... parameter` — JDK missing or path not given; install `java-11-openjdk-devel` and add `--with-java=<JDK path>`.
3. `Cannot find jni_md.h ... You should retry --with-os-type=SUBDIR` — incomplete JDK headers. This pit is specific to older JDK layouts; on Rocky 9 with java-11-openjdk-devel installed, no --with-os-type argument was needed and configure passed directly.

Also, the older advice of "edit daemon.sh and uncomment `# JAVA_HOME=/opt/jdk-...`" only applies to old script versions; on 9.0.x use the `--java-home` argument or an environment variable as described above.

## Notes and Caveats

- Don't skip `chown -R tomcat:tomcat`. In daemon mode Tomcat writes to logs, temp, and work as the tomcat user; wrong directory ownership is the most common "started fine but can't write logs" failure.
- Explicit JAVA_HOME is the most reliable option. Auto-detection depends on the java on PATH and the which command, either of which can be missing on a minimal system.
- The tomcat user is a non-login account (`/usr/sbin/nologin`) meant for running the service; don't take the shortcut of running the JVM as root.
- If a project needs to read or write directories outside Tomcat's tree, grant the tomcat user access separately — daemon mode has no root privileges to fall back on.
- Rollback plan: `bin/daemon.sh stop`, then just delete the Tomcat directory (it's a tarball install, no package management involved); when it's no longer needed, `userdel tomcat` cleans up the user.

What daemon mode buys you is two concrete things: the process survives session exit, and the JVM no longer runs as root. The cost is one jsvc compile and one dedicated user — both steps tested smooth on Rocky 9. Follow along and you're done.

> This post was rewritten from the author's CSDN blog articles originally published between 2020 and 2024 on CSDN.
