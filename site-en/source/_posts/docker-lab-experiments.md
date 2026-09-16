---
title: "Docker Containers as an Experimental Lab: A Playbook for Hands-On Batch Testing"
date: 2026-09-15 23:22:00
categories: [Tech]
tags: [Docker, Lab Environment, Ops, Automation]
lang: en
copyright_author: 干将
cover: https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1600&q=80&fm=jpg
---

To verify whether a DHCP server configuration is correct, the textbook approach is to prepare two machines: one running dhcpd, the other acting as the client. These days, my first step for this kind of verification is `docker run`. Over the past year or so, a batch of server-side experiments has gradually moved into containers: the four-step DHCP negotiation for MAC-based fixed IP binding, a three-node ZooKeeper election, mutual NFS mounts between two machines, a cross-version Nginx hot upgrade, troubleshooting an OpenResty source build, and installing an old Elasticsearch release on an ARM machine by emulating amd64. Each experiment's process and conclusions have their own dedicated post (links at the end). This article answers only one question: **treating containers as an experimental lab — how do you make it smooth, trustworthy, and easy to clean up?**

Let me draw the boundary first: everything below is first-hand, hands-on testing, not speculation. The environment for each experiment (image, version, architecture) is written at the top of its dedicated post, and every error message comes from a real run. This article distills the methodology; it does not repeat the experiment details.

## Why Treat Containers as an Experimental Lab

The need for these experiments came entirely from real work — not testing for testing's sake. After CentOS 7 went EOL, someone had to blaze the migration path for the legacy environments first. dhcpd behaves differently on Rocky 9 than on CentOS 7 (the listening interface no longer needs to be specified manually), and a version difference like that is hard to trust from documentation alone — you have to verify it with your own hands on the new system. The Nginx hot-upgrade signal sequence was going into the production runbook, so both the success and failure forms had to be rehearsed first. What these verifications share is this: **they need an environment that is clean, describable, and disposable.**

Virtual machines can provide that, but they are too expensive. Spinning up a VM takes minutes and occupies gigabytes of disk, and once the experiment is done you hesitate to delete it — the moment an environment becomes precious, you start making do inside it, and making do is how environments get dirty. Containers drive the unit price of an environment down to tens of seconds and a few hundred megabytes. An experiment is, at its core, "asking an environment a question": the cheaper the environment, the more willing you are to ask, and the more willing you are to throw it away once the answer is in.

There is also a less obvious benefit: containers force you to write the environment down. Image tag, software version, machine architecture — these three must go into the experiment log. Six months later, what reproduces the experiment is not the container that happens to still be alive, but the environment description in your notes. Every one of my hands-on posts opens with an environment declaration (for example, a rockylinux:9 container, dhcp-server 4.4.2, aarch64), and that format is a habit the container lab forced on me.

## The Playbook

The same lab hosts different kinds of experiments, and each kind has its own way of being played. The six below are laid out in the order I actually ran them.

### Single-Container Closed Loop: Server and Client Talk Inside One Container

The most topology-light approach is to run both roles inside the same container. The DHCP verification was done exactly this way: dhcpd and dhclient lived together in one Rocky 9 container, the client kicked off the four-step negotiation (DHCPDISCOVER → DHCPOFFER → DHCPREQUEST → DHCPACK), each end observed the other's packets through its kernel receive path, the server's OFFER/ACK logs matched the client's `bound to 192.168.254.150` one for one, and the MAC binding hit exactly.

The value of the single-container loop goes beyond saving machines: it can close the loop on **negative verification** too. The rule that a binding address must stay out of the dynamic pool range is one I learned by running the counterexample: write the range as 150-200 (which includes the binding address 150), and a client whose MAC does not match any host declaration grabs 150 right away — dynamic allocation only looks at free addresses within the range and never consults the host table. When the device that is actually bound connects later, a conflict is already planted. This counterexample reproduced in a few minutes inside the same container, more convincingly than any written argument.

### Multi-Container Topology: A Custom Network Plus Container Names as Hostnames

For experiments that need a genuinely multi-machine shape, use a custom network. The commands roughly go: first `docker network create --subnet 192.168.254.0/24 lab` to build a network, then attach the containers to it one by one, with the container name doubling as the hostname. That is how the three-node ZooKeeper cluster was built: three Rocky 9.3 containers on the same network, hostnames zk1/zk2/zk3, and `server.1=zk1:2888:3888` in zoo.cfg written exactly as it would be. Election, cross-node reads and writes (write on zk2, read back from zk1), and stopping a follower and restarting it to watch it rejoin on its own — all verified by real runs.

Topology experiments also hand you an extra kind of insight: **distributed-system startup scripts can lie**. On the three nodes' first startup, the start command printed FAILED TO START, yet the processes were actually up — the start script waits only a few seconds before probing the port, while the new cluster's first election had not finished yet. Trust status, not the start command's closing verdict. Lessons like "don't take a tool's word at face value" are ones you only stumble into by actually bringing up three nodes.

### Two Containers in Tandem: Deliberately Doing It Wrong Is Also an Experiment

The NFS verification used two containers: server at 192.168.254.2, client at 192.168.254.3, with the subnet deliberately planned to match a typical internal network. The flow validation was the standard "export — check the export list — mount — cross-machine read/write". But the real output of this experiment was three error messages — all reproduced **by deliberately doing it wrong**: change the export subnet to the wrong one and have the client mount it, reproducing `access denied by server` reliably; skip resetting rpcbind in a minimal container, reproducing `rpc.statd is not running`; revert the export option to the default root_squash, reproducing Permission denied when the client's root writes.

This is the most underrated move in the container lab. On a real machine, who would be willing to misconfigure permissions or botch a subnet on purpose? In a container, the cost of doing it wrong drops to zero — and the exact wording of a production incident's error message only sticks if you have made that mistake with your own hands. One environmental discovery came along the way: the export directory must live on a filesystem that supports NFS exports; in the container I solved this with tmpfs. Details like this, if left unwritten, are hit all over again by the next person.

### Cross-Version Upgrade Rehearsal: Run Production Moves in a Container First

Hot upgrades — the kind of operation where a mistake means an incident — are the best candidates for rehearsal in a container. I ran the old version (1.28.3) inside an nginx:1.28-alpine container, pushed the new binary built from source (1.30.4, `--with-http_ssl_module`) onto the original path, used USR2 to bring up the new master, WINCH to retire the old workers, and QUIT to send off the old master. After the full signal sequence, I walked it backwards to verify the rollback. This was a genuine cross-version binary replacement, not a same-version copy — identical to a production upgrade down to the letter.

Even more valuable is **reproducing the failure mode**: if the master starts with a relative path, then at USR2 time it execs the new binary with a relative path too, cannot find the file, and fails outright — the old and new masters never coexist, the `.oldbin` pid file never appears, and the service keeps responding normally. Without digging through error.log, you would never even see that the upgrade failed. The fix is to always start with an absolute path and confirm `.oldbin` shows up as expected before sending USR2. Knowledge of "what the error looks like" cannot be learned from books; you have to get it wrong once yourself.

### Source Build Verification: Let the Container Absorb the Compile Pollution

Build-type experiments are a natural fit for containers — the pile of `-dev` dependencies pollutes exactly the thing you throw away afterward, pot and all. The OpenResty troubleshooting session was done inside a debian:12 container: OpenResty 1.27.1.1 paired with OpenSSL 3.3.1, `--with-openssl` pointed at the installed directory, and the make stage failed with `./config: not found`. The root cause (the option wants the source tree, not the install directory; the build rules live in objs/Makefile) and the compile-time verification of both fixes were completed entirely inside the container. Even the fine detail that "when you add only `-L` without an rpath, `openresty -V` prints the mismatched built with X (running with Y)" was nailed down through repeated compiles in the container.

### Cross-Architecture Emulation: Filling the Gap the Official Builds Leave

The last trick is one many people have never used: **architecture emulation**. I had an ARM machine and needed to install Elasticsearch 7.6.1, but the official release for that version shipped only a linux-x86_64 build — the aarch64 download link returned 404 in actual testing, and official ARM builds only began at 7.8. Docker's cross-architecture capability fills this gap exactly: pull the linux/amd64 rockylinux:9 image and run the entire installation process through unchanged.

The emulation also yielded a batch of errors specific to container environments: the minimal image has no `ps` command, so ES's background start failed outright with command not found — fixed by installing procps-ng; ES refuses to run as root, so per the usual practice a dedicated user was created; with the install directory under /root, the es user could not even enter it (700 permissions), so it moved to /opt. None of these pitfalls have anything to do with ES itself — they are all properties of "a stripped-down container environment". Run through them once, and they go into your arsenal.

### Privileged Containers and Loop Devices: When You Need Kernel Facilities

An ordinary container can handle everything above, but one class of experiments touches kernel facilities: mounting filesystems, or creating loop devices to serve as block disks (say, a "real disk" for an NFS export). These needs call for extra container privileges — `--privileged` all-in is the easiest, or grant precisely what is needed with `--cap-add` plus `--device`. The stance here should be explicit: an experimental lab is not a lawless zone. Grant as few privileges as possible, and know exactly what you are running.

## Environment Pitfalls and Countermeasures

Beyond the playbook, four environmental pitfalls kept recurring, and they deserve a section of their own.

**First, 404s from EOL software repositories.** After CentOS 7 reached end of service, its official repositories went offline and yum installs failed outright. The countermeasure: comment out the `mirrorlist` in the repo file, point `baseurl` at `http://vault.centos.org`, run `yum clean all`, then install. Vault occasionally rate-limits the altarch (ARM) paths with 403s — retry later or switch to an x86_64 machine.

**Second, VPN fake-ip polluting container DNS.** When the host runs a proxy in fake-ip mode, external domain lookups inside the container return fake addresses instead of real ones, and pulling images or installing packages fails inexplicably. The countermeasure: pass `--add-host=域名:真实IP` to `docker run` to pin the key domains straight into /etc/hosts, bypassing the polluted resolution chain. This trick really addresses a single class of illness: DNS inside the container depends on the host environment, and from the container's point of view the host's networking software is all "acts of God".

**Third, the log files are symbolic links.** In the official nginx image, access.log and error.log are symbolic links to stdout/stderr — hunt for a log file inside the container and you will come up empty; read logs uniformly through `docker logs`. The first time you hit this, you will suspect the logs are lost, but it is by design: the container world's logging philosophy is "emit to the standard streams", not "land in a file".

**Fourth, no systemd in the container.** Most service documentation assumes systemctl; inside a container that whole apparatus does not exist. The equivalent techniques used in these tests: dhcpd's listening verification was completed with `dhcpd -d -f` in foreground debug mode (noted as an equivalence in the post — never passed off as an actual systemctl run); firewalld depends on systemd, so it simply was not run, and the corresponding step is honestly marked "not actually run"; for components that depend on D-Bus, first bring up the bus manually with `dbus-daemon --system` before talking about services. There is also a broader version of this one: discount whatever "startup scripts say" inside a container — the ZK false FAILED TO START earlier is exactly that.

## The Hygiene Discipline: Discard After Use

A lab stays highly productive over the long run not through technology but through discipline. Four rules, all hardened after stepping in the pits.

**Write the environment down before you touch anything.** Image, version, architecture — the trio goes into the first paragraph of the experiment log. Version anchoring is not fastidiousness: installing DHCP on CentOS 7 and installing DHCP on Rocky 9 are two different posts; writing a tutorial that jumps across versions is planting a landmine.

**Give every step a checkpoint.** After each step, spell out "what you should see when it is done" — `exportfs -v` should list the export rules, `zkServer.sh status` should report a Mode, `nginx.pid.oldbin` should appear. A step without a checkpoint does not count as done. This habit gives every experiment a naturally checkable chain of evidence.

**Label equivalences and non-runs honestly.** What cannot be done in a container, say so plainly. dhcpd's systemctl verification was performed as a foreground-mode equivalent and the post carries a note; firewalld was never run in the container, and the source is stated to be common usage and the package's own service definitions. An equivalence is an equivalence, a non-run is a non-run — the entire value of an experiment log rests on the word "trustworthy", and one act of inflating it voids the whole piece.

**Containers hold no state.** When the experiment ends, the conclusions live in the post and the container itself is deletable. Whenever the thought "I might still need this environment" appears, be on guard: the moment an environment becomes an asset, it starts to decay. Reproduction relies on the environment description in the record, not on the corpse of a container.

## Boundaries: What Does Not Belong in the Lab

To be honest, containers do not cover every experiment. Three scenarios do not work, or work only approximately: first, real multi-machine topology — cross-machine latency, network partitions, machine-level firewalls cannot be emulated by container networking, so you need virtual machines or real ones; second, anything tied to physical hardware, because containers have no real hardware; third, service stacks that need a full systemd session — the missing-init-system weakness has already been covered above. My principle: **for conclusions reached inside a container, re-verify the critical steps in the target environment before migrating to real machines.** The ZooKeeper post states explicitly that "the bare-metal deployment steps are exactly the same as these, with only the node IPs replaced by real addresses" — that sentence is itself a migration-verification promise, not a disclaimer.

## Problems Still Unsolved

Two remain. First, distributed experiments spanning multiple hosts (real network partitions, cross-datacenter topologies) have no solution in this lab yet — however flexible container networking is, it is still a LAN inside one host. Second, the complete scheme for running systemd as the container's init has not been verified — if systemd truly runs, whether components like firewalld work as-is is worth a dedicated round of experiments and its own post.

Back to the opening question: how do you make it smooth, trustworthy, and easy to clean up? Smooth comes from the playbook, drawn on as needed; trustworthy comes from checkpoints and honest labeling; clean comes from discarding after use. Containers press the cost of "verifying an idea" down to something you can do on a whim — that is the lab's real output. Not the six posts, but the conditioned reflex of "next time a new problem shows up, open a container and try it".

## The Series Posts

- [Setting Up a DHCP Server on Rocky Linux 9: Fixed IP Binding by MAC](/2024/10/08/dhcp-csdn142754543/) (Chinese)
- [Deploying a ZooKeeper Cluster: A Three-Node Run on Rocky Linux 9](/2024/05/21/zookeeper-csdn138916515/) (Chinese)
- [Deploying NFS on Rocky Linux 9: Server Exports and Client Mounts](/2023/11/03/nfs-csdn134202503/) (Chinese)
- [Nginx Hot Upgrade: Replacing the Binary Without Downtime](/2024/05/10/nginx-csdn138667908/) (Chinese)
- [OpenResty Build Cannot Find OpenSSL: Root Cause and Three Fixes](/2024/05/10/openresty-openssl-csdn138672069/) (Chinese)
- [Installing Elasticsearch 7.6.1: Manual tar Deployment with a Designated JDK](/2020/03/29/elasticsearch-csdn105170609/) (Chinese)
