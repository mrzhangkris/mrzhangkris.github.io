---
title: "Real-Time Web Log Analysis with GoAccess: Installation, Reports, and Chinese-Locale Setup"
date: 2024-05-15 09:30:00
categories: [Tech, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1640552435388-a54879e72b28?w=1600&q=80&fm=jpg
updated: 2026-09-14
lang: en
---

Want to know who is visiting your site right now, what the traffic pattern looks like, and whether there are abnormal requests — GoAccess answers straight from the logs. It's an open-source web log analysis tool: no database, no agent on the server; one command reading Nginx/Apache access logs produces the statistics — terminal UI, HTML report, and JSON are all supported, and `--real-time-html` mode even refreshes the report along with the logs in real time. This post organizes its usage by scenario, tested with GoAccess 1.7 inside a debian:12 container (the 1.11 on Rocky 9 EPEL was additionally verified for installation), with a self-made sample of 5 combined-format test log lines.

## Installation

It's in the repositories of most distributions. Debian/Ubuntu:

```bash
sudo apt-get install -y goaccess
```

CentOS/RHEL/Rocky must enable the EPEL repository first (tested on Rocky 9 with the `dnf` commands, installing GoAccess 1.11):

```bash
sudo dnf install -y epel-release
sudo dnf install -y goaccess
```

Verification point: `goaccess --version` prints the version number. On debian:12 the tested install got GoAccess 1.7:

![Figure 1](/images/csdn/figures/goaccess-web-csdn138814793-1.png)

## Scenario 1: A Quick Look at Today's Traffic Stats

The most common command — analyze the Nginx access log and read the results right in the terminal:

```bash
goaccess /var/log/nginx/access.log --log-format=COMBINED
```

`--log-format=COMBINED` corresponds to Nginx's default combined log format (`log_format combined ...`, or whatever the default config is if untouched). The terminal UI is organized into panels: visitors, requests, 404s, bandwidth, referrers, browsers, status codes… arrow keys scroll up and down, Enter expands a panel's details, `q` quits.

When the log format doesn't match, the statistics turn to garbage (masses of requests flagged invalid) — confirm the web server's `log_format` before picking the parameter. This is the most common problem in GoAccess usage.

## Scenario 2: Generating an HTML Report to Share

Only someone logged into the server can see the terminal UI; for sharing, output HTML with `-o`:

```bash
goaccess /var/log/nginx/access.log --log-format=COMBINED -o /var/www/html/report.html
```

Tested: the 5 test log lines produced a 346K report file, and `valid_requests: 5` in the JSON confirmed everything parsed — all data is embedded in the single file with no external dependencies; open it directly in a browser:

![Figure 2](/images/csdn/figures/goaccess-web-csdn138814793-2.png)

Placed under `/var/www/html/`, it's directly reachable via the web; if you don't want it exposed, move it to a non-site directory and copy it locally to open.

## Scenario 3: A Real-Time Refreshing Monitoring Dashboard

`--real-time-html` brings the report to life: the GoAccess process stays resident, watches the log file grow, and pushes new data to already-opened browser pages over WebSocket — no manual refresh needed:

```bash
goaccess /var/log/nginx/access.log --log-format=COMBINED \
  -o /var/www/html/report.html --real-time-html
```

Tested: on startup it prints `WebSocket server ready to accept new client connections` and listens on port 7890 by default (the browser's network must be able to reach this port; for remote access, specify the address with `--ws-url`):

![Figure 3](/images/csdn/figures/goaccess-web-csdn138814793-3.png)

Note this process is a resident foreground process — in production, host it under systemd; once the process exits the page stops updating, but the generated HTML still holds a snapshot of the last state.

## Scenario 4: Chinese-Locale Setup

The key to a Chinese environment is system locale UTF-8 support. Check first:

```bash
locale
```

If LANG/LC_ALL in the output carry the `.UTF-8` suffix, you're set. If not, change it temporarily:

```bash
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
```

For long-term use, write it into `/etc/profile` or `~/.bashrc` — `export` lasts only for the current session.

One tested correction: **a non-UTF-8 locale does not affect HTML report generation** — under the POSIX locale, `-o report.html` succeeded just the same (346K output, identical to the UTF-8 environment). What locale affects is character rendering in the terminal UI: in non-UTF-8 environments the borders in terminal panels and Chinese User-Agents may show as mojibake. So: HTML reports have no locale requirement, and only the terminal UI needs UTF-8 properly configured.

## Scenario 5: Outputting JSON for Programs

Reports are for humans; JSON is for programs — pull data from here for monitoring hooks and secondary analysis:

```bash
goaccess /var/log/nginx/access.log --log-format=COMBINED -o report.json -p /etc/goaccess/goaccess.conf
```

The `-o` parameter picks the output format by extension: `.html` produces a web page, `.json` produces JSON; no extension or `-` outputs to the terminal.

## Parameter Cheat Sheet

| Parameter | Purpose | Example Value |
|------|------|--------|
| `--log-format` | Specify the log format | `COMBINED` (Nginx/Apache default) |
| `-o` | Output file (format by extension) | `report.html` / `report.json` |
| `--real-time-html` | Real-time refresh + WebSocket service | Use together with `-o xxx.html` |
| `--ws-url` | The WS address browsers connect to in real-time mode | `--ws-url=host:7890` |
| `--no-color` | Strip color from terminal output (for pipes/redirects) | `goaccess ... --no-color > out.txt` |
| `-f` | Specify the log file (equivalent to the positional argument) | `-f access.log` |
| `-p` | Specify the config file | `-p /etc/goaccess/goaccess.conf` |

## Caveats

- **Log format consistency**: `--log-format` must match the web server's actual log output format, or the statistics turn to garbage. For a customized `log_format`, GoAccess's config file also supports custom format strings.
- **Access permissions**: the user running GoAccess needs read permission on the log files (access.log is usually root:adm 640; a regular user needs adm group membership or sudo); writing to `/var/www/html/` requires write permission there.
- **Performance**: the real-time mode's resident process continuously tails the log; on high-traffic sites (thousands of lines per second and up) CPU usage climbs — consider generating static reports off-peak instead of running real-time mode.
- **Locale settings**: locale changed via `export` lasts only for the current session; long-term use needs it written into /etc/profile; and as tested above, locale affects only terminal UI display, not HTML/JSON report generation.
- **Report location**: putting an HTML report in the site directory amounts to publishing your access statistics — it contains IPs, UAs, and path distribution; in sensitive environments put it in a non-public directory or add access control.

GoAccess's value is zero dependence: one binary, one command — logs in, report out. Terminal UI for self-checks, HTML for sharing, real-time mode on a dashboard, JSON into monitoring — four output modes covering the everyday scenarios of log analysis. Remember: format matching comes first; everything else is just parameter selection.

> This post was reconstructed from the author's CSDN blog articles written between 2020 and 2024; it was originally published on CSDN.
