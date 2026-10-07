---
title: "Debian Command Cheat Sheet: apt-get, dpkg, and File Operations"
date: 2024-05-11 15:22:09
lang: en
updated: 2026-09-14
categories: [Tech, Linux]
tags: [Linux]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=1600&q=80&fm=jpg
---

Working on Debian and its derivatives (Ubuntu et al.), a few command groups come up every day: apt-get and dpkg for installing software, ls for viewing files, cd and pwd for moving between directories, cp and mv for copying and moving. This post organizes them into a cheat sheet by function — flip through it when setting up a new machine or switching environments. All output in this post was tested in a debian:12 container (Debian 12.15, apt 2.6.1, dpkg 1.21.23).

## apt-get: Repository Package Management

apt-get is the package-management CLI of the Debian family, handling package installation, upgrades, and removal with automatic dependency resolution.

| Command | What it does | Example |
|------|------|------|
| `apt-get update` | Refresh the repository index | `sudo apt-get update` |
| `apt-get upgrade` | Upgrade all installed packages | `sudo apt-get upgrade` |
| `apt-get install <pkg>` | Install a package | `sudo apt-get install nginx` |
| `apt-get remove <pkg>` | Remove a package (keeps config) | `sudo apt-get remove nginx` |
| `apt-get purge <pkg>` | Remove a package and delete its config | `sudo apt-get purge nginx` |
| `apt-get autoremove` | Clean up dependencies no longer needed | `sudo apt-get autoremove` |
| `apt-get install -s <pkg>` | Simulate an install — inspect dependencies without touching the system | `sudo apt-get install -s wget` |
| `apt-cache search <word>` | Search package names in the repositories | `apt-cache search ^wget$` |

Common options:

| Option | What it does |
|------|------|
| `-y` | Auto-answer yes to all interactive prompts — always add it in scripts |
| `-s` / `--dry-run` | Simulate execution, only printing what would change |
| `-q` | Quiet mode, less progress output |
| `--no-install-recommends` | Skip recommended packages, install hard dependencies only |

Live verification (installing a package on a fresh container without refreshing the index errors out; after update, a `-s` simulated install of wget):

![Figure 1](/images/csdn/figures/debian-csdn138717366-1.png)

**Trap**: `update` and `upgrade` are two different things — `update` only refreshes the repository index and upgrades nothing; `upgrade` is what actually upgrades. Running update without upgrade changes not a single package on the system.

## dpkg: Local .deb Package Operations

dpkg is also a Debian-family package management tool, used to install, build, remove, and manage .deb packages. Division of labor with apt-get: apt-get works through repositories and resolves dependencies automatically, while dpkg only operates on the package files in your hand and **does not resolve dependencies** — when installing a .deb with missing dependencies, apt-get still has to fill the gap (`sudo apt-get install -f`).

| Command | What it does | Example |
|------|------|------|
| `dpkg -i <file>.deb` | Install a local .deb package | `sudo dpkg -i app_1.0_amd64.deb` |
| `dpkg -l` | List all installed packages | `dpkg -l`, `dpkg -l curl` |
| `dpkg -s <pkg>` | Query a package's detailed info | `dpkg -s curl` |
| `dpkg -L <pkg>` | List every file the package installed | `dpkg -L curl` |
| `dpkg -r <pkg>` | Remove a package, keeping config files | `sudo dpkg -r curl` |
| `dpkg -P <pkg>` | Remove a package and purge config | `sudo dpkg -P curl` |

Live verification (querying the installed curl):

![Figure 2](/images/csdn/figures/debian-csdn138717366-2.png)

**Trap**: in `dpkg -l`, the first-column status code `ii` means properly installed, while `rc` means removed with config residue left behind (only purge clears it); after removing with `-r` and reinstalling, the old config is still there — use `-P` for a clean uninstall.

## ls: List Directories

ls lists directory contents — one of the most-used commands.

| Command | What it does |
|------|------|
| `ls` | List the files and directories in the current directory |
| `ls -l` | Details: permissions, owner, size, modification time |
| `ls -a` | Include hidden files (dot-prefixed) |
| `ls -la` | Both combined: full info including hidden files |
| `ls -h` | Sizes in human-readable K/M/G format |
| `ls -d <dir>` | Show the directory itself, not its contents |

Each `ls -l` line has seven columns: permissions, link count, owner, group, size, modification time, filename. The first column, e.g. `-rw-r--r--`: the leading `-` marks a regular file (`d` for a directory), and the remaining nine characters split into three groups — the read/write/execute permissions of owner, group, and others.

## cd and pwd: Navigating and Locating

cd (change directory) switches directories; pwd (print working directory) shows the full path of the current working directory.

| Command | What it does |
|------|------|
| `cd /home` | Switch to the absolute path /home |
| `cd dir1` | Switch to dir1 under a relative path |
| `cd ..` | Go up one level |
| `cd -` | Return to the previous directory |
| `cd` / `cd ~` | Return to the current user's home directory |
| `pwd` | Show the current path |

## cp and mv: Copying and Moving

cp copies files or directories; mv moves or renames them.

| Command | What it does |
|------|------|
| `cp source.txt dest.txt` | Copy a file |
| `cp -r srcdir/ destdir/` | Copy a directory (`-r` for recursion is mandatory) |
| `mv source.txt /some/dest/` | Move a file to the given directory |
| `mv old.txt new.txt` | Rename (a move within the same directory) |
| `mv -i <file> <target>` | Ask before overwriting, guarding against accidental clobbering |

Live verification (copy, move, confirm with ls):

![Figure 3](/images/csdn/figures/debian-csdn138717366-3.png)

**Trap**: `cp` without `-r` errors out outright on directories; `mv` overwrites existing files silently by default — use `mv -i` or back things up yourself before touching important data.

## Caveats

- apt-get and dpkg divide the labor differently: apt-get works through repositories and resolves dependencies automatically, while dpkg only handles local .deb files — prefer apt-get day to day.
- `apt-get update` and `apt-get upgrade` are two separate steps; running update without upgrade upgrades nothing.
- dpkg's `-r` removes a package while keeping its config files, so the old config persists on reinstall; use `-P` (purge) to clear the config along with the package.
- ls's `-l` and `-a` combine (`ls -la`), which makes reading full info on hidden files easier.
- In production, run remove/purge/autoremove with `-s` first to preview the list of packages about to change, then execute for real.

---

> This post was rewritten from the author's CSDN blog articles originally published between 2020 and 2024 on CSDN.
