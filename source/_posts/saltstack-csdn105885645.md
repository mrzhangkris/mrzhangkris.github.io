---
title: "SaltStack 安装、配置与 Minion 认证（CentOS 7）"
date: 2020-05-02 01:11:40
updated: 2026-09-11
categories: [技术]
tags: [SaltStack]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1509803874385-db7c23652552?w=1600&q=80&fm=jpg
---

要在一批机器上统一执行命令、下发配置，一台台 SSH 上去敲显然不现实。SaltStack 就是为这个场景准备的：Master/Minion 架构下，控制端可以秒级触达成百上千台机器。这篇记录在两台 CentOS 7.7 上从零搭一套 SaltStack 的完整过程——装 Master 和 Minion、改配置、放行防火墙，最后完成密钥认证并用 `salt` 命令验证通信。

> 环境与验证边界：CentOS 7 已 EOL，本文流程与图示输出为原文 CentOS 7.7 双机实战记录，未在容器复跑（密钥认证环节依赖两台独立主机与真实网络）。RHEL 8/9 上安装步骤一致：先启用 EPEL 仓库，再 `dnf install salt-master salt-minion`（实测 Rocky 9 的 EPEL 提供 Salt 3005.4，Python 3 运行时）。

## SaltStack 是什么

Salt 是一种基础设施管理方式，部署轻松，几分钟内就能跑起来；扩展性好，很容易管理上万台服务器，服务器之间是秒级通讯。SaltStack 使用 Python 语言开发，支持 Rest API。

- 官方网站：http://www.saltstack.com
- 官方文档：http://docs.saltstack.com
- 中国 SaltStack 用户组：http://www.saltstack.cn

Salt 有四种运行方式：

1. local
2. Minion/Master
3. Syndic
4. Salt SSH

三大核心功能：远程执行、配置管理、云管理。

## 安装

[Salt 官方存储库](https://repo.saltstack.com/)提供了大多数系统版本的安装方式。只需要保证在专用的服务器上安装 Salt Master，在 Salt 管理的每个系统上安装 Salt Minion。

Salt 是 Python 编写的，安装时要注意 Python 版本和系统版本。不建议使用源码包安装，依赖太多。若服务器网络环境受限、不能连接互联网，可以在上网机使用 [reposync 同步镜像源库到本地](https://blog.csdn.net/u010260632/article/details/105444446)，然后搭建局域网（包括本地）YUM 源，就可以用 YUM 安装 Salt 了。

下面是 Salt 的依赖关系，只要满足这些依赖，Salt 就可以在任何类 Unix 平台上运行：

```text
- Python - Python2 >= 2.7, Python3 >= 3.4
- msgpack-python - High-performance message interchange format
- YAML - Python YAML bindings
- Jinja2 - parsing Salt States (configurable in the master settings)
- MarkupSafe - Implements a XML/HTML/XHTML Markup safe string for Python
- apache-libcloud - Python lib for interacting with many of the popular cloud service providers using a unified API
- Requests - HTTP library
- Tornado - Web framework and asynchronous networking library
- futures - Python2 only dependency. Backport of the concurrent.futures package from Python 3.2
- ZeroMQ:
     - ZeroMQ >= 3.2.0
     - pyzmq >= 2.2.0 - ZeroMQ Python bindings
     - PyCrypto - The Python cryptography toolkit
```

更多的信息可以在 [Salt 官方安装文档](https://docs.saltstack.com/en/latest/topics/installation/index.html)中找到。

### 环境准备

本文用的两台节点：

| 节点名称 | 主机名 | IP地址 | 系统环境 | Python版本 |
| --- | --- | --- | --- | --- |
| node1 | master-node1 | 192.168.3.100 | CentOS7.7 | Python 2.7.5 |
| node2 | minion-node2 | 192.168.3.101 | CentOS7.7 | Python 2.7.5 |

### 安装存储库

node1 节点和 node2 节点都执行：

```bash
sudo yum install https://repo.saltstack.com/yum/redhat/salt-repo-latest.el7.noarch.rpm
```

### 安装 Salt 服务

node1 节点（Master + Minion 都装，方便自己也被管理）：

```bash
yum install salt-master salt-minion
```

node2 节点只装 Minion：

```bash
yum install salt-minion
```

## 配置

安装 Salt 后，配置文件被安装到 `/etc/salt` 中，并以相应的组件命名：`/etc/salt/master` 和 `/etc/salt/minion`。

### master 配置

默认情况下，Salt Master 侦听所有接口（0.0.0.0）上的端口 4505 和 4506。要把 Salt 绑定到特定 IP，在 Master 配置文件 `/etc/salt/master` 中重新定义 `interface` 指令：

```diff
- #interface: 0.0.0.0
+ interface: 192.168.3.100
```

两个端口的分工：

- 4505（publish_port）：salt 的消息发布端口
- 4506（ret_port）：salt 客户端与服务端通信的端口

### minion 配置

默认情况下，Salt Minion 会尝试连接 DNS 名称 `salt`；如果 Minion 能正确解析该名称，则无需进行配置。

如果 DNS 名称 `salt` 不能解析到指向 Master 的正确位置，就在 Minion 配置文件 `/etc/salt/minion` 中重新定义 `master` 指令：

```diff
- #master: salt
+ master: 192.168.3.100
```

master 的最佳选择是配置成主机名，前提是内网有可以解析主机名的 DNS。

### Minion ID 配置

每个 Minion 都需要一个唯一的标识符。默认在第一次启动时，它会选择 FQDN 作为该标识符。也可以通过 Minion 配置文件 `/etc/salt/minion` 中的 `id` 指令覆盖 Minion ID。

Minion ID 存在于 `/etc/salt/minion_id` 文件内，该文件在第一次启动时自动生成。

注意：

- 如果 id 已经配置好，不建议更改。因为后面认证所需的公共/私有密钥就是根据 Minion ID 生成的，ID 变了 Master 必须重新接受 Minion 认证，就像一台新机器一样。
- 若非要更改 Minion ID，应先删除 minion_id 文件（`/etc/salt/minion_id`）。这是因为 minion 服务启动会先读取 minion_id 文件内容，不删掉此文件的话，不管怎么改配置文件都不会生效。

我选择不配置 id 指令，直接用默认的 FQDN 作为标识符：

```bash
[root@master-node1 ~]# hostname
master-node1
[root@minion-node2 ~]# hostname
minion-node2
```

### 防火墙配置

放行 4505-4506 端口：

```bash
firewall-cmd --permanent --zone=<zone> --add-port=4505-4506/tcp
```

根据你的设置选择所需的区域。进行更改后，重新加载：

```bash
firewall-cmd --reload
```

## 启动与首次检查

node1 节点：

```bash
systemctl start salt-master
systemctl start salt-minion
```

node2 节点：

```bash
systemctl start salt-minion
```

在 node1 节点上用 tree 命令查看 `/etc/salt/pki` 目录：

```bash
[root@master-node1 ~]# tree /etc/salt/pki/
/etc/salt/pki/
├── master
│   ├── master.pem
│   ├── master.pub
│   ├── minions
│   ├── minions_autosign
│   ├── minions_denied
│   ├── minions_pre
│   │   ├── master-node1
│   │   └── minion-node2
│   └── minions_rejected
└── minion
    ├── minion.pem
    └── minion.pub

7 directories, 6 files
```

PKI_DIR 是存储 pki 身份验证密钥的目录，该指令存在于 master/minion 的配置文件中，默认是 `/etc/salt/pki/`（master 或 minion）。这个目录在第一次启动时自动生成，里面存放认证所需的密钥。

`minions_pre` 目录中存放着刚启动的 Minion 的 Minion ID，它们在等待被 Master 接受。

## salt 认证

### 认证原理

1. Minion 将自己的公钥发送给 Master
2. Master 认证后再将自己的公钥发送给 Minion 端

### 验证密钥身份

在初始密钥交换之前，Salt 提供了一些命令来验证 Salt Master 和 Salt Minions 的身份。验证密钥身份有助于避免无意中连接到错误的 Salt 主设备，并有助于防止在建立初始连接时潜在的 MiTM 攻击。

salt master 上执行，打印密钥：

```bash
salt-key -F master
```

salt minion 上执行，打印密钥：

```bash
salt-call --local key.finger
```

将 `salt-call --local key.finger` 的值与在 Salt master 上运行 `salt-key -F master` 时显示的对应 Minion 的值进行比较：

```bash
[root@master-node1 ~]# salt-key -F master
Local Keys:
master.pem:  2b:01:e4:fd:96:d0:56:19:e5:60:8d:e6:77:a8:1a:02:d9:ac:f3:c5:6b:63:4d:5c:3e:0a:c2:47:bd:87:ec:28
master.pub:  a8:44:84:a7:af:43:75:4f:c1:a9:3c:95:29:f5:fc:fb:1b:00:a3:5d:30:73:81:3a:46:4a:1f:62:45:8a:48:73
Unaccepted Keys:
master-node1:  67:b9:73:8e:9a:cc:7c:26:51:a7:6c:24:bc:b3:90:21:05:c5:2f:2c:57:2a:9b:72:73:b0:5e:a0:e3:81:92:38
minion-node2:  ae:99:70:63:5c:e2:85:5e:b8:c1:a6:07:a7:8f:97:bb:e1:43:2e:67:b1:99:5e:8a:56:9c:b9:54:aa:a4:68:cd
[root@master-node1 ~]# salt-call --local key.finger
local:
    67:b9:73:8e:9a:cc:7c:26:51:a7:6c:24:bc:b3:90:21:05:c5:2f:2c:57:2a:9b:72:73:b0:5e:a0:e3:81:92:38
[root@minion-node2 ~]# salt-call --local key.finger
local:
    ae:99:70:63:5c:e2:85:5e:b8:c1:a6:07:a7:8f:97:bb:e1:43:2e:67:b1:99:5e:8a:56:9c:b9:54:aa:a4:68:cd
```

两边的指纹对得上，说明连接的确实是预期的那台机器。


### 开始认证

Salt 对 Master 和 Minion 之间的所有通信使用 AES 加密，这样可以确保发送到 Minions 的命令不会被篡改，并且 Master 和 Minion 之间的通信是通过受信任的、可接受的密钥进行身份验证的。

直接执行 `salt-key`，可以看到当前所有密钥的状态：

```bash
[root@master-node1 ~]# salt-key
Accepted Keys:
Denied Keys:
Unaccepted Keys:
master-node1
minion-node2
Rejected Keys:
```

- `salt-key` 对用于身份验证的 Salt 服务器公共密钥执行简单的管理，执行后会列出 Salt Master 已知的键。
- 从上面的输出可以看出 Master 识别出了两个 Minion，但还没有一个被接受。Minion 想被 Master 接受并控制，需要执行特定的命令。

`salt-key` 常用参数：

```bash
[root@salt-master ~]# salt-key
Accepted Keys:        #已经接受的key
Denied Keys:          #拒绝的key
Unaccepted Keys:      #未加入的key
Rejected Keys:        #吊销的key
#常用参数
-L  # 查看KEY状态
-a  # 认证指定的key
-A  # 允许所有
-d  # 删除指定的key
-D  # 删除所有
-r  # 注销掉指定key（该状态为未被认证）
```

我想控制所有主机，命令为：

```bash
[root@master-node1 ~]# salt-key -A
The following keys are going to be accepted:
Unaccepted Keys:
master-node1
minion-node2
Proceed? [n/Y] y
Key for minion master-node1 accepted.
Key for minion minion-node2 accepted.
```

到这里认证已经完成了。根据原理，Master 和 Minion 的公钥已经发送给了对方。用 tree 看一下 PKI_DIR 是否有变化：

```bash
[root@master-node1 ~]# tree /etc/salt/pki/
/etc/salt/pki/
├── master
│   ├── master.pem
│   ├── master.pub
│   ├── minions
│   │   ├── master-node1
│   │   └── minion-node2
│   ├── minions_autosign
│   ├── minions_denied
│   ├── minions_pre
│   └── minions_rejected
└── minion
    ├── minion_master.pub
    ├── minion.pem
    └── minion.pub

7 directories, 7 files

[root@minion-node2 ~]# tree /etc/salt/pki/
/etc/salt/pki/
├── master
└── minion
    ├── minion_master.pub
    ├── minion.pem
    └── minion.pub

2 directories, 3 files
```

从输出可以看出：Master 侧两个 Minion 的公钥已从 `minions_pre` 移入 `minions` 目录，而 Minion 侧多出了 master 公钥（`minion_master.pub`）。

### 验证通信

在 Master 上发送命令，验证 Master 与 Minion 之间的通信是否正常：

```text
salt minion_id cmd.run "w"     # 单个Minion执行w命令
salt "*" cmd.run "w"           # 所有Minion执行w命令
```

```bash
[root@master-node1 ~]# salt master-node1 cmd.run "w"
master-node1:
     00:49:54 up 13:04,  1 user,  load average: 0.00, 0.02, 0.05
    USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT
    root     pts/1    192.168.3.2      23:10    2.00s  0.50s  0.42s /usr/bin/python /usr/bin/salt master-node1 cmd.run w
[root@master-node1 ~]# salt minion-node2 cmd.run "w"
minion-node2:
     08:50:05 up  1:26,  1 user,  load average: 0.00, 0.01, 0.05
    USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT
    root     pts/0    192.168.3.2      07:23   11:09   0.06s  0.06s -bash
[root@master-node1 ~]# salt "*" cmd.run "w"
minion-node2:
     08:50:14 up  1:26,  1 user,  load average: 0.00, 0.01, 0.05
    USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT
    root     pts/0    192.168.3.2      07:23   11:18   0.06s  0.06s -bash
master-node1:
     00:50:14 up 13:05,  1 user,  load average: 0.15, 0.05, 0.06
    USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT
    root     pts/1    192.168.3.2      23:10    6.00s  0.51s  0.43s /usr/bin/python /usr/bin/salt * cmd.run w
```

`w` 命令的输出正常返回，说明 Master 与 Minion 的加密通道已经建立，可以开始正常使用了。

## 注意事项

- Minion ID 一旦认证就不要随意更改：密钥是根据 ID 生成的，ID 变了 Master 要像对待新机器一样重新接受认证；真要改，先删除 `/etc/salt/minion_id`，否则改配置不生效。
- 防火墙记得放行 4505-4506/tcp 并执行 `firewall-cmd --reload`，否则 Minion 连不上 Master，会一直卡在 Unaccepted 状态。
- 正式认证前先用 `salt-key -F master` 和 `salt-call --local key.finger` 比对指纹，防止连错 Master 或遭到 MiTM 攻击。
- 记住两个端口的分工：4505 是消息发布端口，4506 是客户端与服务端通信的返回端口。
- `salt-key -a` 只认证指定的 key，`-A` 一口气接受全部；生产环境机器多时建议逐一确认指纹后再 `-a`，避免误收陌生机器。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
