---
title: "Writing a Shell Script That Restarts Tomcat Automatically"
date: 2024-05-17 08:45:00
lang: en
updated: 2026-09-14
categories: [Tech, Tomcat]
tags: [Tomcat]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1570993492881-25240ce854f4?w=1600&q=80&fm=jpg
---

A Tomcat instance that runs long enough will eventually hit a memory leak or need a redeployment, and one clean automatic restart beats manually logging into the server every time. But the most common mistake in a "restart script" is **getting the process up while never verifying anything**. This post takes the original article's classic script as the starting point, runs it on a Rocky Linux 9 container (Tomcat 10.1.59) and uncovers one false-positive defect in actual testing, then presents a corrected version: graceful waiting, empty-value checks, PID comparison, and HTTP probing — a four-step closed loop.

## Environment Assumptions

Read/write/execute permissions on the Tomcat installation directory (this post assumes it's installed at `/opt/tomcat`), `JAVA_HOME` available, and `curl` on the PATH (for health probing).

## The Original Script

Stop, wait 10 seconds, force-kill any leftovers, start up, then compare PIDs before and after to judge success or failure:

```bash
#!/bin/bash
##########################################################################################
####                             Restart tomcat                                       ####
##########################################################################################

# Tomcat install path
TOMCAT_PATH="/opt/tomcat"

# Stop Tomcat
echo -e "\033[33mStopping Tomcat...\033[0m"
$TOMCAT_PATH/bin/shutdown.sh > /dev/null

# Wait for Tomcat to stop completely
sleep 10

# Check whether the Tomcat process still exists, and kill it if it does
PID=$(ps -ef | grep $TOMCAT_PATH | grep "${process_keyword}" | grep -v grep | awk '{print $2}')
if [[ -n $PID ]]; then
  echo -e "\033[33mKilling Tomcat process ID $PID\033[0m"
  kill -9 $PID
fi

# Start Tomcat
echo -e "\033[33mStarting Tomcat...\033[0m"
$TOMCAT_PATH/bin/startup.sh > /dev/null

# Get the PID after restart
NEWPID=$(ps -ef | grep $TOMCAT_PATH | grep "${process_keyword}" | grep -v grep | awk '{print $2}')

# Same PID means the restart failed
if [ "$PID" == "$NEWPID" ]
then
   echo -e "\033[31mTomcat restarted failed!\033[0m"
fi

# Different PID means the restart succeeded
if [ "$PID" != "$NEWPID" ]
then
   echo -e "\033[32mTomcat restarted successfully\033[0m"
fi
```

> Note: the `${process_keyword}` variable in the two `grep "${process_keyword}"` calls is never defined in the script — leftover template residue. When `${process_keyword}` is empty, `grep ""` matches every line, which is equivalent to dropping that filter, and the script still works; define it first if you actually need keyword filtering.

Measured in the normal scenario — Tomcat is running, execute the script, the process gets replaced, and 8080 returns 200 again after 8 seconds:

![Figure 1](/images/csdn/figures/tomcat-csdn138898541-1.png)

Note the `sleep 8` before `curl`: startup.sh returning only means the JVM process is up. Spring-style applications need another few seconds to a few tens of seconds to initialize; probing immediately will only get you 000.

## The False-Positive Defect Found in Testing

Temporarily move the java binary away (simulating a production java upgrade / path change incident), then run the original script:

![Figure 2](/images/csdn/figures/tomcat-csdn138898541-2.png)

The script reports `successfully`, while the actual java process count is 0 — nothing was started at all. The chain: shutdown.sh fails silently because java is missing (its output is swallowed by the redirect) → the old process gets `kill -9` → startup fails silently → `NEWPID` is empty. An empty string doesn't equal the old PID, so the judgment falls into "different PID = success".

That is the original script's core defect: **a single-condition judgment on "did the PID change", with no empty-value check on the new process**. On top of that, `kill -9` is a hard kill that gives the process no chance for graceful shutdown, and `sleep 10` is an arbitrary fixed wait — a slow-stopping process gets killed prematurely.

## The Corrected Script

Four fixes: graceful stop changed to a polling wait (up to 15 seconds), an empty-value check on the new process, an added HTTP probe, and a unified non-zero exit on failure:

```bash
#!/bin/bash
TOMCAT_PATH="/opt/tomcat"
PAT="catalina.home=$TOMCAT_PATH"

echo "[1/4] stopping..."
"$TOMCAT_PATH/bin/shutdown.sh" >/dev/null 2>&1
for i in $(seq 1 15); do
  pgrep -f "$PAT" >/dev/null || break
  sleep 1
done
OLDPID=$(pgrep -f "$PAT")
if [[ -n $OLDPID ]]; then
  echo "      force killing $OLDPID"
  kill -9 $OLDPID; sleep 1
fi

echo "[2/4] starting..."
"$TOMCAT_PATH/bin/startup.sh" >/dev/null 2>&1
sleep 3
NEWPID=$(pgrep -f "$PAT")

echo "[3/4] checking process..."
if [[ -z $NEWPID ]]; then
  echo "      FAIL: no new process, check catalina.out"; exit 1
fi
if [[ "$OLDPID" == "$NEWPID" ]]; then
  echo "      FAIL: pid unchanged"; exit 1
fi

echo "[4/4] health check (up to 20s)..."
CODE=000
for i in $(seq 1 10); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:8080/ || true)
  [[ $CODE == 200 ]] && break
  sleep 2
done
if [[ $CODE == 200 ]]; then
  echo "OK: restarted successfully (pid $NEWPID, http $CODE)"
else
  echo "FAIL: process up but http $CODE"; exit 1
fi
```

Both paths were measured — the same missing-java scenario makes the corrected version report `FAIL` and exit with code 1; after the environment is restored, the whole flow runs through end to end:

![Figure 3](/images/csdn/figures/tomcat-csdn138898541-3.png)

`pgrep -f "catalina.home=/opt/tomcat"` is shorter and more precise than the original's `ps | grep | grep -v grep | awk` chain: catalina.home only ever appears in the command line of Tomcat's own process, so it can't accidentally match grep itself.

## Script Permissions and Scheduled Runs

```bash
chmod +x restart_tomcat_v2.sh
```

For scheduled restarts (e.g. 2 a.m. daily), add it to crontab — always redirect the log; otherwise a middle-of-the-night failure goes unnoticed:

```text
0 2 * * * /path/to/restart_tomcat_v2.sh >> /var/log/tomcat-restart.log 2>&1
```

## Notes and Cautions

- **The judgment needs three gates**: an empty-value check on the new process, a PID comparison, and an HTTP probe — all indispensable. The original's single-condition PID comparison is guaranteed to produce a false positive when startup fails silently (reproduced in testing).
- **Leave initialization time after startup before probing**: there's a delay of seconds to tens of seconds between the Tomcat process coming up and 8080 becoming usable; polling with retries is far more reliable than a one-shot judgment.
- **Graceful first, hard kill as the fallback**: run shutdown, then poll and wait, reserving `kill -9` for processes that truly won't stop — especially important for consistency-sensitive applications.
- **Use absolute paths in crontab and write the log to disk**: cron's PATH differs from your login shell's, so both `java` and `curl` may not be found; without the log on disk you're flying blind.
- **Run it off-peak**: a restart means seconds of unavailability — pick a business low-traffic window, and make sure monitoring mutes the alerts for that restart.

The real value of a restart script is not "it can restart", but "it dares to say it failed when the restart fails". Three verification gates plus a non-zero exit code are what make the script trustworthy once it's wired into your monitoring and alerting pipeline.

> This article was rebuilt from the author's CSDN blog posts published between 2020 and 2024, originally published on CSDN.
