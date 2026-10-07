---
title: "Installing MySQL 8.0 on Rocky Linux 9 (with CentOS 7 / MySQL 5.7 Differences)"
date: 2024-05-17 09:22:53
lang: en
updated: 2026-09-14
categories: [Tech, MySQL]
tags: [MySQL]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1529078155058-5d716f45d604?w=1600&q=80&fm=jpg
---

To install Oracle's MySQL on Linux there are two paths: use the distribution's default repository, or add MySQL's official repository to pin a specific version. This fork gave opposite answers in the two eras — CentOS 7's default repository had only MariaDB, no MySQL; while Rocky Linux 9's default repository provides MySQL 8.0 directly, installable with a single `dnf install`.

The main environment for this post is Rocky Linux 9; the full flow from install, through initialization, to creating a database and a user was tested in a container (MySQL 8.0.46). The entry-point errors and workarounds from the CentOS 7 / MySQL 5.7 era are preserved under "Historical Version Differences" and "Common Errors" for readers still maintaining old machines.

## Method 1: Install from the Default Repository (Rocky Linux 9)

### 1. Install MySQL

```bash
dnf install mysql-server
```

el9's AppStream repository provides the MySQL 8.0 series directly; the tested install got 8.0.46. Note the package name is `mysql-server` — exactly the reverse of CentOS 7 (where the same command reports no package; see Historical Version Differences).

### 2. Initialize and Start

On a real machine, systemd initializes the data directory automatically on first start and brings the service up:

```bash
systemctl start mysqld
systemctl enable mysqld
```

In the container there was no systemd, so the equivalent two steps were done by hand — initialize the data directory first, then start the daemon directly:

```bash
mysqld --initialize-insecure --user=mysql
/usr/libexec/mysqld --user=mysql &
```

`--initialize-insecure` creates root@localhost with an empty password, for first login only; on real machines initialized via systemd, root defaults to passwordless auth_socket (local socket login) — likewise to lower the "getting in the first time" barrier to a minimum.

### 3. Verify the Install and Set the root Password

Log in with the empty password and confirm the version and system databases:

```bash
mysql -u root --skip-password -e "SELECT VERSION(); SHOW DATABASES;"
```

In the tested output, `VERSION()` returned 8.0.46 and `SHOW DATABASES` listed the four system databases: information_schema, mysql, performance_schema, sys:

![Figure 2](/images/csdn/figures/centos-7-mysql-csdn138905545-2.png)

Then set a root password immediately. The interactive security initialization script does it all in one pass — set password, delete anonymous users, disable remote root:

```bash
mysql_secure_installation
```

### 4. Create a Database and a User (Least Privilege)

Applications should never use root directly. Create one business database and one dedicated account, granting privileges only on that database:

```bash
mysql -u root -p <<'SQL'
CREATE DATABASE appdb;
CREATE USER 'newuser'@'%' IDENTIFIED BY 'Str0ng_pass-1';
GRANT ALL PRIVILEGES ON appdb.* TO 'newuser'@'%';
FLUSH PRIVILEGES;
SQL
```

Tested: after this account logged in remotely (simulated with -h 127.0.0.1), `SHOW DATABASES` showed only `appdb` and the two built-in schemas — the grant boundary is the visibility boundary, so least privilege is directly verifiable:

![Figure 2](/images/csdn/figures/centos-7-mysql-csdn138905545-2.png)

## Method 2: Pin a Minor Version with the Official Repository

The default repository's 8.0.x rolls with the distribution; to pin or track Oracle's latest minor version, use the official repository: get the el9 `mysql80-community-release` RPM from [dev.mysql.com/downloads/repo/yum](https://dev.mysql.com/downloads/repo/yum/), `dnf install` that RPM, and `dnf install mysql-community-server` then pulls from the official source. This route was not tested for this post; follow the official documentation for the steps. The pitfalls around keys and GPG verification were tested in batches back in the CentOS 7 / 5.7 era — see Common Errors below; the thinking carries over.

## Historical Version Differences (CentOS 7 / MySQL 5.7)

CentOS 7 reached EOL on 2024-06-30, and MySQL 5.7 lost official support in October 2023; the following is useful only when maintaining existing machines:

- **No MySQL in the default repository**: `yum install mysql-server` reports `No package mysql-server available.` — the default repository provides only MariaDB (tested in a CentOS 7.9 container, output below). For Oracle MySQL you must use the official source; if MariaDB suffices, `yum install mariadb-server` is all you need.

![Figure 1](/images/csdn/figures/centos-7-mysql-csdn138905545-1.png)

- **5.7's temporary password**: after installing 5.7 from the official source, initialization generates a temporary root password that appears exactly once, in `/var/log/mysqld.log`. Look it up right after installing: `grep 'temporary password' /var/log/mysqld.log`, then finish setup with `mysql_secure_installation`. The el9 8.0 package doesn't work this way (root uses auth_socket / empty password for first login).
- **System repositories**: after CentOS 7's EOL, yum repositories must be switched to the vault.centos.org archive to work (verified installable after the fix).

## When the Install Goes Wrong

Starting over cleanly is simple: `dnf remove mysql-server` removes the package, `rm -rf /var/lib/mysql` deletes the initialized data directory, and the next install/start will run initialization again. On CentOS 7 the corresponding package names are `mysql-community-server` (official source) or `mariadb-server` (MariaDB), with the data directory likewise at `/var/lib/mysql`.

## Common Errors

- **`No package mysql-server available.`**: CentOS 7's default repository has no MySQL (reproduced in testing); use the official source or switch to MariaDB.
- **`Failing package is: mysql-community-server-5.7.44-1.el7.x86_64` (GPG verification failure)**: MySQL's official keys were rotated in 2023. Import the new key with `rpm --import https://repo.mysql.com/RPM-GPG-KEY-mysql-2023` and retry (reproduced and fixed in testing; if it still fails after importing, `--nogpgcheck` is a workaround, for temporary installs in EOL environments only).
- **`repomd.xml ... 404` on aarch64/ARM machines**: MySQL 5.7's official el7 repository has no ARM packages (reproduced in testing); ARM machines cannot use the official 5.7 source.
- **mysqld fails to start in a container with `Operation not permitted`**: the default seccomp configuration of some Docker Desktop/VM setups blocks mysqld's startup calls; it works after `--privileged` or adjusting seccomp (specific to the tested environment; ordinary Linux hosts are unaffected).

## Notes and Cautions

- The security initialization (mysql_secure_installation) is a mandatory step; root password, anonymous users, and remote root are all handled there.
- 8.0 enables password strength validation by default; weak passwords in `CREATE USER` are rejected outright — even test-environment passwords need sufficient length and complexity.
- `GRANT ALL PRIVILEGES ON *.* ...` grants enormous privileges. In production, narrow it to a specific database as in this post's example — a new account "not seeing other databases" is itself an audit line.
- Don't use root for application accounts; create a dedicated user and grant it privileges only on the databases it uses.

Both paths lead to the same endpoint: mysqld running, the root password in your own hands, and `SHOW DATABASES` listing your databases. The difference is only at the entrance — el9's default repository hands you MySQL 8.0 directly, while on old machines you'd be wrestling with the official source's key problems. There's no reason to choose 5.7 for new deployments: a single `dnf install` from the default repository already gets the job done.

> This article was rebuilt from the author's CSDN blog posts published between 2020 and 2024, originally published on CSDN.
