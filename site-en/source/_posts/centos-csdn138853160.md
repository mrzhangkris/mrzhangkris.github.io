---
title: "Checking NIC Speed on Rocky Linux 9: ethtool, ifconfig, and nmcli"
date: 2024-05-16 09:07:41
updated: 2026-09-14
categories: [Tech, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1600&q=80&fm=jpg
lang: en
---

When troubleshooting a network problem, the first task is confirming what speed the NIC actually negotiated — a lit link light does not mean the link is running at its expected bandwidth. A gigabit port negotiating down to 100M, or auto-negotiation failing and downshifting the link: these are not rare in a server room. Linux offers three common entry points for NIC information: ethtool for link-layer speed, ifconfig (or its modern replacement `ip addr`) for interface state, and nmcli for device details under NetworkManager. This post is organized by "what you want to see" — find your row and read.

All output in this post was verified on a Rocky Linux 9.3 container (ethtool 6.15, net-tools 2.0, iproute 6.17, NetworkManager 1.54.3, aarch64). On CentOS 7/8/9 and the RHEL family the commands and fields are the same; the numbers vary by environment.

## For Negotiated Speed and Duplex: ethtool

ethtool queries the link-layer state straight from the NIC driver — the first choice for speed. A Rocky Linux 9 minimal install does not ship it; install ethtool and net-tools together, since both appear in this post:

```bash
dnf install -y ethtool net-tools
```

![Figure 1](/images/csdn/figures/centos-csdn138853160-1.png)

> Note: Rocky 9's `dnf` is usage-compatible with CentOS 7's `yum`; swapping dnf for yum in these commands works on CentOS 7 too.

Then query a specific interface (eth0 throughout this post; substitute your actual interface name):

```bash
ethtool eth0
```

![Figure 2](/images/csdn/figures/centos-csdn138853160-2.png)

The full output is long; four fields matter first when troubleshooting:

- **Speed**: the currently negotiated rate — 10000Mb/s means a 10-gigabit link. A gigabit NIC showing 100Mb/s: check the cable and the peer port first, not the OS.
- **Duplex**: the duplex mode. Full is full duplex; Half invites collisions and dropped packets on the link, usually the result of a failed auto-negotiation downgrade.
- **Auto-negotiation**: whether auto-negotiation is on. Both ends must be configured consistently; one end fixed and the other negotiating is the most common configuration trap.
- **Link detected**: whether the link is up. When it shows no, swap the cable first, then check the switch port.

> Note: the Figure 2 output carries one extra line at the end, `netlink error: Operation not permitted`, caused by the container lacking privileged bits. It does not appear on physical machines and does not affect reading the fields.

When installing drivers or matching a NIC model, add `ethtool -i eth0`; the `driver` field names the driver directly — veth in the container, and on physical machines commonly igb, e1000, ixgbe, or virtio_net:

![Figure 3](/images/csdn/figures/centos-csdn138853160-3.png)

Beyond querying, ethtool can also change negotiation parameters temporarily (`ethtool -s eth0 speed 1000 duplex full`), but for troubleshooting the read-only query is what you use most — changing parameters is a change operation that needs a change record, it is lost on reboot, and making it permanent requires the connection configuration (see the caveats at the end).

## For a Quick Interface State Check: ifconfig

ifconfig answers "is this interface up, is the address right": IP, netmask, broadcast address, MTU, plus packet counters — all in one view:

```bash
ifconfig eth0
```

![Figure 4](/images/csdn/figures/centos-csdn138853160-4.png)

In the eth0 line's flags, `UP,RUNNING` means the interface is enabled and the link is healthy; the `inet` line is the IPv4 address and mask; `RX/TX packets` are the receive and transmit counters. If `RX errors` keeps growing, something is wrong at the link layer — go back to ethtool for speed and duplex.

Two reminders: ifconfig belongs to the net-tools package, absent from minimal installs from CentOS 7 through Rocky 9 — the dnf at the top of this post installed it along the way; and the package itself has not been updated in years, so on newer systems prefer the iproute2 equivalents — `ip addr` for addresses, `ip -s link` for counters, whose output conventions match ifconfig's:

```bash
ip -s link show eth0
```

![Figure 5](/images/csdn/figures/centos-csdn138853160-5.png)

## The Full Device Picture Under NetworkManager: nmcli

Since the RHEL 7 family, the network is managed by NetworkManager by default, and nmcli is its command-line entrance. `nmcli device show` lists a device's type, driver, MAC, and full IPv4 configuration:

```bash
nmcli device show eth0
```

This command requires the NetworkManager daemon to be running. The container had the NetworkManager package installed (1.54.3) but no daemon, and the command failed directly, as verified:

![Figure 6](/images/csdn/figures/centos-csdn138853160-6.png)

On a normal server (NM running), the output is longer than the previous two commands and suits a one-time full device inventory. Per the nmcli(1) manual, `GENERAL.DRIVER` is the NIC driver name (matching the driver from `ethtool -i`) — useful when installing drivers or tuning parameters; `IP4.ADDRESS[1]` is the currently effective address, faster than digging through config files. It also has one irreplaceable use: after modifying a connection configuration (`nmcli con ...`), re-run the same command to check that configuration and actual state agree.

## Command Cheat Sheet

| Command | What it shows | Typical scenario |
| --- | --- | --- |
| `ethtool eth0` | Speed, duplex, auto-negotiation, link | Bandwidth below expectation, packet-loss investigation |
| `ethtool -i eth0` | Driver name, firmware version | Matching a NIC model, confirming before driver install |
| `ifconfig eth0` | IP, netmask, MTU, RX/TX counters | Quick interface state and address check |
| `ip addr` / `ip -s link` | Addresses and interface state (with counters) | Replacing ifconfig on newer systems |
| `nmcli device show eth0` | Driver, MAC, full IPv4 configuration | Device inventory under NetworkManager |

## Historical Version Differences (CentOS 7)

For readers coming from CentOS 7, the three commands themselves are unchanged; the differences are in the surroundings:

- **Install command**: `yum` → `dnf`, usage-compatible and a direct swap; CentOS 7 is EOL and its official repos are offline — you must switch to the vault repos to install packages.
- **NIC naming**: consistent naming has been the norm since CentOS 7 (ens192, ens33 and the like) rather than eth0 — run `ip link` to list the actual interface names first, then substitute.
- **net-tools absent**: CentOS 7 minimal installs also lack ifconfig — old and new systems agree there; the difference is that on newer systems the officially recommended slot has gone to iproute2.

## Caveats

- Substitute your environment's actual interface name. RHEL 8/9 occasionally retains custom naming rules; go by the actual output of `ip link`, not a copied eth0.
- Suspect the physical layer first when speed is wrong. Low Speed or Duplex showing Half: check the cable, optical module, and peer switch port before anything at the OS level.
- A fixed speed only counts once it lands in configuration. `ethtool -s` is temporary and lost on reboot; persistence goes into the connection configuration (nmcli's ethtool-related settings), and both ends must be fixed simultaneously — fixing only one end leaves the link either unable to come up or downshifted.
- For scripts, prefer `ip -4 addr show eth0` with grep to extract IPs — steadier than depending on ifconfig.
- Testing NIC parameters inside a container means little: veth speed/duplex are virtual values handed down by the host; capacity planning should be based on physical machine measurements.

## Summary

For bandwidth troubleshooting: use ethtool to confirm what the link negotiated (`-i` adds driver information), then ifconfig or `ip -s link` to confirm interfaces and addresses, and in a NetworkManager environment nmcli gives a device's complete profile. Three entry points, each covering one layer — pick by what you want to see.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
