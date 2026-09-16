---
title: "Managing Nginx Logs with logrotate: Configuration, Hooks, and Real Tests"
date: 2024-05-20 08:45:00
lang: en
categories: [Tech, Linux]
tags: [Linux]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1573164713988-8665fc963095?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

Nginx's access and error logs grow continuously; left unmanaged they will fill the disk sooner or later, and digging through history gets dragged down by huge single files. logrotate is the solution that ships with the system: rotate, compress, and delete old logs on a schedule, with a postrotate hook letting Nginx switch to the new file seamlessly. This article walks through a complete configuration using Nginx as the example, with the whole flow tested in an nginx:alpine container (nginx/1.31.5 + logrotate 3.22.0), including a comparison experiment on "what happens if you leave out postrotate".

## Experiment Environment

- nginx:alpine container (nginx/1.31.5), `apk add logrotate` (3.22.0);
- Logs written to real files (the image symlinks access.log to stdout by default; delete the symlink first and create a regular file);
- Period parameters (weekly etc.) verified by forcing with `-f`, no need to wait a week.

## Installation

Most distributions ship it by default; if not, add it with your package manager:

```bash
sudo apt install logrotate   # Debian/Ubuntu
sudo dnf install logrotate   # CentOS/RHEL/Rocky 9
apk add logrotate            # Alpine
```

## The Core Mechanism: rename + reopen

logrotate's rotation is essentially two steps: rename `access.log` to `access.log.1` (rename is an atomic operation — Nginx doesn't notice, and no logs are lost in that instant), then use `nginx -s reopen` in postrotate to tell Nginx to let go of the old handle and open the new file. Once you understand that sentence, every directive in the configuration below falls into place. Files under `/etc/logrotate.d/` are included by the main config `/etc/logrotate.conf`; split by service and you usually never need to touch the main config.

## Configuration Example

Goal: rotate weekly, keep 4 old files, compress old logs, and notify Nginx to reopen logs after rotation. File location `/etc/logrotate.d/nginx`:

```
/var/log/nginx/*.log
{
    weekly                  # Rotate logs weekly
    rotate 4                # Keep 4 old file backups
    compress                # Compress old files
    missingok               # If a log is missing, continue without error
    notifempty              # Don't rotate empty logs
    create 0644 nginx nginx # Permissions and owner for the new log file created after rotation
    sharedscripts           # Run the script once after all logs rotate
    postrotate              # Commands executed after log rotation
        /usr/sbin/nginx -s reopen >/dev/null 2>&1
    endscript               # End marker of postrotate commands
}
```

For logs in several different directories, just replace the wildcard line with entries listed one by one. To use a date as the suffix (`access.log-20260914.gz` instead of `.1.gz`), add a `dateext` line; to postpone compression by one cycle (giving logs still being written some time), add `delaycompress`.

Period and size can also combine: `weekly` with `maxsize 200M` means "rotate once a week, but also rotate early if a single file grows to 200M" — a good safety net for sites with bursty traffic. Writing only `size 200M` triggers purely by size; the schedule no longer matters.

## Directive-by-Directive Explanation

- `weekly`: rotate once a week. You can also use `daily`/`monthly`, or `size 100M` to trigger by size.
- `rotate 4`: keep 4 old logs; anything older is deleted automatically.
- `compress`: gzip-compress the rotated-out old logs.
- `missingok`: no error when a log file doesn't exist; suits scenarios where the service may not be running.
- `notifempty`: don't rotate empty logs, avoiding a pile of empty files.
- `create 0644 nginx nginx`: create the new log file after rotation with the given permissions and owner, so Nginx can keep writing.
- `sharedscripts`: when multiple log files meet the rotation condition, the script runs once rather than once per file.
- `postrotate/endscript`: commands run after rotation. Here we have Nginx reopen its log files; otherwise Nginx still holds the old file's handle and new logs keep going into the rotated file.

## Real Test: One Full Rotation

First dry-run to confirm the execution plan (prints only, touches nothing), then force rotation with `-f`, and immediately after rotating generate a new request to verify:

![Figure 1](/images/csdn/figures/logrotate-csdn138911849-1.png)

Reading the real test results, every directive matched: `access.log` became a 0-byte new file owned by `nginx nginx` (`create` took effect); the old log became `access.log.1.gz` (`compress` took effect); after a new request `access.log` grew to 84 bytes — `nginx -s reopen` switched the handle to the new file, closing the loop.

A side note on how logrotate remembers "did it rotate last week": state is kept in the status file under `/var/lib/logrotate/` (one line per log: last rotation time). Use `-s` to specify a separate status file — that's how you test a new config without polluting the official records.

Two common questions answered along the way: does rotation lose logs at the switching moment? No — the rename is atomic, and the old handle keeps writing to the old file until reopen switches away. Where do old files go after rotation? Archives beyond `rotate 4` have been deleted automatically, and the instant before compression they are still full size, so disk should be reserved at "largest log × (rotate+1)".

## Wrong-Configuration Comparison: Leaving Out postrotate

Delete the `postrotate/endscript` block from the config, force rotation the same way, then generate another request:

![Figure 2](/images/csdn/figures/logrotate-csdn138911849-2.png)

Result: the new `access.log` is 0 bytes and the archive didn't grow either — **the new request vanished into thin air**. Mechanism: without reopen, the Nginx worker still holds the old file's open handle; after logrotate renames, compresses, and deletes, the handle points to a directory entry that no longer exists, and all new logs go into this "ghost inode". Data is lost, and the disk space is only released when the handle closes — losing on both fronts. The `nginx -s reopen` line cannot be skipped.

If you truly can't change the application (no reopen capability), the fallback is `copytruncate`: copy the log first, then truncate the original, with the application holding the same handle throughout. The cost: a few lines written between the copy and the truncate are lost — if you can reopen, don't use it.

## Manual Runs and the Scheduling Entry Point

Day to day, logrotate needs no human attention. The scheduling entry point differs by system: Debian-family hangs it in /etc/cron.daily/; Rocky 9 and later use a systemd timer (`logrotate.timer`, triggering daily by default; check with `systemctl status logrotate.timer`). To run the Nginx config manually once:

```bash
sudo logrotate -f /etc/logrotate.d/nginx          # Force rotation immediately
sudo logrotate -d /etc/logrotate.d/nginx          # Dry run, prints the execution plan only
```

Troubleshooting relies on the combination of three switches: `-d` for a dry run, `-f` to force rotation, `-v` for the detailed process. In the real test, the `rotating pattern: /var/log/nginx/*.log weekly ...` line printed by `-d` is the "plain-language translation" of the current config — checking it is far more reliable than guessing the semantics in your head.

## Failure Exits

- **After rotation, the Nginx error log reports permission denied / open() failed**: nine times out of ten the `create` owner doesn't match the actual running user; fix it against the worker user shown by `ps aux | grep nginx`.
- **Logs keep ballooning after rotation**: postrotate didn't take effect. Check the timestamps in the `/var/lib/logrotate/` status file to confirm rotation actually ran, then verify the reopen command path.
- **Config written wrong**: `logrotate -d` prints syntax and parsing errors directly; iterate until error-free before going live. Changes involve only a single file under /etc/logrotate.d/, and deleting that file is the rollback.

## Notes

- After editing the config, first dry-run with `logrotate -d /path/to/config`; it prints the execution plan without actually rotating — go live only after confirming it's correct.
- The `nginx -s reopen` in postrotate cannot be skipped; leaving it out causes silent log loss (tested above), with the new file staying empty forever.
- create's permissions and owner must match Nginx's actual running user, or Nginx can't write to the new log after rotation.
- Reserve disk for rotate's retention count times the size of a single log; compression saves roughly seventy percent but at the moment of rotation the files are still full size.
- Nginx in containers usually doesn't need logrotate: official images symlink logs to stdout/stderr, leaving rotation to Docker's json-file driver or a log collector; logrotate only earns its keep when logs land in real files (as in this article's experiment).

## Summary

Back to the log bloat from the opening: logrotate brings scheduling, compression, and cleanup, and the postrotate hook guarantees Nginx switches to the new file seamlessly — the tests prove that hook line is the single point in the whole setup where "omitting it loses data". Configure, `-d` dry-run, then `-f` rotate a round and inspect the artifacts — a five-minute path to trusting your production logs, and worth having on every machine that runs Nginx.

---

> This article was restructured from the author's 2020-2024 CSDN blog posts, originally published on CSDN.
