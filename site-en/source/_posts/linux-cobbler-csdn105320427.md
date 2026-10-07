---
title: "Cobbler Automated Provisioning: From Deployment to Batch PXE Installs (Rocky Linux 9, with CentOS 7 Differences)"
date: 2020-04-06 20:59:23
categories: [Tech, Linux]
tags: [Linux]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1587831990711-23ca6441447b?w=1600&q=80&fm=jpg
updated: 2026-09-14
lang: en
---

A dozen new machines in the server room are waiting for an OS install, and plugging a USB stick into each one is not practical. Cobbler chains PXE boot, DHCP, and answer files into one complete pipeline: a machine that boots from the network installs itself automatically. This post walks through the whole deployment in order, from installing the service to customizing installs per MAC address. The main environment is Rocky Linux 9 + Cobbler 3.3.7 (EPEL); server-side deployment, DHCP takeover, distro/profile/system record creation, and PXE artifact generation were all verified in a Rocky 9 container (container kernel and network constraints left the real client PXE boot hop untested). Cobbler 3.x differs greatly from the 2.x of the CentOS 7 era, so the end of this post includes an old-version comparison.

Official documentation: [cobbler](https://cobbler.readthedocs.io/en/latest/)

## Read This First: High-Frequency 2.x → 3.x Changes

Old CentOS 7 tutorials (including the historical version of this post) hit walls everywhere when copied verbatim onto 3.x. Here is the full list of the most commonly collided-with differences:

| 2.x (CentOS 7) style | 3.x (Rocky 9) style | Verified result |
|---------------------|---------------------|----------|
| Config file `/etc/cobbler/settings` | `/etc/cobbler/settings.yaml` | Format switched to YAML |
| `manage_dhcp: 1` | `manage_dhcp_v4: true` | Changing the old key alone **has no effect** — sync renders no DHCP config |
| `--kickstart=/path/xx.ks` | `--autoinstall=xx.ks` | Path is relative to `/var/lib/cobbler/templates/` |
| `system add --subnet=` | `system add --netmask=` | The old option errors out directly with no such option |
| `sample_end.ks` | `default.ks` | Template directory moved to `/var/lib/cobbler/templates/` |
| `cobbler get-loaders` | `cobbler mkloaders` | Command renamed |
| syslinux (pxelinux.0) | el9 repos **do not carry** syslinux | pxelinux.0 for BIOS PXE must be placed manually |
| `cobbler-web` package | No such package on EPEL9 (verified: no dnf match) | Install the web UI separately per the official docs |

## Prerequisites

- One Rocky Linux 9 server (root privileges); clients must be on the **same network segment**;
- At least 10GB free on the `/var` partition (each imported distro takes 5-10GB);
- SELinux disabled (it interferes with PXE/TFTP), and firewall openings for dhcp (67/68), http (80), and tftp (69);
- No other DHCP server on the network answering requests (two DHCP servers respond randomly, and installs become flaky).

To disable SELinux: edit the config file and reboot for a permanent change; `setenforce 0` bridges the current session:

```bash
sed -i s#SELINUX=enforcing#SELINUX=disabled#g /etc/selinux/config
grep "SELINUX=" /etc/selinux/config
setenforce 0 && getenforce
```

## 1. Installation and Startup

With the EPEL repo ready, install everything in one go, start cobblerd, then run `cobbler check` — it lists the problems in the current environment and serves as the navigation for the whole deployment (come back and re-check after each step):

```bash
dnf install -y epel-release
dnf install -y cobbler dhcp-server tftp-server pykickstart httpd
systemctl start cobblerd
cobbler check
```

![Figure 1](/images/csdn/figures/linux-cobbler-csdn105320427-1.png)

The first check reports 9 items. Its output is advice — you don't have to act on every line: this post handles 1 (server), 2 (next_server_v4), and 8 (default password), the three mandatory fixes, plus DHCP takeover and tftp-related configuration; 3 (next_server_v6 — skip if you are not doing IPv6 PXE), 4 (boot-loaders, see the loaders section below), and 5-7/9 (reposync, debmirror, fencing, and other optional features) are handled as needed.

## 2. Fixing Configuration per the check Suggestions

**1+2. server and next_server_v4: set them to the machine's real IP.** Edit `/etc/cobbler/settings.yaml`: server is the address a freshly provisioned machine downloads its answer file from, and next_server_v4 is the TFTP address where PXE clients download boot files; set both to the cobbler server's real IP (the sample container environment used 172.17.0.6 — substitute yours on real hardware). Note that YAML is sensitive to indentation and to the space after colons; back the file up before editing.

**8. Replace the default root password.** `default_password_crypted` is the password hash of root on newly installed systems, and the default value is the publicly known `cobbler` — it must be replaced. Generate one with the openssl command suggested by check and paste the output into settings.yaml:

![Figure 2](/images/csdn/figures/linux-cobbler-csdn105320427-2.png)

**3. Take over DHCP.** Here lies the biggest 3.x trap: settings.yaml carries switches from two eras side by side — `manage_dhcp` alongside `manage_dhcp_v4`/`manage_dhcp_v6`. Verified in testing: if you only flip the old key `manage_dhcp` to true, `cobbler sync` runs through its whole flow yet **renders no DHCP configuration at all** — you must write `manage_dhcp_v4: true`.

The DHCP template lives at `/etc/cobbler/dhcp.template`, and usually only a few subnet lines need changing: the subnet and netmask must match the real network segment of the server's NIC, and `routers` takes the real gateway. In testing, a netmask that disagreed with the NIC (NIC /16, template /24) passed the `dhcpd -t` syntax check, but `systemctl restart dhcpd` failed (dhcpd exits immediately when it finds no subnet declaration matching an interface) — sync's only error message was "Restarting service dhcpd failed"; the truth lives in `journalctl -u dhcpd`.

With configuration done, restart cobblerd and sync:

![Figure 3](/images/csdn/figures/linux-cobbler-csdn105320427-3.png)

sync does three things: renders `/etc/dhcp/dhcpd.conf` from the template (a grep shows the subnet and `next-server` entries), runs the `dhcpd -t` syntax self-check, and restarts dhcpd. When all three steps come back green (`*** TASK COMPLETE ***` and dhcpd turning active), DHCP now belongs to cobbler.

**4. Boot loaders.** The 2.x `cobbler get-loaders` was renamed `cobbler mkloaders` in 3.x. On el9 it reports honestly what is missing: with the ipxe directory absent it cannot install iPXE, and **syslinux has vanished from the el9 repos**, so pxelinux.0 cannot be generated; after installing `grub2-tools-minimal`, `ipxe-bootimgs`, and `shim-*`, the grub/undionly artifacts can be produced. The full path on a real x86_64 machine: UEFI machines boot via grub/shim (mkloaders can generate those), while pxelinux.0 for legacy BIOS machines must be downloaded from the syslinux project yourself and placed into `/var/lib/cobbler/loaders/` — the official advice on check item 4 also says outright it can be ignored for pure x86/x86_64 network boot.

**5. Enable TFTP.** On el9, tftp is provided by `tftp-server` via socket activation: `systemctl enable --now tftp.socket` is all it takes — no more of the 2.x-era xinetd configuration dance.

## 3. Creating Records: distro, profile, system

Cobbler's object model has three layers: distro (kernel + initrd) → profile (distro + answer file) → system (a machine bound to a profile). There are two routes to importing a distro:

**The classic route, `cobbler import`**: mount the distro ISO and import it; the signature is auto-detected and a distro and profile are created:

```bash
mount rocky-9.4-x86_64-dvd.iso /mnt/
cobbler import --path=/mnt/ --name=rocky9-x86_64 --arch=x86_64
cobbler profile report --name=rocky9-x86_64
```

**The lightweight route, `distro add`**: create records directly when all you have are kernel and initrd files. The container test used the `/boot` files of an already-installed `kernel-core` (equally valid on real hardware — an upgraded server already has a ready kernel pair under `/boot`):

```bash
dnf install -y kernel-core
KV=$(ls /boot/vmlinuz-* | head -1 | sed 's|/boot/vmlinuz-||')
cobbler distro add --name=rocky9-demo --kernel=/boot/vmlinuz-$KV \
  --initrd=/boot/initramfs-$KV.img --breed=redhat
cobbler profile add --name=rocky9-demo --distro=rocky9-demo --autoinstall=default.ks
```

Two 3.x details: the answer-file option is called `--autoinstall` (not `--kickstart`), and the path must be written as a filename relative to `/var/lib/cobbler/templates/` — an absolute path fails with "Invalid automatic installation template file location" (hit in testing). In production, put your own templates into the templates directory and reference them by name.

With the profile created, use report to inspect the key fields:

![Figure 4](/images/csdn/figures/linux-cobbler-csdn105320427-4.png)

Mind the field name: the 2.x `Kickstart` field is called `Automatic Installation Template` in 3.x. `cobbler status` is an empty table at this point (no machine has installed yet); once clients start provisioning, IPs, progress, and states appear here — the most useful observation window during batch installs.

## 4. Customizing Installs by MAC

Pre-assign an IP and hostname to a specific machine. The plan: MAC `52:54:00:11:22:33`, IP 172.17.0.123/24, gateway 172.17.0.1, hostname node1:

```bash
cobbler system add --name=node1 --profile=rocky9-demo \
  --mac=52:54:00:11:22:33 --ip-address=172.17.0.123 \
  --netmask=255.255.255.0 --gateway=172.17.0.1 \
  --hostname=node1 --interface=eth0 --static=1
cobbler sync
```

- `--mac` is the key switch: only the machine whose MAC matches installs automatically with this configuration; unregistered machines stop at the PXE menu waiting for a manual choice;
- `--netmask` replaced the 2.x `--subnet`; the old name errors out directly with no such option;
- `--interface` takes the NIC name recorded on the client (e.g. eth0), not the cobbler server's NIC.

After sync, verify: a MAC-named configuration appears under `/var/lib/tftpboot/pxelinux.cfg/` (`01-52-54-00-11-22-33`), and `images/` holds kernel links for the corresponding distro — the PXE menu and boot files are all in place:

![Figure 5](/images/csdn/figures/linux-cobbler-csdn105320427-5.png)

At this point the provisioning environment is ready: a client on the same segment as cobbler with PXE as the first boot entry installs automatically the moment it powers on.

## 5. Online Reinstall of Already-Provisioned Machines (koan)

On a machine that needs reinstalling, use koan to kick it off: `koan --server=<cobbler IP> --list=profiles` to view profiles, then `koan --replace-self --server=<IP> --profile=<name>` to write the installer kernel into the local boot entry; a reboot then reinstalls automatically, never touching the PXE menu. **Note that this is a destructive operation** — after `--replace-self`, a reboot means a format and reinstall.

> Note: koan has a package on EPEL9 (verified: `dnf list koan` shows 3.0.1), but the online reinstall was not re-tested on Rocky 9; the procedure comes from the original article and the official docs. Rehearse on a test machine before reinstalling production servers.

## 6. Custom yum Repository (Optional)

Let freshly installed machines use a private-network repo directly:

```bash
cobbler repo add --name=my_repo --mirror=http://192.168.3.50/centos9 --breed=yum
cobbler reposync
cobbler profile edit --name=rocky9-demo --repos="my_repo"
```

During OS install, a repo file is generated automatically under yum.repos.d. The repo needs periodic syncing; a crontab entry running `cobbler reposync` on a schedule is enough.

## Historical Version Differences (CentOS 7 + Cobbler 2.8)

If old machines still run CentOS 7, the process skeleton is the same and the details follow below. CentOS 7 reached EOL in June 2024 — before installing, switch the repo's `baseurl` to `http://vault.centos.org` (comment out `mirrorlist`, then `yum clean all`):

```bash
yum install -y epel-release cobbler cobbler-web dhcp xinetd tftp pykickstart
# /etc/cobbler/settings (not YAML): change the server and next_server lines to this machine's IP
openssl passwd -1 -salt 'random-phrase-here' 'your-password'
# Fill the hash into default_password_crypted
cobbler get-loaders                     # a 2.x-only command
sed -i 's/disable = yes/disable = no/' /etc/xinetd.d/tftp   # xinetd manages tftp
# manage_dhcp: 1 → cobbler sync         # on 2.x the single switch takes effect
```

The 2.8 import/koan/MAC-binding flow is isomorphic to the one above, with options `--kickstart` and `--subnet`. For fresh installs, always prefer deploying per the Rocky 9 flow.

## Failure Exits

- **settings.yaml broken by an edit**: restore the backup, then `systemctl restart cobblerd && cobbler sync`; every config change requires a restart + sync to take effect.
- **sync reports "Restarting service dhcpd failed"**: nine times out of ten the template subnet disagrees with the server's NIC network segment; check `journalctl -u dhcpd` for the real cause, fix `/etc/cobbler/dhcp.template`, and sync again.
- **sync completes but dhcpd.conf is unchanged**: check whether `manage_dhcp_v4` is true — the old key `manage_dhcp` does not trigger rendering on 3.x (hit in testing).
- **You no longer want cobbler managing DHCP**: flip `manage_dhcp_v4` back to false and sync, then maintain dhcpd.conf by hand; while management is on, manual edits get overwritten.
- **Remove a MAC binding**: `cobbler system remove --name=node1 && cobbler sync`.
- **Remove everything**: `dnf remove cobbler dhcp-server`, then manually clean up the leftovers in /var/lib/cobbler and /var/www/cobbler.

## Common Command Cheat Sheet

| Command | Purpose |
|------|------|
| `cobbler check` | Inspect configuration problems; produces an advice list |
| `cobbler mkloaders` | Generate boot loaders (3.x; replaces get-loaders) |
| `cobbler import` | Import an image; adds distro+profile |
| `cobbler distro/profile/system add` | Manually create the three-layer objects |
| `cobbler list` / `report` | List entries / show details |
| `cobbler sync` | Sync after config changes; regenerates PXE/DHCP configuration |
| `cobbler status` | Check install task progress |
| `cobbler reposync` | Sync repo sources |
| `cobbler profile edit` | Modify a profile (swap answer file, attach repos) |
| `cobbler system add/remove` | Manage MAC bindings |

## Caveats

- Each imported distro takes 5-10GB; plan /var space before importing images.
- default_password_crypted must be changed, or every machine installed will carry the publicly known default root password.
- **Old tutorials cannot be copied onto 3.x**: the config file, switch names, and subcommand names have all changed — run `cobbler check` and compare against the official docs before touching anything.
- **el9 has no syslinux**: before batch-installing legacy BIOS machines, confirm pxelinux.0 is already in place, or go UEFI across the board.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
