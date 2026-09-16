---
title: "Rotating Nginx Logs: Two Approaches with a Bash Script and logrotate"
date: 2024-05-13 15:13:45
updated: 2026-09-14
lang: en
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1667264501379-c1537934c7ab?w=1600&q=80&fm=jpg
---

Run Nginx long enough and access.log bloats until even grep chokes. Log rotation has to solve two things: archive and compress the old logs on a schedule, while getting nginx to switch to a fresh file and keep writing. This post presents two approaches: a hand-written Bash script, and the system's built-in logrotate. Both were tested in an nginx/1.31.5 container (logrotate 3.22.0); all outputs come from real runs.

## Lab Environment

An nginx/1.31.5 container (`nginx:alpine`), with logs as regular files (not the container default stdout symlinks — this very difference is one cluster of pitfalls later in the post); logrotate 3.22.0 from the apk repos.

## Approach One: Bash Script

Assume the access log lives at `/var/log/nginx/access.log`:

```bash
#!/bin/bash

LOG_FILE="/var/log/nginx/access.log"
ARCHIVE_DIR="/var/log/nginx/archive"

# Create the archive directory if it does not exist
if [ ! -d "$ARCHIVE_DIR" ]; then
    mkdir -p $ARCHIVE_DIR
fi

# gzip the log file and move it into the archive directory
DATE=$(date +"%Y%m%d%H%M%S")
mv $LOG_FILE "$ARCHIVE_DIR/access_$DATE.log"
gzip "$ARCHIVE_DIR/access_$DATE.log"

# Reopen the log file so Nginx keeps writing the new one
kill -USR1 $(cat /var/run/nginx.pid)
```

The script does three things:

- Creates the archive directory first if it does not exist.
- Moves the current log into the archive directory and gzip-compresses it, with a timestamp in the filename so archives never overwrite each other.
- Sends USR1 to the nginx master process so it reopens its log files. This step cannot be skipped: nginx writes logs through a file handle, and if you do not notify it, logging continues into the old file that was just moved away, while the new access.log stays empty forever.

Put the script in crontab to run once a day. Measured (nginx/1.31.5 container): the archive lands as `.log.gz`, and after USR1 new requests are written into the new access.log:

![Figure 1](/images/csdn/figures/bash-logrotate-nginx-csdn138804009-1.png)

## Approach Two: logrotate

logrotate is the dedicated log-management tool on Linux: it rotates logs periodically, compresses old logs, deletes expired archives; the rules live in configuration files, executed periodically by the system's cron.

Assume an OpenResty setup with two access logs, located at:

- /apps/openresty/nginx/logs/head/access.log
- /apps/openresty/nginx/logs/domain/access.log

Create a file named `nginx` in the `/etc/logrotate.d` directory:

```conf
/apps/openresty/nginx/logs/head/access.log
/apps/openresty/nginx/logs/domain/access.log
{
        daily                        # rotate daily
        missingok                    # ignore errors
        rotate 7                    # how many archives to keep at most
        compress                     # compress after rotating
        delaycompress                # the compression happens at the next rotation
        notifempty                   # skip rotation if the log is empty
        create 640 qhdrsj qhdrsj     # permissions of the rotated file
        sharedscripts                # shared script; the result is empty
        postrotate                   # closing action: regenerate nginx logs
                if [ -f /apps/openresty/nginx/logs/domain/nginx.pid ]; then
                        kill -USR1 `cat /apps/openresty/nginx/logs/domain/nginx.pid`
                fi
                if [ -f /apps/openresty/nginx/logs/head/nginx.pid ]; then
                        kill -USR1 `cat /apps/openresty/nginx/logs/head/nginx.pid`
                fi
        endscript                    # end of actions

}
```

What each option means:

- daily: rotate the logs once a day.
- missingok: no error when a log file is missing.
- rotate 7: keep the 7 most recent archives; older ones are deleted automatically.
- compress: gzip after rotation.
- delaycompress: delay compression — the previous rotation's file is compressed only at the next rotation.
- notifempty: skip rotation when the log file is empty.
- create: sets the permissions and owner of the new log file created after rotation. `qhdrsj` was the user running nginx in the original environment; substitute your own worker user when deploying.
- sharedscripts: when multiple log files rotate together, the script runs only once.
- postrotate / endscript: actions executed after rotation. Here, USR1 is sent to each of the two nginx instances' master processes so they reopen their log files.

One detail visible only through testing: after logrotate creates the new file per `create 640 qhdrsj qhdrsj`, USR1 makes nginx reopen the log, and the master process rewrites the owner to the worker user (measured: the new file's owner became `nginx:qhdrsj` with the 640 mode preserved) — when a worker cannot write the log because the owner mismatches, think of this layer first.

Both log files live in one configuration, and with sharedscripts the USR1 signal goes out in a single round, never duplicated.

This configuration was force-tested with `logrotate -f`: after rotation the directory holds `access.log` (new) and `access.log.1` (the most recent archive); `delaycompress` takes effect and `.1` stays uncompressed for now, so reading the latest log needs no decompression:

![Figure 2](/images/csdn/figures/bash-logrotate-nginx-csdn138804009-2.png)

## A Comparison Cluster: Pitfalls Shared by Both Approaches

**Mistake one: the log is actually a symlink**

Containers and quite a few distros symlink access.log to `/dev/stdout` by default. Run the mv + gzip above against a symlink and gzip tries to read a character device that never ends — the process hangs outright; and mv moves only the link itself. Before touching anything, `ls -l` to confirm the log is a real file; in container scenarios, have nginx write a regular file before rotating.

**Mistake two: assuming the pid path**

Approach one hard-codes `/var/run/nginx.pid`, but a source-built nginx puts its pid file at `logs/nginx.pid` by default. With the wrong path, USR1 never goes out, the script reports no error, and the new access.log stays empty forever — a symptom identical to "forgot to send the signal". Trust the `--pid-path` in `nginx -V` or the `pid` directive in the configuration. One more container detail: the nginx:alpine image actually writes its pid to `/run/nginx.pid`, and since `/var/run` is usually a symlink to `/run`, both spellings hit — change environments and that may not hold; the configuration is still the authority.

## Notes

- Whichever approach you choose, nginx must reopen its log files after rotation (the USR1 signal); skip this and the new log file stays empty forever.
- logrotate is triggered periodically by the system cron; you do not need to add your own timer.
- `rotate 7` plus `daily` means archives are kept for one week; shrink it when disk is tight, grow it to keep more.
- `delaycompress` keeps the most recent archive uncompressed, so reading the latest log needs no decompression first.

Back to the opening scenario: whichever approach you pick, an access.log bloated enough to choke grep gets archived and compressed by the day, while nginx keeps writing a fresh file. Before going live, trigger one rotation manually (run the script or `logrotate -f`) and confirm the archive lands and new requests appear in the new log — only then is the rotation truly running.

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
