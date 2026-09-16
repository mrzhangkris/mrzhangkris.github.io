---
title: "Compiling OpenSSH 9.5p1 and OpenSSL 3.1.4 from Source: Tested on Rocky Linux 9 (with CentOS 7 Differences)"
date: 2023-11-02 19:31:59
updated: 2026-09-14
lang: en
categories: [Tech, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1608742213509-815b97c30b36?w=1600&q=80&fm=jpg
---

When the system's built-in OpenSSH/OpenSSL is outdated and has known vulnerabilities, and the software repos offer no newer version, compiling from source is the most direct fix. This post records the complete build-and-upgrade procedure for OpenSSH 9.5p1 and OpenSSL 3.1.4, reproduced end to end in a Rocky Linux 9.3 container, along the way hitting a RHEL 9-specific pitfall: **a freshly compiled older sshd cannot read el9's crypto-policies configuration**. The biggest risk in this kind of operation is breaking SSH and locking yourself out, so the survival measures come first.

## Software Preparation

| Software | Version | Download |
| --- | --- | --- |
| OpenSSH | 9.5p1 | [official portable page](https://www.openssh.com/portable.html), [Aliyun mirror](https://mirrors.aliyun.com/openssh/portable/) |
| OpenSSL | 3.1.4 | [openssl.org/source](https://www.openssl.org/source/old/3.1/) |

Prerequisites checklist:

- root privileges; internet access, or offline dependency packages prepared (`dnf install --downloadonly --downloaddir=/opt/yumsoft/ <package>` pulls packages ahead of time on a clean Minimal system; already-installed packages are not downloaded).
- Build dependencies: gcc, make, perl, zlib, zlib-devel, pam-devel, perl-IPC-Cmd (required by OpenSSL 3.x's Configure; missing it produces a perl module error).

## Survival Measures Before the Upgrade

The moment the old OpenSSH is uninstalled, no new SSH connection can get in; the whole run has to be finished from the sessions you are already logged into. Two iron rules:

1. **Open a telnet fallback channel in advance** so SSH breakage still leaves a way back (the CentOS 7 approach; commands from the original article's record):

```bash
yum -y install telnet telnet-server xinetd
echo "pts/0" >> /etc/securetty
echo "pts/1" >> /etc/securetty
systemctl start xinetd telnet.socket
```

2. **Never close the current window** until the new sshd has been verified; temporarily open port 23 in the firewall and close it again during cleanup.

## Step One: Environment Preparation

Permanently disable SELINUX to avoid permission-context problems after the build install (containers have no such layer; evaluate it on real machines as needed):

```bash
setenforce 0
sed -i 's/^SELINUX=enforcing$/SELINUX=disabled/' /etc/selinux/config
```

Install the build dependencies; when `gcc --version` and `perl -MIPC::Cmd -e1` both run normally, the dependencies are complete. Take a look at the system's current versions first so the upgrade has a baseline:

![Figure 1](/images/csdn/figures/centos-openssh-openssl-csdn134189302-1.png)

## Step Two: Remove the Old Versions

```bash
dnf remove -y openssl openssh
```

SSH stops working immediately after this — expected behavior. Confirm once more that the current window is still alive before moving on.

> Note: in the container test the uninstall was skipped to preserve the system environment, going straight to build-and-install over the existing files; on a real machine follow the original flow and uninstall first — the result is the same (make install overwrites the same files).

## Step Three: Build and Install OpenSSL

```bash
tar -zxvf openssl-3.1.4.tar.gz && cd openssl-3.1.4
./config shared zlib --prefix=/usr/local/openssl \
  --openssldir=/usr/local/openssl/ssl
make -j"$(nproc)" && make install
```

Parameter notes: `--prefix` sets the install directory; `--openssldir` sets the SSL configuration directory; `shared` builds shared libraries. After installing, confirm the version and the configuration directory:

![Figure 2](/images/csdn/figures/centos-openssh-openssl-csdn134189302-2.png)

Configure the shared-library path and symlinks (on RHEL 9 the shared-library directory is simply `lib`; run `ls /usr/local/openssl/` before linking to confirm — do not write lib64 out of habit):

```bash
echo "/usr/local/openssl/lib" >> /etc/ld.so.conf
ln -s /usr/local/openssl/bin/openssl /usr/bin/openssl
ln -s /usr/local/openssl/lib/libssl.so.3 /usr/lib/libssl.so.3
ln -s /usr/local/openssl/lib/libcrypto.so.3 /usr/lib/libcrypto.so.3
ldconfig
```

> Note: with a wrong path, `openssl version` reports `libssl.so.3: cannot open shared object file` (an error reproduced in testing); one `ldconfig` or a corrected path restores it.

## Step Four: Build and Install OpenSSH

The key is pointing configure at the freshly installed OpenSSL; otherwise it links against the system's old libraries:

```bash
tar -zxvf openssh-9.5p1.tar.gz && cd openssh-9.5p1
./configure --prefix=/usr --sysconfdir=/etc/ssh \
  --with-ssl-dir=/usr/local/openssl --with-zlib \
  --with-md5-passwords --with-pam
make && make install
```

Parameter notes: `--sysconfdir` sets the SSH configuration directory; `--with-ssl-dir` points to the newly installed OpenSSL; `--with-pam` enables PAM support, which requires keeping the `UsePAM yes`-related settings in sshd_config.

One easily missed detail in the make install stage: install runs a check-config (executing `sshd -t`), and on failure it displays `Error 255 (ignored)` — make does not stop, but it means sshd cannot start at that moment. **This "ignored" must be taken seriously**:

![Figure 3](/images/csdn/figures/centos-openssh-openssl-csdn134189302-3.png)

Another class of error, `Privilege separation user sshd does not exist`, means the system has no sshd user — upgraded machines usually already have one; on a bare-minimum system, just add it with `useradd -r -d /var/empty sshd`.

## The New RHEL 9 Pitfall: crypto-policies vs. an Older sshd

In the container test, this was the root cause of the check-config failure: RHEL 9's `/etc/ssh/sshd_config.d/50-redhat.conf` includes the system-level crypto-policies configuration, whose `GSSAPIKexAlgorithms` option is recognized only by newer OpenSSH — **the compiled 9.5p1 reads it and exits with Bad configuration option**, and the ssh client behaves the same.

The fix: move the two include files aside (or comment out the `Include` lines in sshd_config/ssh_config) and let the new sshd negotiate algorithms according to its own capabilities:

![Figure 4](/images/csdn/figures/centos-openssh-openssl-csdn134189302-4.png)

`sshd -t` passes, the daemon starts, and the new client completes key exchange with 9.5p1 (known_hosts has already recorded the new sshd's ED25519 host key) — at this point, the in-container verification of the upgrade is closed-loop. On a real machine one last half-step remains: **open a fresh SSH session and actually log in once** before drawing conclusions.

## Final Configuration and Post-Install Verification

The host keys must be mode 600 (the common error is in the next section), then fill in the key sshd_config entries and restart the service:

```bash
chmod 600 /etc/ssh/ssh_host_*_key
echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
echo "UseDNS no" >> /etc/ssh/sshd_config
systemctl restart sshd        # For CentOS 7 see the differences at the end: /etc/init.d/sshd restart
```

Version verification is the hard standard that closes the upgrade loop:

![Figure 5](/images/csdn/figures/centos-openssh-openssl-csdn134189302-5.png)

Both segments of the version line must be checked: OpenSSH 9.5p1 plus the OpenSSL 3.1.4 in parentheses. If OpenSSL still shows the system's old version, `--with-ssl-dir` was not pointed correctly and it linked the old libraries — go back to Step Four and rebuild.

## Common Errors

**UNPROTECTED PRIVATE KEY FILE**: host key permissions too loose; the daemon refuses to start outright. The core of the error is `WARNING: UNPROTECTED PRIVATE KEY FILE!` plus `sshd: no hostkeys available -- exiting.` (verbatim from the original article); changing all three host keys (rsa, ecdsa, ed25519) to 600 fixes it — that is exactly the chmod in the final-configuration section.

**Bad configuration option: GSSAPIKexAlgorithms**: see the previous section — el9's crypto-policies include is incompatible with older OpenSSH; moving the include files aside restores it.

## Historical Version Differences (CentOS 7)

| Item | CentOS 7 (original environment) | Rocky Linux 9 (tested in this article) |
|------|--------------------|------------------------|
| Uninstall/reinstall | `yum remove openssh` | `dnf remove -y openssl openssh` |
| Service management | `cp contrib/redhat/sshd.init /etc/init.d/sshd` + `chkconfig --add sshd` | Not needed; `systemctl restart sshd` |
| sshd config extras | reads /etc/ssh/sshd_config only | additionally includes sshd_config.d/ (the source of the crypto-policies pitfall) |

CentOS 7 is EOL and its repos have moved to vault; this is also why "compiling from source" remains worth mastering on old systems — when the official repos offer no new version, it is the only way.

## Notes

- Before uninstalling OpenSSH, protect the current logged-in window and open a fallback channel; confirm "still connected" at the end of every step. After the upgrade is complete and the new SSH login is confirmed, stop the telnet service (`systemctl stop telnet.socket xinetd`) and withdraw the port 23 rule.
- Since OpenSSH 6.7, TCP wrappers support is disabled by default; after the upgrade, the settings in /etc/hosts.allow and /etc/hosts.deny stop taking effect.
- When compiling OpenSSH, explicitly pass `--with-ssl-dir` pointing to the newly installed OpenSSL; only when `ssh -V` shows the right OpenSSL version is the upgrade loop closed.
- `Error 255 (ignored)` at the end of make install is a signal that the configuration check failed, not noise to ignore — follow it to troubleshoot the two problem classes: crypto-policies and host key permissions.
- For offline dependencies, pull packages in advance with downloadonly; already-installed packages are not downloaded, and be sure to do this on a clean Minimal system.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
