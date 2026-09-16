---
title: "Deploying a ZooKeeper Cluster: A Three-Node Run on Rocky Linux 9 (with CentOS 7 Differences)"
date: 2024-05-21 09:15:02
updated: 2026-09-14
categories: [Tech, ZooKeeper]
tags: [ZooKeeper]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1667984390533-64bdefe719ea?w=1600&q=80&fm=jpg
lang: en
---

ZooKeeper's job in a distributed system is unglamorous, but plenty of components can't run without it: Kafka's metadata, Hadoop's high-availability leader election, configuration coordination for all kinds of middleware. Components like this rarely get touched once they go live, so the first deployment is worth doing right. This post records the full process of standing up a three-node ZooKeeper 3.8.6 cluster on Rocky Linux 9.3 — from installing Java to cross-node read/write verification — with the CentOS 7-era differences collected separately at the end.

> Environment and verification boundary: every command in this post was actually executed and verified in three Rocky Linux 9.3 containers (on a custom docker network, hostnames zk1/zk2/zk3 mutually reachable). Election, reads/writes, and node rejoining are all real measured output. Steps for physical/virtual machine deployments are exactly the same, with node IPs replaced by real addresses.

## System and Environment Preparation

The sample environment is three Rocky Linux 9 machines, referred to below as zk1, zk2, zk3. Before starting, confirm two things: the nodes can reach each other over the network (the 2888/3888 ports later depend on it) and machine time is in sync (Rocky 9 ships chronyd by default; any output from `chronyc sources` will do).

### Installing Java

ZooKeeper is written in Java, so every node needs a Java environment first. ZooKeeper 3.8 supports Java 8/11/17, all present in Rocky 9's AppStream repos; 11 is the safest pick:

```bash
dnf install java-11-openjdk -y
java -version
```

The second command confirms the install; seeing `openjdk version "11.0.x"` in the output means Java is in place.

### Installing ZooKeeper

Download the binary package from the Apache website and extract it to the same directory on every server. On version choice: 3.8.6 is the current stable line, while the older 3.7.x has been removed from the current-versions area of downloads.apache.org (historical versions must be fetched from the archive site):

```bash
# this post's version: 3.8.6 (stable directory on the downloads site)
wget https://downloads.apache.org/zookeeper/stable/apache-zookeeper-3.8.6-bin.tar.gz
tar -xzf apache-zookeeper-3.8.6-bin.tar.gz -C /opt
mv /opt/apache-zookeeper-3.8.6-bin /opt/zookeeper
```

`tar`'s `-C /opt` extracts the archive contents directly under /opt, and the last step renames the long version-numbered directory to the short /opt/zookeeper; all later config and startup commands use this path. Note that you download the `-bin` package (compiled binaries); the identically named package without the suffix is source code, and extracting it yields no bin directory.

![Figure 1](/images/csdn/figures/zookeeper-csdn138916515-1.png)

## Configuring the ZooKeeper Cluster

Each node's configuration is largely identical; only the contents of the myid file differ per node.

### Creating the Config File

ZooKeeper ships with a sample config — copy it and edit:

```bash
cp /opt/zookeeper/conf/zoo_sample.cfg /opt/zookeeper/conf/zoo.cfg
vi /opt/zookeeper/conf/zoo.cfg
```

Write the cluster configuration into zoo.cfg:

```conf
tickTime=2000
initLimit=10
syncLimit=5
dataDir=/var/lib/zookeeper
clientPort=2181
server.1=zk1:2888:3888
server.2=zk2:2888:3888
server.3=zk3:2888:3888
```

What the key parameters mean:

- **tickTime**: the basic unit of time in ZooKeeper, in milliseconds.
- **initLimit**: the maximum time a Follower has to finish syncing with the Leader after starting up; exceeding it is judged abnormal.
- **syncLimit**: the maximum time limit for requests and replies between Leader and Follower.
- **dataDir**: where the in-memory database snapshots and transaction logs live.
- **clientPort**: the port clients connect to.
- **server.X**: X is the node's unique identifier, zkX the corresponding hostname, and the two numbers after it are the inter-node communication port and the election port.

The zoo.cfg files on all three nodes are completely identical — just scp it over.

### Assigning Node IDs

Each node's dataDir needs a file named myid whose content is the number that node corresponds to in zoo.cfg:

```bash
mkdir /var/lib/zookeeper
echo 1 > /var/lib/zookeeper/myid  # on the zk1 node
echo 2 > /var/lib/zookeeper/myid  # on the zk2 node
echo 3 > /var/lib/zookeeper/myid  # on the zk3 node
```

Note that the last three echo commands run on three different machines; the myid content must match the X in each node's zoo.cfg `server.X` one-to-one — get one node wrong and the whole cluster can't match itself up. After deployment you can cross-check with `for h in zk1 zk2 zk3; do ssh $h cat /var/lib/zookeeper/myid; done`.

## Starting and Verifying the Cluster

Start the service on each of the three machines:

```bash
/opt/zookeeper/bin/zkServer.sh start
```

Here's a trap found in real testing: on first startup of the three nodes, the start command may print `Starting zookeeper ... FAILED TO START`, yet the process is actually up — the start script only waits a few seconds before probing the client port, and the new cluster's first election hasn't finished yet. **Trust status, not the start script's closing word**:

```bash
/opt/zookeeper/bin/zkServer.sh status
```

![Figure 2](/images/csdn/figures/zookeeper-csdn138916515-2.png)

Under normal conditions each node reports Mode: leader or Mode: follower; with exactly one Leader and two Followers across the three machines, the cluster is formed. If a node reports it can't reach the cluster, the usual suspects are the myid contents or hostname resolution in the config.

Cluster status can also be queried with the four-letter command srvr: `echo srvr | nc zk1 2181` — the output carries Zookeeper version and Mode lines, convenient for embedding in monitoring scripts.

### Functional Verification: Cross-Node Reads and Writes

A successful election is only step one; data actually syncing is what counts. Write on one node, read from another:

```bash
# create a znode on zk2
echo "create /cfg v1-from-zk2" | /opt/zookeeper/bin/zkCli.sh -server zk2:2181
# read it back on zk1
echo "get /cfg" | /opt/zookeeper/bin/zkCli.sh -server zk1:2181
```

![Figure 3](/images/csdn/figures/zookeeper-csdn138916515-3.png)

zk2 returns `Created /cfg`, zk1 reads back `v1-from-zk2`; the write and the read went through different nodes, so the cluster's replication path is live.

Two details from real testing: first, zkCli's create **does not create parent nodes recursively** — a direct `create /a/b/c` fails with `Node does not exist: /a/b/c`, so build one level at a time; second, a node automatically rejoins the cluster after a restart — in testing, stopping zk3 (in the follower role) and starting it again brought it back online as a follower with no data loss.

## Common Errors

- **start reports FAILED TO START but status is fine**: the first election exceeded the start script's probing window — a false alarm, no action needed; only dig into the next two items if status genuinely reports errors.
- **status keeps reporting Error contacting service**: usually myid mismatched with server.X, hostname resolution failing, or 2888/3888 blocked by a firewall. Check the myid contents on each of the three machines, confirm resolution with `getent hosts zk2`, and open the firewall: `firewall-cmd --add-port={2181,2888,3888}/tcp --permanent && firewall-cmd --reload`.
- **zkCli create reports Node does not exist**: the parent node is missing; create the parent path first.
- **To roll back**: `/opt/zookeeper/bin/zkServer.sh stop` stops the service; deleting the two directories `/opt/zookeeper` and `/var/lib/zookeeper` fully uninstalls it (deleting dataDir deletes the data — proceed carefully).

## Historical Version Differences (CentOS 7)

For longtime readers migrating from a CentOS 7 deployment flow, three things changed:

- **Java package name**: `java-1.8.0-openjdk` becomes `java-11-openjdk`; ZooKeeper 3.7+ supports JDK 11;
- **Version and download**: the 3.7.0 deployed back then has moved to archive.apache.org; new deployments should go straight to the stable line's 3.8.6, with the config format fully compatible;
- **Package manager**: `yum install` maps to `dnf install`, and time sync moved from ntp to chronyd.

zoo.cfg's config syntax, the myid mechanism, and the startup script usage are identical on both systems — all the old playbook carries over.

## Caveats

1. **Security**: ZooKeeper communication in production should run over a trusted network; the built-in ACL feature can protect data, and port 2181 must not be exposed to the public internet.
2. **Persistent storage**: put dataDir on highly reliable storage — both snapshots and transaction logs live there — and splitting logs and snapshots across disks buys another notch of performance.
3. **Backup and recovery**: back up the dataDir directory regularly to guard against data loss from a single point of failure.
4. **Monitoring**: once live, set up monitoring and alerting (the srvr/mntr four-letter commands are enough to pull metrics); don't wait for a client error to discover the cluster has gone abnormal.
5. **Port reachability**: the 2181, 2888, and 3888 ports used in zoo.cfg must be reachable across nodes; if there's a firewall between nodes, remember to open them.

Deploying a three-node ZooKeeper cluster takes barely a dozen lines of configuration; the real effort goes into verification: status confirms the election, cross-node reads/writes confirm replication, restarting one node confirms self-healing. Only after all three pass is the cluster fit to hand over to the components above it.

> This article was rebuilt from the author's CSDN blog posts written between 2020 and 2024, originally published on CSDN.
