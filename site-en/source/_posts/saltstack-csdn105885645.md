---
title: "SaltStack Installation, Configuration, and Minion Authentication (Rocky Linux 9)"
date: 2020-05-02 01:11:40
updated: 2026-09-14
categories: [Tech, SaltStack]
tags: [SaltStack]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1509803874385-db7c23652552?w=1600&q=80&fm=jpg
lang: en
---

Running commands and pushing configuration across a fleet of machines one SSH session at a time is clearly not realistic. SaltStack exists for exactly this scenario: with a Master/Minion architecture, the control node can reach hundreds or thousands of machines in seconds. This post builds a SaltStack setup from scratch on two Rocky Linux 9 containers — installing the Master and Minion, writing minimal configuration, completing key authentication, and verifying communication with the `salt` command — with a verification point at every step, reproducible by following along.

## What SaltStack Is

Salt is an infrastructure management tool written in Python: easy to deploy and running within minutes; highly scalable, comfortably managing tens of thousands of servers. It has three core capabilities: remote execution, configuration management, and cloud management. It runs in four modes: local, Minion/Master, Syndic, and Salt SSH — this post follows Minion/Master: every managed machine installs a Minion, the control node installs the Master, and the Minion connects to the Master to establish an encrypted channel.

## Prerequisites

- Two nodes: node1 as the Master (also installing a Minion so it manages itself), node2 with only a Minion; OS Rocky Linux 9 (RHEL 9 shares the same lineage)
- Internal network connectivity, and node2 able to resolve/reach node1's ports 4505 and 4506
- root access; the EPEL repository reachable (the Salt packages come from EPEL)

The nodes used in this test (Docker twin containers, hostnames serve as Minion IDs):

| Node | Hostname | Role | Salt Version |
| --- | --- | --- | --- |
| node1 | master-node1 | master + minion | 3005.4 |
| node2 | minion-node2 | minion | 3005.4 |

## Installation Steps

### Step 1: Enable EPEL and Install Salt (both machines)

Rocky 9's EPEL repository provides Salt 3005.x directly, on a Python 3 runtime, with no worries about legacy Python 2 dependencies:

```bash
dnf -y install epel-release
dnf -y install salt-master salt-minion   # node2 installs only salt-minion
```

Verification point: `rpm -q salt` outputs `salt-3005.4-1.el9.noarch` (the version number moves forward with EPEL updates; anything 3005.x or above is fine).

![Figure 1](/images/csdn/figures/saltstack-csdn105885645-1.png)

### Step 2: Master configuration (node1)

Configuration files live under `/etc/salt`, named by component: `/etc/salt/master` and `/etc/salt/minion`, with snippet-style `/etc/salt/minion.d/*.conf` also supported. By default the Master listens on 4505/4506 on all interfaces (0.0.0.0); to bind a specific IP, change it in `/etc/salt/master`:

```diff
- #interface: 0.0.0.0
+ interface: 192.168.3.100
```

Division of labor between the two ports: 4505 (publish_port) is the message publication port, 4506 (ret_port) is the port Minions use to return results to the Master. Open these two ports in the firewall (commands in the Caveats section at the end); the container environment has no firewalld, so this was skipped during the live test.

### Step 3: Minion configuration (the Minions on both machines)

By default a Minion tries to connect to the DNS name `salt`; if that does not resolve, point it at the Master in the Minion config:

```diff
- #master: salt
+ master: 192.168.3.100
```

For this test the setting went into `/etc/salt/minion.d/m.conf` with the single line `master: saltm` (the master container name). If your internal network has DNS, configuring the master value as a hostname is easier to maintain than a bare IP.

### Step 4: Minion ID

Every Minion needs a unique identity, taken by default from the FQDN on first start and stored in `/etc/salt/minion_id`. Two rules of thumb:

- Once the id is set, don't change it casually — the authentication key is generated per id; if the id changes, the Master must accept authentication again as if for a brand-new machine.
- If you really must change it, delete `/etc/salt/minion_id` first, otherwise the minion reads the old file at startup and no configuration change takes effect.

This test does not change the id and uses the hostnames directly: master-node1 and minion-node2.

### Step 5: Start the Services

Physical/virtual machines have systemd:

```bash
systemctl enable --now salt-master salt-minion   # node1
systemctl enable --now salt-minion               # node2
```

Containers have no systemd, so start directly in daemon mode (the method used in this test): `salt-master -d`, `salt-minion -d`.

Verification point: on node1, `salt-key -L` should show master-node1 and minion-node2 under Unaccepted Keys — seeing them means the Minions have connected to the Master on their own and delivered their public keys.

## Completing Authentication

### How Authentication Works and Fingerprint Checking

The flow has two steps: the Minion sends its public key to the Master; the Master accepts it and sends its own public key back to the Minion. From then on, all communication between the two sides is AES-encrypted.

Before formally accepting, check fingerprints to guard against connecting to the wrong Master or falling to a MiTM: on the Master, `salt-key -F master` lists local and each Minion's fingerprints; on the Minion, `salt-call --local key.finger` prints its own fingerprint. Proceed only when both sides match.

### Accepting the Keys

![Figure 2](/images/csdn/figures/saltstack-csdn105885645-2.png)

`salt-key -y -A` accepts all pending keys (for interactive per-host confirmation use `salt-key -a <hostname>`). Common flags: `-L` view status, `-a` accept a specific one, `-A` accept all, `-d`/`-D` delete specific/all, `-r` reject a specific one.

Once authentication completes, the public keys settle into the PKI directory (default `/etc/salt/pki/`, auto-generated on first start):

![Figure 3](/images/csdn/figures/saltstack-csdn105885645-3.png)

On the Master, both Minions' public keys move from `minions_pre` into `minions`; on the Minion side, `minion_master.pub` appears — the Master's public key is now in the Minion's hands, and mutual trust is established.

### Verifying Communication

![Figure 4](/images/csdn/figures/saltstack-csdn105885645-4.png)

When `test.ping` returns True for all and `grains.get osfinger` reports the OS version, the encrypted channel between Master and Minion is through. After that, remote execution like `salt "*" cmd.run "hostname"` can combine targets freely (`*` for all, `minion*` glob, exact hostname).

## What If the Installation Breaks (Rollback)

```bash
dnf remove -y salt-master salt-minion
rm -rf /etc/salt        # wipes configuration and PKI entirely, back to a pre-install state
```

To redo only the authentication while keeping the configuration: on the Master run `salt-key -D` to delete all keys; on the Minion delete `/etc/salt/minion_id` and `/etc/salt/pki/minion/`, restart salt-minion, and walk through authentication again.

## Common Errors

- **`salt '*' test.ping` returns `Minion did not return. [No response]`**: this appeared once during the first-connection phase of this test — the Minion had just completed authentication but had not yet reconnected to the publish channel. Wait a few seconds and retry; if still silent, restart salt-minion and try again.
- **A Minion stays in Unaccepted forever**: most likely 4505/4506 are not open, or the master setting is wrong (unresolvable / port unreachable).
- **An id change does not take effect**: delete `/etc/salt/minion_id` and restart salt-minion.
- **firewalld refuses to open the port**: confirm the command included `--permanent` and that `firewall-cmd --reload` ran afterwards, otherwise the rule dies at the next restart.

## Caveats

- **Once a Minion ID is authenticated, don't change it casually**: keys are generated per id; a changed id means re-authentication. If you must change it, delete the minion_id file first.
- **Fingerprint checking is not optional**: with many machines, accept one by one with `salt-key -a` and check fingerprints; `-A` in one gulp risks admitting unfamiliar machines.
- **Remember the port division of labor**: 4505 publishes, 4506 returns; open only these two TCP ports in the firewall.
- **After authentication, salt-key -L should show no Unaccepted keys**: if one appears, a new machine joined or an id changed — verify before deciding whether to accept.

## Historical Version Differences (CentOS 7)

The original walkthrough was based on a CentOS 7.7 two-machine exercise: installation went through `yum install https://repo.saltstack.com/yum/redhat/salt-repo-latest.el7.noarch.rpm`, with Python 2.7.5 as the runtime. On Rocky 9 only two things differ — the install source moves to EPEL (`dnf install epel-release`, then install the packages directly) and the runtime becomes Python 3; the configuration file locations, the 4505/4506 ports, and the `salt-key` authentication flow and commands are exactly the same, so legacy environments can migrate straight across using this mapping.

> This article was rewritten from the author's CSDN blog posts originally published between 2020 and 2024.
