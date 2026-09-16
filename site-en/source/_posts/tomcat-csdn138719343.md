---
title: "Troubleshooting Tomcat Startup Crashes: Causes and Fixes"
date: 2024-05-11 16:00:13
updated: 2026-09-14
lang: en
categories: [Tech, Tomcat]
tags: [Tomcat]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1515965885361-f1e0095517ea?w=1600&q=80&fm=jpg
---

Tomcat starts and the process exits immediately, leaving no time even to read the logs — a classic "flash crash." The most deceptive part is that `startup.sh` always reports `Tomcat started.`, while the truth lives entirely in `logs/catalina.out`. This article reproduces the three most common crash scenes one by one on a Rocky Linux 9 container (Tomcat 10.1.59, OpenJDK 17): missing environment variables, an occupied port, and memory overrun — with the fix and verification method for each.

## The Symptoms

The unified appearance of a flash crash is "the script says started, but the process is gone":

```text
$ /opt/tomcat/bin/startup.sh
Tomcat started.
$ ps -ef | grep catalina.home | grep -v grep
(no output — the process has vanished)
```

The other kind is more direct: the script refuses to run on the spot, prints `Neither the JAVA_HOME nor the JRE_HOME environment variable is defined`, and exits. Either way, there is only one criterion — no java process in `ps` and no response on 8080.

## Cause Analysis (Ordered by Likelihood)

1. **Environment variables**: `JAVA_HOME` unset, pointing to the wrong directory, or no java on the machine at all. When startup.sh cannot find java, it refuses to start outright — the number-one source of beginner crashes.
2. **Port occupied**: something (usually a previous Tomcat that didn't die cleanly) is already listening on 8080. The JVM is launched, fails to bind, then exits — which is why the script still reports `Tomcat started.`; the most misleading case.
3. **JVM memory overrun**: `-Xms`/`-Xmx` set larger than the machine's (or container's) available memory. The JVM fails to allocate during initialization and the process exits on the spot.
4. **Web application misconfiguration**: some application under `webapps` breaks class loading or context initialization and drags the whole instance down — remove the application first and observe.

## Fixing Each Case

### Scene 1: JAVA_HOME / java Missing

![Figure 1](/images/csdn/figures/tomcat-csdn138719343-1.png)

Fix: set `JAVA_HOME` to the JDK root (after `dnf install java-17-openjdk-headless` on Rocky 9, that is `/usr/lib/jvm/java-17`), and confirm `java -version` works. Verify: run `startup.sh` again; `echo $?` returns 0 and `ps` shows the java process.

### Scene 2: Port 8080 Occupied

![Figure 2](/images/csdn/figures/tomcat-csdn138719343-2.png)

The key line in `catalina.out` is `SEVERE: Failed to initialize component [Connector["http-nio-8080"]]`, with the root cause `java.net.BindException: Address already in use`. Two fixes, pick one:

- Find the occupier and deal with it: `ss -lntp | grep :8080` gives you the PID directly;
- Give Tomcat a different port by editing the Connector in `conf/server.xml`:

```xml
<Connector port="8081" protocol="HTTP/1.1"
           connectionTimeout="20000"
           redirectPort="8443" />
```

Note the shutdown port 8005 works the same way — when running multiple instances side by side, every instance's 8005/8080 pair must differ. Verify: after changing the port or clearing the occupier, restart and `curl http://127.0.0.1:8081/` returns 200.

### Scene 3: JVM Memory Overrun

![Figure 3](/images/csdn/figures/tomcat-csdn138719343-3.png)

Fix: in `bin/setenv.sh` (create it if missing), bring the parameters within what the machine can bear:

```bash
export CATALINA_OPTS="$CATALINA_OPTS -Xms512M -Xmx2048M"
```

Verify: after restart, `ps -ef | grep java` shows `-Xmx2048M` in effect, the process stays alive, and 8080 returns 200.

### Scene 4: Caused by a Web Application

Fix: locate it by bisection — "remove, restart, observe": move the suspicious application directory or war out of `webapps`, restart, and see whether things recover; if they do, bisect by putting items back until the culprit is found. Verify: the process stays stable after removal.

### The Uniform Verification Standard After Any Fix

![Figure 4](/images/csdn/figures/tomcat-csdn138719343-4.png)

Only a three-step confirmation after every fix closes the loop: the process is alive (`ps -ef | grep catalina.home` has output), the port answers (`curl -s -o /dev/null -w '%{http_code}'` returns 200), and the home page content is right (the version number in the title matches expectations).

## Prevention After the Fact

- **Fixed troubleshooting order**: read `catalina.out` first for the original error, then eliminate in the order environment variables → port → memory → application. Far faster than random guessing.
- **Never trust `Tomcat started.`**: it only means the script finished; liveness is always judged by `ps` + `curl`.
- **Memory parameters go into setenv.sh with headroom**: `-Xmx` no more than seventy percent of the machine's available memory; in containers, add `-XX:MaxRAMPercentage` so the JVM respects cgroup limits.
- **Plan ports for multiple instances**: one set of 8005/8080/8443 per instance, and pre-check with `ss -lntp` before going live.
- **Environment variables belong in a systemd unit or profile**: manually `export`ed variables are lost the moment a different person or machine takes over; writing JAVA_HOME into `tomcat.service`'s `Environment=` is the reliable way.

The essence of flash-crash troubleshooting is "collect evidence before acting": catalina.out gives the direction, ps gives life or death, curl gives the verdict. Turn the handling of these three scenes into muscle memory, and most Tomcat startup failures close within ten minutes.

> This article was reconstructed from the author's CSDN blog posts from 2020–2024, originally published on CSDN.
