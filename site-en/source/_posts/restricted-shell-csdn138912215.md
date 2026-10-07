---
title: Restricting User Command Execution with rbash (the Restricted Shell)
date: 2024-05-20 09:15:00
updated: 2026-09-14
categories: [Tech, Linux]
tags: [Linux]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1510519138101-570d1dca3d66?w=1600&q=80&fm=jpg
lang: en
---

When contractors get temporary machine access or a student lab box hands out accounts, you can't let those users run arbitrary commands on the system. Linux's built-in restricted shell (rbash) exists exactly for this: switch the user's login shell to bash's restricted mode, combine it with a directory that only holds "whitelisted commands" and a narrowed PATH, and the user can only execute the commands you allow and access the paths you permit. The setup cost is low — no extra software, done in three steps — and it suits education environments, corporate servers, and public access terminals. This post walks through the whole setup on Rocky Linux 9, then tests item by item which operations get blocked and which commands can escape.

## Lab Environment

- Rocky Linux 9.3 container (same lineage as RHEL 9, bash 5.1.8)
- Key difference: RHEL 8/9 does **not ship a /bin/rbash file** by default (the bash package itself supports restricted mode, but you must create the symlink manually); the bash packages of the CentOS 6/7 era preinstalled /bin/rbash, which is why `useradd -s /bin/rbash` in old tutorials "just works" there — copying them onto RHEL 9 trips you up

## How rbash Enforces Its Restrictions

rbash is bash's restricted mode. At startup bash inspects its own argv0 (the name it was invoked as): if it reads `rbash`, it enters restricted mode; otherwise it runs normally — so rbash is not a separate program, it's one binary with two behaviors. That is also why "create a symlink and you're done" works.

In restricted mode, the following operations are **all forbidden**:

- `cd`: no changing directories
- Assigning/unsetting `PATH`, `SHELL`, `ENV`, `BASH_ENV`: no modifying the command lookup path or startup environment
- Output redirection with `>`/`>>`: no writing arbitrary files
- A `/` in the command name: absolute-path invocations like `/bin/ls` or `/usr/bin/python3` are rejected outright

One mechanism deserves its own explanation: **these restrictions take effect only after the startup files (.bash_profile and the like) have been read**. The bash manual's description of the restricted shell states explicitly that restrictions are "enforced after any startup files are read". This yields a configuration-friendly property — the admin can set `PATH=$HOME/bin` normally inside .bash_profile, and after login any attempt by the user to change PATH is refused. The live tests below verify both halves of that behavior.

## Step 1: Prepare rbash (Mandatory on RHEL 9)

Rocky Linux 9 has no /bin/rbash file by default, but the bash binary supports restricted mode — a symlink is enough:

```bash
ln -s /usr/bin/bash /usr/bin/rbash
```

![Figure 1](/images/csdn/figures/restricted-shell-csdn138912215-1.png)

Verify: `readlink /usr/bin/rbash` prints `/usr/bin/bash`, and `rbash -c 'cd /tmp'` reports `cd: restricted`, which means restricted mode is active. On older CentOS 7 environments skip this step (the bash package ships /bin/rbash).

## Step 2: Create the Restricted User + Whitelist Directory

Which shell a user lands in after login is decided by useradd's `-s` parameter — this is the linchpin of the whole scheme:

```bash
useradd -m -s /bin/rbash restricted_user
passwd restricted_user
```

Next, control "what can be executed". The approach: create a `bin` directory in the user's home and place the allowed commands there as symlinks:

```bash
mkdir /home/restricted_user/bin
for c in ls cat echo grep; do
  ln -s /usr/bin/$c /home/restricted_user/bin/$c
done
```

Then narrow PATH to that directory in the user's `.bash_profile`:

```bash
PATH=$HOME/bin
export PATH
readonly PATH
```

Don't forget to hand home directory ownership back to the user, otherwise .bash_profile can't be read at login:

```bash
chown -R restricted_user:restricted_user /home/restricted_user
```

![Figure 2](/images/csdn/figures/restricted-shell-csdn138912215-2.png)

Verify: `su - restricted_user -c 'echo $PATH'` prints `/home/restricted_user/bin`, and `echo` from the whitelist runs normally.

A fair word about `readonly PATH`: it is **not** the mechanism that blocks PATH changes. rbash's built-in restrictions already refuse PATH assignment after login — I ran a controlled experiment: without `readonly PATH` in .bash_profile, executing `PATH=/usr/bin:$PATH` after login still reports `PATH: readonly variable` (identical error text; this is restricted mode's built-in protection for PATH/SHELL/ENV/BASH_ENV). The value of `readonly` is defense in depth: if the user's shell ever gets switched to plain bash (say, a temporary `usermod -s /bin/bash` during troubleshooting that was never reverted), readonly still stops PATH from being rewritten. Keep it — just don't assume you're unsafe without it.

## Step 3: Test Each Restriction Live

Log in interactively as the restricted user and try every operation that's easiest to misjudge:

![Figure 3](/images/csdn/figures/restricted-shell-csdn138912215-3.png)

The test checklist:

| Operation | Result | rbash Message |
|------|------|-----------|
| `ls`, `cat`, `echo` (inside whitelist) | ✅ runs normally | none |
| `cd /tmp` | ❌ blocked | `cd: restricted` |
| `rm`, `python3` (outside whitelist) | ❌ command not found | `command not found` |
| `/bin/ls /` (absolute-path detour) | ❌ blocked | `cannot specify '/' in command names` |
| `echo test > /tmp/out.txt` | ❌ blocked | `cannot redirect output` |
| `PATH=/usr/bin:$PATH` | ❌ blocked | `PATH: readonly variable` |

All six blocks behaved as expected, and two of them — "absolute paths" and "redirection" — close off the two most intuitive bypass ideas.

## Escape Audit: Whitelisted Commands' Own Behavior Is Unrestricted

rbash restricts the **current shell**; each whitelisted command's own behavior is unrestricted — that is the real risk surface of this scheme. Tested live with `cat`, one of the whitelisted commands:

![Figure 4](/images/csdn/figures/restricted-shell-csdn138912215-4.png)

`cat` runs as the restricted user itself: world-readable files like `/etc/passwd` can be read freely, while root-only files like `/etc/shadow` yield `Permission denied`. So the question is not "can system files be read" but **what sensitive information sits in world-readable files** (passwords in config files, other users' file permissions, and so on).

More dangerous are commands that can spawn sub-processes: whitelist `vim`/`vi` and the user can launch an unrestricted shell from inside the editor with `:!bash`; whitelist `more`/`less` and `!command` works; `find`'s `-exec` and `awk`'s `system()` are the same story. When choosing whitelist commands, audit each one for "escape capability" — allowing only "output-only" commands (ls/cat/echo/grep/head/tail) is the safest bet.

## Common Wrong Setups

The three most common wrong ways to roll this out, each with a real pitfall:

| Wrong Setup | Actual Consequence | What Went Wrong |
|---------|---------|--------|
| `useradd -s /bin/rbash` without creating the symlink | In testing, useradd only emits a Warning and does not fail: `useradd: Warning: missing or non-executable shell '/bin/rbash'`; the user is created as usual, but at login the shell doesn't exist — su reports `No such file or directory` and ssh refuses outright | Assuming "user created = setup done" and skipping RHEL 9's symlink step |
| `PATH=$PATH:$HOME/bin` (adding, never removing) | The user can run every system command as usual | The whitelist directory merely becomes "one more directory"; the lookup scope was never narrowed, so the scheme is effectively a no-op |
| Putting vim on the whitelist for convenient file editing | The user spawns a full shell with `:!bash` and every restriction evaporates | Ignoring that "whitelisted commands' own behavior is unrestricted" — an editor is a backdoor |

## Common Errors

- **`/bin/rbash: No such file or directory`** (at login): the symlink wasn't created; fix with the `ln -s` from Step 1.
- **`useradd: Warning: missing or non-executable shell '/bin/rbash'`**: useradd does not fail over this and the user is created as usual — the Warning only reminds you that this shell path doesn't exist on the system. After the symlink exists, newly created users no longer warn; for existing users, re-set it once with `usermod -s /bin/rbash <username>`.
- **Even `ls` can't be found after login**: first check the ownership and permissions of `.bash_profile` (the `chown` step was skipped, so the user can't read the startup file and PATH is still the system default); then check the PATH line for typos (e.g., `$HOME/bin` typed as a directory that doesn't exist) — if PATH points to the wrong place the whitelist silently fails entirely. Rescue options: as root, inspect the actual PATH with `su - <username> -c 'echo $PATH'`, or simply revoke access with `usermod -s /bin/bash` and reconfigure.
- **The user escapes via vim/less**: see the escape audit above; move such commands off the whitelist and replace text-editing needs with `cat` plus pipes.

## Caveats

- **Whitelist auditing**: no program that can start a new shell (bash/sh/zsh), modify the environment (env/export), or spawn sub-processes (vim/less/find -exec/awk system()) may be whitelisted; allow output-only commands only, and periodically re-check whether symlink targets were upgraded or replaced.
- **Cross-version migration**: the CentOS 6/7 bash packages preinstall /bin/rbash while RHEL 8/9 does not — copying an old RHEL 7 `useradd -s /bin/rbash` recipe onto RHEL 9 silently creates a "fake restricted user" whose login fails outright. Give the symlink step its own line in the migration checklist.
- **When restrictions take effect**: .bash_profile is the only legitimate window for setting PATH (restrictions activate only after startup files are read); put all PATH-narrowing logic there, and don't count on "changing it back" somewhere else later.
- **rbash is not strong isolation**: it stops misuse and casual poking, not a determined attacker (kernel exploits and whitelisted-command escape combos all have precedents). For real strong isolation use containers/VMs/SELinux; rbash fits requirements at the level of "give users a clean command-line environment".
- **Test before going live**: log in once for real with the restricted account and test each item — commands outside the whitelist, cd, redirection, absolute paths. rbash's error messages are clear, but only an actual login confirms nothing was missed in the configuration.

rbash is a "low-cost, fast-to-deploy" user isolation scheme: no extra installation, restricted mode enabled via a symlink, the whitelist managed with symlinks, and PATH narrowed in the startup file then locked down by restricted mode itself. It is not a replacement for strong isolation, but for the requirement of "contractor/student accounts may only run specified commands", the trio of rbash + whitelist + narrowed PATH is enough — provided the escape audit happens up front.

> This post was reconstructed from the author's CSDN blog articles written between 2020 and 2024; it was originally published on CSDN.
