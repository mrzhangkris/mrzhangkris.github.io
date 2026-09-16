---
title: "Static IP and Multi-NIC Routing Policies on Rocky Linux 9 (with CentOS 7 Differences)"
date: 2024-05-16 08:30:00
updated: 2026-09-14
lang: en
categories: [Tech, Linux]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1610563166150-b34df4f3bcd6?w=1600&q=80&fm=jpg
---

A server that must serve traffic long-term cannot have a floating IP: the moment a DHCP lease renews and the address changes, remote access, DNS resolution, and firewall whitelists all break with it. This post records the complete approach to static IPs on the RHEL 9 family (Rocky Linux 9) — how to configure a single NIC, which connection becomes the default egress with multiple NICs, how to steer traffic for specific subnets onto a designated NIC, and the two places most likely to blow up. Every step was tested in a Rocky Linux 9.3 container; the end of the post has a CentOS 7-era ifcfg comparison.

## The Core Mechanism in One Sentence

Since RHEL 9, networking is managed uniformly by NetworkManager: one `nmcli connection` command corresponds to one keyfile persisted under `/etc/NetworkManager/system-connections/*.nmconnection`, and `nmcli con up` activates it; multi-NIC traffic splitting relies on `ipv4.routes` in the connection configuration (route-ethN files in the CentOS 7 era). Runtime verification is always `ip addr` plus `ip route show`.

## Lab Environment

- OS: Rocky Linux 9.3 container (NetworkManager 1.54.3, iproute 6.17, aarch64)
- A container has no systemd by default; this post emulates it equivalently by manually starting the bus with `dbus-daemon --system` and then running `NetworkManager --no-daemon` in the foreground; on a real server NM starts with the system, so just use nmcli directly
- The routing experiments involve kernel routing-table changes; the container must be started with `--cap-add NET_ADMIN`
- There is no second physical NIC in a container, so `ip link add eth1 type dummy` creates a virtual NIC playing the internal interface; the configuration method is identical to a real NIC

## Example 1: Static IP on a Single NIC

Start with the simplest scenario: one eth0, pinned to 192.168.1.100 with gateway 192.168.1.1. One nmcli command creates the connection configuration, supplying address, gateway, and DNS all at once:

```bash
nmcli con add type ethernet con-name static-eth0 ifname eth0 \
  ipv4.method manual ipv4.addresses 192.168.1.100/24 \
  ipv4.gateway 192.168.1.1 ipv4.dns 8.8.8.8
```

`ipv4.method manual` is the switch for a static IP — equivalent to `BOOTPROTO=none` in CentOS 7's ifcfg; write `auto` instead and it goes DHCP, ignoring the manual address entries. The moment the command runs, the configuration is already persisted as a keyfile:

![Figure 1](/images/csdn/figures/centos-ip-csdn138852694-1.png)

This keyfile is the "configuration file" on RHEL 9 and survives reboots; to change it, keep using `nmcli con mod` — do not hand-edit the file. Activate and verify:

```bash
nmcli con up static-eth0
ip -4 addr show eth0
ip route show
```

![Figure 2](/images/csdn/figures/centos-ip-csdn138852694-2.png)

Verification points: `ip addr` shows 192.168.1.100, `ip route show` has the default route pointing to 192.168.1.1, and `ping 192.168.1.1` succeeds — only then is the configuration landed. When operating remotely, open a new session before dropping the old one — the instant `con up` replaces the address, the old session loses contact.

## Example 2: Dividing Work Across Multiple NICs

The principle when a server has two NICs: **configure the gateway on the external interface, and only the address on the internal one**.

eth0 connects to the internet, configured as in Example 1 (static-eth0, gateway included). eth1 connects to the internal 10.0.0.0/24 with only the address:

```bash
nmcli con add type ethernet con-name inner-eth1 ifname eth1 \
  ipv4.method manual ipv4.addresses 10.0.0.100/24
```

Why no gateway on eth1: a Linux routing table admits only one effective default route; give both NICs a gateway and you get two default routes, with outbound traffic following whichever one the kernel's metric picks — the result is connectivity that comes and goes. Traffic that needs to leave via eth1 gets pointed there explicitly with a route from the next section.

## Example 3: Splitting Traffic by Subnet

Make traffic for 10.1.1.0/24 always leave via eth1 with next hop 10.0.0.1. On RHEL 9 you no longer create a route-eth1 file; append the route directly to the connection configuration:

```bash
nmcli con mod inner-eth1 +ipv4.routes "10.1.1.0/24 10.0.0.1"
nmcli con up inner-eth1
```

![Figure 3](/images/csdn/figures/centos-ip-csdn138852694-3.png)

The plus sign in `+ipv4.routes` means append (without it, the whole list is replaced and existing routes get wiped — be extra careful when batch-configuring routes). In the persisted keyfile it is one line, `route1=10.1.1.0/24,10.0.0.1` — before the comma the target subnet, after it the next hop. Verification points: `ip route show` shows this line, and pinging `10.1.1.x` from the host confirms traffic leaves via eth1.

This syntax can be pre-checked on a running system directly with the ip command, without waiting for the configuration to take effect — with an invalid next hop, the kernel errors immediately:

![Figure 4](/images/csdn/figures/centos-ip-csdn138852694-4.png)

## Wrong-Way Comparison

**Mistake one: a gateway on both NICs.** On the surface, "every NIC should have its own gateway"; in reality it produces two default routes, outbound traffic becomes unstable, and the symptom is "intranet fine, internet intermittent". The correct approach: the gateway is written only on the external interface's connection configuration, and the internal interface gets only `ipv4.addresses`.

**Mistake two: a hand-waved next hop in routes.** Writing `+ipv4.routes "10.1.1.0/24 192.168.1.1"` on inner-eth1 — the next hop is not within eth1's subnet, and at `con up` the route cannot be installed into the kernel. The correct approach: the next hop must be reachable within the same subnet as that interface; pre-check it first with `ip route add` as in Figure 4, confirm both syntax and behavior, and only then put it into the connection configuration.

## Historical Version Differences (CentOS 7)

Readers migrating from CentOS 7, compare against this table:

| Item | CentOS 7 (network-scripts) | Rocky Linux 9 (NetworkManager) |
|------|---------------------------|-------------------------------|
| Address config | edit `ifcfg-ethN`, `BOOTPROTO=none` + `IPADDR` | `nmcli con add ... ipv4.method manual` |
| Gateway | `GATEWAY=` in ifcfg (write one copy globally) | `ipv4.gateway` in the connection config (likewise one copy) |
| Static routes | `via` lines in a route-ethN file | `nmcli con mod +ipv4.routes` |
| Activation | `systemctl restart network` | `nmcli con up <connection>` |
| Config files | `/etc/sysconfig/network-scripts/ifcfg-*` | `/etc/NetworkManager/system-connections/*.nmconnection` |

Confirmed by real runs: Rocky 9's `/etc/sysconfig/network-scripts/` directory holds nothing but a `readme-ifcfg-rh.txt`; the network-scripts package no longer exists, and the `systemctl restart network` unit is gone too. NetworkManager still reads the ifcfg format for compatibility (details in that readme), but new configurations should always go through nmcli. At the syntax level, `ip route`'s `via` form is identical across both eras, and route-ethN lines can be moved directly into `ipv4.routes` (spaces become commas).

## Notes

- Before changing network configuration remotely, back up the keyfile first (`cp /etc/NetworkManager/system-connections/xxx.nmconnection{,.bak}`) and keep an out-of-band fallback (console/iLO) beyond the current session — a failed `con up` or a mistyped address cuts SSH on the spot.
- The keyfile defaults to mode 600; when hand-creating one, do not loosen it to 644 — it may contain secret-type fields.
- `nmcli con mod` parameters with a plus sign append; without one they overwrite. If `ipv4.routes` gets overwritten by accident, rewrite the whole route set back in one go.
- Reproducing these experiments in a container requires `--cap-add NET_ADMIN`; without it, `ip route add` reports `RTNETLINK answers: Operation not permitted` — that is a missing capability bit, not a syntax problem.
- To inspect connection state, use `nmcli con show` (the configuration) plus `nmcli device status` (which device is actually managed by whom); only when the connection names match on both sides is the configuration bound to the NIC.

## Summary

Back to the opening scenario: keep the IP from floating with `ipv4.method manual` plus one keyfile; keep multi-NIC routing sane with a single gateway plus precise splitting via `ipv4.routes`. Activate with `nmcli con up`, verify with both `ip addr` and `ip route show`; for old configurations coming from CentOS 7, translate the ifcfg trio into nmcli commands using the comparison table at the end.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
