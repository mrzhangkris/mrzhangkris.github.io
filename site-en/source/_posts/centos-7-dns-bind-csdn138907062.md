---
title: "Setting Up a BIND DNS Server on Rocky Linux 9: Forward and Reverse Resolution (with CentOS 7 Differences)"
date: 2024-05-19 09:30:00
updated: 2026-09-14
lang: en
categories: [Tech, Network Services]
tags: [Network Services]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1518181835702-6eef8b4b2113?w=1600&q=80&fm=jpg
---

Once the intranet has a handful of machines, maintaining domains through /etc/hosts turns into a disaster — time to run your own DNS. This post uses BIND to set up a DNS server, configuring forward resolution (domain to IP) and reverse resolution (IP to domain) in one pass, and closes with the essentials of day-to-day maintenance and troubleshooting.

The whole flow in this post was tested in a Rocky Linux 9 container: BIND 9.16.23-RH, both syntax checks, dig lookups in both directions, and `rndc reload` smooth reloading all verified — every output comes from a real run. The CentOS 7 differences are concentrated in the "Historical Version Differences" section.

## I. Software Download

Install the BIND server and the query tools, both from the distro's default repos:

```bash
dnf install bind bind-utils
```

- bind: the DNS server program.
- bind-utils: DNS query tools, including dig and nslookup.

After installing, confirm and record the version; the measured output is `BIND 9.16.23-RH (Extended Support Version)`:

```bash
named -v
```

## II. Planning

Before touching configuration, settle three things:

- **Decide the domain**: for example, example.com.
- **Plan IP addresses**: assign IPs to the DNS server and each host.
- **Design the forward and reverse zones**: determine which zone files are needed.

## III. Deployment and Configuration

### Configure named.conf

Edit the main configuration file:

```bash
vi /etc/named.conf
```

el9's default named.conf already contains a complete `options` block; the approach is to change two lines inside the block and then append the zone declarations to the end of the file:

In the options block, change `listen-on port 53 { 127.0.0.1; };` to `any`, and `allow-query { localhost; };` to `any` (leave directory, dump-file and the rest at their defaults). Then append two zones at the end of the file:

```conf
zone "example.com" IN {
    type master;
    file "/var/named/forward.example.com";
    allow-update { none; };
};

zone "1.168.192.in-addr.arpa" IN {
    type master;
    file "/var/named/reverse.example.com";
    allow-update { none; };
};
```

- listen-on port 53 { any; }: BIND listens for DNS requests on port 53 of all interfaces.
- zone "example.com": the forward zone, with its records stored in the forward.example.com file.
- zone "1.168.192.in-addr.arpa": the reverse zone; the network it covers is 192.168.1.0/24.

### Create the Forward Zone File

```bash
vi /var/named/forward.example.com
```

Content example:

```conf
$TTL 86400
@   IN  SOA     ns1.example.com. admin.example.com. (
                    2023042401  ; Serial
                    3600        ; Refresh
                    1800        ; Retry
                    604800      ; Expire
                    86400       ; Minimum TTL
                    )
@   IN  NS      ns1.example.com.
ns1 IN  A       192.168.1.1
www IN  A       192.168.1.2
```

- The SOA record marks the start of authority and lists the primary nameserver and the domain administrator's mailbox.
- The NS record specifies the nameserver.
- A records map domain names to IP addresses.

### Create the Reverse Zone File

```bash
vi /var/named/reverse.example.com
```

Content example:

```conf
$TTL 86400
@   IN  SOA     ns1.example.com. admin.example.com. (
                    2023042401  ; Serial
                    3600        ; Refresh
                    1800        ; Retry
                    604800      ; Expire
                    86400       ; Minimum TTL
                    )
@   IN  NS      ns1.example.com.
1   IN  PTR     ns1.example.com.
2   IN  PTR     www.example.com.
```

PTR records serve reverse resolution, mapping IP addresses back to domain names. Note that the record name here is the last octet of the IP: `1` corresponds to 192.168.1.1 and `2` to 192.168.1.2 — the network portion is already carried by the zone name `1.168.192.in-addr.arpa`.

### Run Both Syntax Checks Before Starting

BIND ships its own check tools, and nine out of ten startup failures would surface here in advance. Check the main configuration and the two zone files separately; the measured output: both zones report `loaded serial 2023042401` + `OK`:

```bash
named-checkconf
named-checkzone example.com /var/named/forward.example.com
named-checkzone 1.168.192.in-addr.arpa /var/named/reverse.example.com
```

![Figure 1](/images/csdn/figures/centos-7-dns-bind-csdn138907062-1.png)

### Start the Service and Test

Once all checks pass, start BIND:

```bash
systemctl enable named
systemctl start named
```

Check the service status and confirm it is active (running):

```bash
systemctl status named
```

Use dig to test forward resolution:

```bash
dig @localhost www.example.com +short
```

The measured return is the IP 192.168.1.2 for www.example.com. Test reverse resolution:

```bash
dig @localhost -x 192.168.1.2 +short
```

The measured return is the corresponding domain, www.example.com. Only when both lookups match the A/PTR records in the zone files one-to-one does the test count as passed:

![Figure 2](/images/csdn/figures/centos-7-dns-bind-csdn138907062-2.png)

## IV. rndc: Open the Control Channel First on el9

`rndc reload` makes modified zone files take effect smoothly without restarting the service; measured, `rndc reload example.com` returns `zone reload up-to-date`. But el9's default named.conf declares no control channel, and running rndc directly reports `connect failed: 127.0.0.1#953: connection refused`. Three steps are needed, as measured:

```bash
rndc-confgen -a                          # generate /etc/rndc.key
chown root:named /etc/rndc.key && chmod 640 /etc/rndc.key
```

Then append two lines to /etc/named.conf, and named opens the control channel on port 953 at startup:

```conf
include "/etc/rndc.key";
controls { inet 127.0.0.1 port 953 allow { 127.0.0.1; } keys { "rndc-key"; }; };
```

Three measured pitfalls: with the key file not generated, rndc reports it cannot find the configuration; after generation the file is owned root:root mode 600, and named — which re-reads it as the named user — exits outright with `permission denied`; and with both fixed but named already running, named must be restarted before 953 opens. Under systemd management the first `systemctl start named` does not necessarily handle these for you; verifying each item is the safest.

## V. Maintenance and Troubleshooting

- **View logs**: on el9's systemd environment, use `journalctl -u named` for logs; in the CentOS 7 era, logs were in /var/log/messages.
- **Update zone files**: to add a DNS record, edit the zone file, run it through `named-checkzone` first, then `rndc reload` (measured to return `zone reload up-to-date` — smoother than restarting the service).
- **Roll back broken configuration**: before editing named.conf or a zone file, `cp` a dated backup first; if a check fails, restore the backup and redo — no service stop needed.
- **Security configuration**: never expose recursive queries to the public internet, or the server will be hijacked as a tool for DNS amplification attacks.

## Historical Version Differences (CentOS 7)

- **Version**: on CentOS 7 it was BIND 9.11.4-P2 (tested), versus 9.16.23-RH on Rocky 9; the named.conf and zone-file syntax is identical across the two generations, and this article's configuration works as-is.
- **System repos**: CentOS 7 reached end of maintenance on 2024-06-30; you need to switch the yum repos to the vault.centos.org archive before installing (tested installable); el9 goes straight through dnf's default repos.
- **rndc**: rndc's basic usage is the same across both generations; on el9, just complete the control channel as described above.

## Summary

This post walked a minimal viable route: install bind and bind-utils, set the listen and query ranges in named.conf, declare the forward and reverse zones, write one zone file each, start named and verify both directions with dig, and finally complete rndc's control channel for smooth daily reloads. A records go in the forward zone and PTR records in the reverse zone; only when the IPs match on both sides does the test count as passed.

---

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
