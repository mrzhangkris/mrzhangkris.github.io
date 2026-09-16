---
title: "MariaDB Installation and Remote Access Configuration: Tested on Rocky 9, with CentOS 7.6 Differences"
date: 2023-11-03 14:54:52
lang: en
categories: [Tech, MySQL]
tags: [MySQL]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1597852074816-d933c7d2b988?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

The original post was an operational record of installing MariaDB on CentOS 7.6 in 2023. CentOS 7 stopped receiving maintenance in June 2024, so this article has been rewritten around what was actually tested: **installation, the grant SQL, and remote connection were all re-run and verified on a dual-container Rocky Linux 9.3 (MariaDB 10.5.29) environment**, while the original CentOS 7.6 environment details are kept for comparison — the behavioral differences between the two generations (including one big pitfall sitting exactly in this grant SQL) are flagged at the corresponding steps. When you finish, you will have a MariaDB service that logs in locally and accepts remote connections.

Environment plan:

| Server | IP Address |
| --- | --- |
| Rocky Linux 9 (CentOS 7.6 in the original) | 192.168.0.35 |

## Prerequisites

- Rocky Linux 9 (or a same-generation RHEL family: AlmaLinux 9 / CentOS Stream 9), root privileges; a CentOS 7.6 environment can follow along, but the yum repos must be switched to vault (see Notes);
- Repos usable (`dnf makecache` / `yum makecache` without errors; RHEL 9's appstream ships MariaDB 10.5 by default);
- Port 3306 not occupied, firewall ready to allow it (required for remote access);
- Version expectation: **Rocky 9 installs MariaDB 10.5.x; CentOS 7.6's official repo ships 5.5.x** — this directly affects how the grant SQL later must be written, as measured in the "Enabling Remote Access" section.

## Installation

Install both client and server with the package manager (`yum` on Rocky 9 is an alias for `dnf`; the two spellings are equivalent):

```bash
yum install mariadb mariadb-server -y
```

Verification point: `rpm -q mariadb-server` shows the version number — measured on Rocky 9 it installs **10.5.29** (CentOS 7.6 had 5.5.6x); a passwordless local root login is enough to read the running version:

![Figure 1](/images/csdn/figures/mariadb-csdn134203281-1.png)

## Start and Enable at Boot

`enable --now` accomplishes both "set to start at boot" and "start right now" in one command:

```bash
systemctl enable mariadb --now
```

Verification points: `systemctl is-active mariadb` outputs `active`; `mysql -uroot -e "select version();"` prints the version number (root logs in locally without a password by default).

> Note: this article's container re-test environment has no systemd, so the service process was started directly with `mariadbd --user=mysql` (data directory initialized with `mariadb-install-db`); the `systemctl enable --now` spelling comes from the official documentation and means "enable at boot + start immediately" — use it as-is on real machines.

## Enabling Remote Access

By default root can log in only locally. The original approach was to enter the mysql database, change the password, and grant remote connections:

```sql
use mysql;
UPDATE user SET PASSWORD=PASSWORD('root') where USER='root';
GRANT ALL ON *.* TO 'root'@'%' IDENTIFIED BY 'root';
FLUSH PRIVILEGES;
```

**Version difference, measured warning**: this SQL works on MariaDB 5.5 (CentOS 7.6), but from 10.4 onward `mysql.user` changed from a table into a view, and the old spelling simply stops working — measured on 10.5, after running `UPDATE ... SET PASSWORD=...` the password field gets flagged `invalid`, i.e. effectively unset; the `GRANT ... IDENTIFIED BY` syntax is still supported on 10.5 and executes successfully:

![Figure 2](/images/csdn/figures/mariadb-csdn134203281-2.png)

On 10.4+, the correct way to change a password is `ALTER USER ... IDENTIFIED BY ...`; after running it, the password hash lands in the database normally. On the original 5.5 environment, nothing needs to change.

## Verification (Connect from Another Machine)

From a client machine, connect to `192.168.0.35`. On a freshly initialized service, the first connection before any grants is inevitably refused — the verbatim error is worth remembering; it is the signature of "the service is running but remote is not yet allowed":

![Figure 3](/images/csdn/figures/mariadb-csdn134203281-3.png)

`ERROR 1130 (HY000): Host 'xxx' is not allowed to connect to this MariaDB server` — this is not a network problem (receiving a refusal means 3306 is reachable); it is that the `user` table has no row yet permitting a remote origin. After adding `GRANT ... TO 'root'@'%'` and `FLUSH PRIVILEGES` and retrying: the client can list databases such as `information_schema` and `mysql`, `select current_user()` returns `root@%` — loop closed.

> Note: another classic pitfall is the anonymous user created by initialization (rows in the `user` table with an empty User string; measured to include both `''@'localhost'` and `''@'<hostname>'`), which under certain origin matches can steal the connection, reporting `Access denied for user ... (using password: YES)`. This clean dual-container environment did not reproduce the connection theft, but it is a standard cleanup item — running `mysql_secure_installation` once after installation removes the anonymous users, disables root remote login, and drops the test database along the way.

## Handy Locations After Installation

The configuration entry point is `/etc/my.cnf`, with server-side configuration in the `[mysqld]` section of `/etc/my.cnf.d/mariadb-server.cnf`. The two most commonly changed items: `bind-address` (commented by default, meaning listen on all interfaces; for local-only use set it to `127.0.0.1`, with the firewall as a second layer of defense); `character-set-server=utf8mb4` (the default charset for new databases — decide it before creating databases to save later conversions).

Day-to-day operations quick reference:

| Command / Path | Purpose |
|-------------|------|
| `systemctl status mariadb` | Service status and recent log lines |
| `mariadb-admin -uroot -p status` | Lightweight health check without entering SQL |
| `mariadb-admin variables` | All runtime parameters (pipe into grep for port/datadir) |
| `/etc/my.cnf.d/mariadb-server.cnf` | Server main configuration |
| `/var/lib/mysql` | Data directory (the heart of backup/migration) |

After changing configuration, `systemctl restart mariadb` applies it; use `mariadb-admin variables` or `SHOW VARIABLES LIKE ...` to confirm the new value loaded. For remote-access trouble, troubleshoot in the order "service status → port listening (`ss -tlnp | grep 3306`) → grant tables → firewall"; most issues are located within the first two steps.

## Failure Exits

- **To revoke the remote grant**: `DROP USER 'root'@'%'; FLUSH PRIVILEGES;`
- **Password botched and you cannot log in**: start with `--skip-grant-tables`, reset the password, then restart normally.
- **Tear it all down and start over**: `dnf remove mariadb mariadb-server`, then delete the data directory `/var/lib/mysql` (once deleted, the data is truly gone), then reinstall.

## Notes

- `root@'%'` with a weak password amounts to exposing the database naked on the network; suitable only for intranet test environments. In production, use a strong password, restrict origin IPs, and narrow the ALL privilege as needed.
- This SQL is the MariaDB/MySQL 5.x grant style; MySQL 8.0 has removed the `IDENTIFIED BY` syntax, and on MariaDB 10.4+ a direct UPDATE of the user table fails too — mind the version differences.
- After changes, remember `FLUSH PRIVILEGES`; otherwise the privilege tables never refresh and connections get refused.
- Remember to allow 3306 in the firewall (`firewall-cmd --add-service=mysql --permanent && firewall-cmd --reload`); in a container environment, confirm the port is reachable — in this experiment a direct connection over the container network was enough.
- CentOS 7.6 went EOL in 2024-06: the official mirror repos are offline, and before `yum install` you must comment out `mirrorlist` in the repo files, point `baseurl` to `http://vault.centos.org`, then `yum clean all`; vault occasionally rate-limits (403) — just retry later. This is also one reason this article switched to Rocky 9 for re-testing.

## Summary

Back to the opening environment plan: install (dnf), start (enable --now), connect (GRANT + the correct ALTER), verify (remote `current_user()` returning root@%) — four steps closing the loop, all tested on Rocky 9 + MariaDB 10.5.29. When following along on the old environment, remember that version pitfall: 5.5 uses UPDATE, 10.4+ always ALTER USER.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
