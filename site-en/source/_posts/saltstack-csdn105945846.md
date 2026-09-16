---
title: "SaltStack Remote Execution: Targeting, Common Modules, and Returners"
date: 2020-05-06 10:55:52
updated: 2026-09-14
categories: [Tech, SaltStack]
tags: [SaltStack]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1667984390553-7f439e6ae401?w=1600&q=80&fm=jpg
lang: en
---

Once SaltStack is installed, the thing you use most day to day is remote execution: one command makes a batch of Minions work at the same time. This post takes remote execution apart — how a command is structured, how to pick out the target machines (Targeting), which modules are commonly used, how return data lands in external systems (Returner), and finally how to write a module yourself. Every command was actually run and passed on a Rocky Linux 9 two-container cluster (Salt 3005.4; see the previous post for the Master/Minion setup), and the mysql Returner section was also tested against MySQL 8.

Related documentation:

- Remote execution docs: https://docs.saltstack.com/en/latest/topics/tutorials/modules.html
- Targeting docs: https://docs.saltproject.io/en/latest/topics/targeting/index.html
- Execution module docs: https://docs.saltproject.io/en/latest/ref/modules/all/index.html
- Returner docs: https://docs.saltproject.io/en/latest/ref/returners/all/index.html

## The Anatomy of a Remote Execution Command

The skeleton of a salt command:

```text
salt '<target>' <function> [arguments]
```

Four components:

1. The command `salt`, fixed and unchanging
2. The target — decides which Minions execute
3. The module function — what to execute
4. After execution, the result is returned — handled by the Returner component

## Targeting: Pick the Right Machines First

Two categories, depending on whether the Minion ID is involved.

### Targets Based on the Minion ID

| Method | Syntax | Example |
|------|------|------|
| Direct ID | ID string | `salt "minion-node2" test.ping` |
| Wildcards | `*` `?` `[...]` | `salt "*-node[1|2]" test.ping` |
| List | `-L`, comma-separated | `salt -L "master-node1,minion-node2" test.ping` |
| Regex | `-E` | `salt -E "minion-node2" test.ping` |

Verified output (using the `?` wildcard and node groups; the other forms look the same):

![Figure 1](/images/csdn/figures/saltstack-csdn105945846-1.png)

### Targets Independent of the Minion ID

**By grains** (`-G`, recommended): `salt -G "os:Rocky" test.ping` hit both machines in testing — selecting machines by grains attributes such as OS or role beats memorizing IDs.

**By subnet/IP** (`-S`): `salt -S "192.168.3.0/24"` selects machines by IP or CIDR. Note that it depends on the Minion's `ipv4` grains — in this containerized environment that grains was empty, so `-S` matched nothing (verified result); ordinary host/VM environments are unaffected, and the original article's CentOS 7 two-machine tests of both `salt -S "192.168.3.100"` and the subnet form ran normally.

**Node groups** (`-N`): define the group in the Master config first, restart salt-master for it to take effect, then execute by group:

```yaml
nodegroups:
  web: "L@master-node1,minion-node2"
```

```bash
systemctl restart salt-master   # In a container: kill the process, then restart with salt-master -d
salt -N web test.ping
```

## Common Modules

Salt is written in Python, and a module is just a `.py` file. On Rocky 9 they live in `/usr/lib/python3.9/site-packages/salt/modules/` (in the CentOS 7 era, under the python2.7 path). To learn what a function does, read the module source directly — each function's docstring is the manual, e.g. `ping()` in `test.py`.

| Module | Purpose | Example |
|------|------|------|
| network | network information queries | `salt '*' network.get_fqdn` |
| service | service management | `salt '*' service.available sshd` |
| cp | file distribution | `salt-cp '*' /etc/hosts /opt/hosts-copy` |
| cmd | remote command execution | `salt '*' cmd.run "df -h /"` |
| state / status | state system | `salt '*' state.show_top` |

Verified output for network.get_fqdn and file distribution:

![Figure 2](/images/csdn/figures/saltstack-csdn105945846-2.png)

Two verified findings worth recording: `service.available salt-minion` returns False inside a container without systemd (the module depends on systemd/init probing; it works fine on the host); and `state.show_top` returns an empty `----------` structure when no top.sls exists yet — that is normal behavior, not an error.

## Returners: Landing Return Data in External Systems

By default the return value is printed back at the Master's terminal; a Returner lets the Minion write the data straight into any system — Redis, MySQL, Elasticsearch, and so on. Using mysql as the example, the full flow was walked through on Rocky 9 + MySQL 8.

**Step 1: install the database driver.** Salt's mysql returner does a strict `import MySQLdb`; the matching el9 package is EPEL's `python3-mysqlclient` (the original CentOS 7 article installed `MySQL-python`):

```bash
dnf -y install python3-mysqlclient    # Install on every Minion
```

**Step 2: create the database and tables.** On MySQL, create the `salt` database and the three tables `jids`, `salt_returns`, and `salt_events`, then grant privileges:

```sql
CREATE DATABASE `salt` DEFAULT CHARACTER SET utf8;
USE `salt`;

CREATE TABLE `jids` (
  `jid` varchar(255) NOT NULL,
  `load` mediumtext NOT NULL,      -- MySQL 8 requires the backticks around `load`
  UNIQUE KEY `jid` (`jid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `salt_returns` (
  `fun` varchar(50) NOT NULL,
  `jid` varchar(255) NOT NULL,
  `return` mediumtext NOT NULL,
  `id` varchar(255) NOT NULL,
  `success` varchar(10) NOT NULL,
  `full_ret` mediumtext NOT NULL,
  `alter_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `id` (`id`), KEY `jid` (`jid`), KEY `fun` (`fun`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

GRANT ALL PRIVILEGES ON *.* TO 'salt'@'%' IDENTIFIED BY 'salt';
FLUSH PRIVILEGES;
```

> Note: `GRANT ... IDENTIFIED BY` is deprecated in MySQL 8 — you must `CREATE USER 'salt'@'%'` first and then GRANT; and without backticks around `load` the original DDL works on MySQL 5 but MySQL 8 throws a syntax error outright (hit in testing).

**Step 3: configure the Minion.** The Returner has the Minion write to the database directly, so the connection config belongs in `/etc/salt/minion.d/ret.conf` on **every Minion**; restart salt-minion after editing:

```yaml
mysql.host: 192.168.3.100
mysql.user: salt
mysql.pass: salt
mysql.db: salt
mysql.port: 3306
```

**Step 4: execute with `--return mysql` and check the database:**

![Figure 4](/images/csdn/figures/saltstack-csdn105945846-4.png)

The return value landed in the `salt_returns` table as expected. If writing to the database misbehaves, check the Minion's `/var/log/salt/minion` log — most often it is a privileges or connectivity problem.

## Writing a Custom Module

Custom modules go in the Master's `/srv/salt/_modules/`; after syncing, the Minion caches them under `/var/cache/salt/minion/extmods/`. Here is a module `disk.py` that wraps `df -h`:

```python
def list():
    ret = __salt__["cmd.run"]("df -h /")
    return ret
```

Once synced to the Minions it can be executed (module name = file name, function = `list`):

![Figure 3](/images/csdn/figures/saltstack-csdn105945846-3.png)

Two lessons from testing: don't put pipes inside `__salt__["cmd.run"]` — `df -h / | tail -1` was split into words and passed to df, which immediately failed with invalid option; and after writing a module you must run `saltutil.sync_modules`, otherwise execution fails with a module-not-found error.

## Points to Watch

- **Decide the target before you execute**: wildcards, `-L`, `-E`, `-S`, `-N`, and `-G` each fit different situations; pick the wrong scope and the command lands on machines it shouldn't. When unsure, validate the selected machine list with `test.ping` first.
- **nodegroups changes require a salt-master restart** to take effect; editing the config without restarting equals not editing it.
- **The mysql Returner connects from the Minion to the database directly**: every Minion needs the driver and MySQL connectivity, not just the Master; troubleshoot via `/var/log/salt/minion`.
- **MySQL 8 compatibility**: backtick `load` in the DDL and `CREATE USER` before granting — the original MySQL 5 syntax fails outright.
- **Custom modules in three steps**: write the file in `/srv/salt/_modules/` → sync with `saltutil.sync_modules` → execute with `salt '*' module.function`; skipping step two always errors.

## Historical Version Differences (CentOS 7)

The original article was tested on a CentOS 7.7 two-machine setup: module path `/usr/lib/python2.7/site-packages/salt/modules/`, mysql driver package `MySQL-python`. On Rocky 9 the path moved to `/usr/lib/python3.9/site-packages/salt/modules/` and the driver to `python3-mysqlclient`; the command structure, Targeting syntax, and module system are identical, with MySQL-side differences concentrated in the newer release's stricter handling of reserved words and grant syntax. When migrating an old environment, just substitute accordingly.

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
