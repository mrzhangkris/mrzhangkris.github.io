---
title: "SaltStack学习之安装配置和认证"
date: 2020-05-02 01:11:40
categories: [技术]
tags: [SaltStack]
copyright_author: 张鹏
cover: /images/csdn/covers/saltstack-csdn105885645.png
---

\[toc\]

## 1\. SaltStack简介

       Salt，一种全新的基础设施管理方式，部署轻松，在几分钟内可运行起来，扩展性好，很容易管理上万台服务器，速度够快，服务器之间秒级通讯。

       SaltStack是使用Python语言开发，支持Rest API

-   官方网站：http://www.saltstack.com

-   官方文档：http://docs.saltstack.com

-   中国SaltStack用户组:：http://www.saltstack.cn

## 2\. SaltStack运行方式

1. local
2. Minion/Master
3. Syndic
4. Salt SSH

## 3\. SaltStack三大功能

-   远程执行
-   配置管理
-   云管理

## 4\. SaltStack安装和配置

       [Salt官方存储库](https://repo.saltstack.com/)提供了大多数系统版本的安装方式，我们只需要保证在专用的服务器上安装Salt Master，在Salt管理的每个系统上安装Salt Minion

### 4.1 安装

       Salt时Python编写的，在安装时要注意Python版本和系统版本。不建议使用源码包安装，依赖太多。若服务器网络环境受限，不能连接互联网时，可以在上网机使用[reposync同步镜像源库到本地](https://blog.csdn.net/u010260632/article/details/105444446)，然后[搭建局域网（包括本地）YUM源](https://note.youdao.com/)就可以使用YUM安装Salt了。

       下面代码块中是Salt依赖关系。只要满足依赖关系，Salt就可以在任何类Unix平台上运行。

```
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

       更多的信息可以在[Salt官方安装文档](https://docs.saltstack.com/en/latest/topics/installation/index.html)中找到

#### 4.1.1 环境

| 节点名称 | 主机名 | IP地址 | 系统环境 | Python版本 |
| --- | --- | --- | --- | --- |
| node1 | master-node1 | 192.168.3.100 | CentOS7.7 | Python 2.7.5 |
| node2 | minion-node2 | 192.168.3.101 | CentOS7.7 | Python 2.7.5 |

#### 4.1.2 安装存储库

node1节点和node2节点

```bash
sudo yum install https://repo.saltstack.com/yum/redhat/salt-repo-latest.el7.noarch.rpm
```

#### 4.1.3 安装Slat服务

node1节点

```bash
yum install salt-master salt-minion
```

node2节点

```bash
yum install salt-minion
```

### 4.2 配置

       安装Salt后，配置文件被安装到在/etc/salt中，并以相应的组件/etc/salt/master和/etc/salt/minion命名

#### 4.2.1 master配置

       默认情况下，Salt Master侦听所有接口（0.0.0.0）上的端口4505和4506。要将Salt绑定到特定IP，在Master配置文件(/etc/salt/master)中重新定义“ interface”指令，如下所示：

```
- #interface: 0.0.0.0
+ interface: 192.168.3.100
```

-   4505(publish\_port)端口：salt的消息发布端口
-   4506(ret\_port)端口：salt 客户端与服务端通信的端口

#### 4.2.2 minion配置

       默认情况下，Salt Minion将尝试连接到DNS名称“salt”；如果Minion能够正确解析该名称，则无需进行配置。

       如果DNS名称“salt”不能解析为指向Master的正确位置，在Minion配置文件(/etc/salt/minion)中重新定义“ master”指令，如下所示：

```
- #master: salt
+ master: 192.168.3.100
```

-   master最佳选择是配置成主机名，前提是内网有可以解析主机名的DNS

#### 4.2.3 Minion ID配置

       每个Minion都需要一个唯一的标识符。默认情况下，在第一次启动时，它会选择FQDN作为该标识符。可以通过Minion配置文件(/etc/salt/minion)中的"id"指令覆盖Minion ID。

       Minion ID存在于/etc/salt/minion\_id文件内，该文件是第一次启动时自动生成。

注意：

-   如果id已经配置好不建议更改，因为更改会有很多问题，比如后面认证时所需的公共/私有密钥，就是根据Minion ID生成。如果它发生了改变，Master必须重新接受Minion认证，就像一个新的机器一样。
-   若非要更改Minion ID应先删除minion\_id文件(/etc/salt/minion\_id)，这是因为minion服务启动会先读取minion\_id文件内容，如果不删掉此文件，不管怎么更改配置文件都不会生效

       我选择不配置id指令，使用默认的FQDN作为标识符

```bash
[root@master-node1 ~]# hostname
master-node1
[root@minion-node2 ~]# hostname
minion-node2
```

#### 4.3.4 防火墙配置

```bash
firewall-cmd --permanent --zone=<zone> --add-port=4505-4506/tcp
```

根据你的设置选择所需的区域。进行更改后，重新加载

```bash
firewall-cmd --reload
```

### 4.3 启动

node1节点

```bash
systemctl start salt-master
systemctl start salt-minion
```

node2节点

```bash
systemctl start salt-minion
```

### 4.4 检查

在node1节点上使用tree命令查看/etc/salt/pki目录

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

-   PKI\_DIR是存储pki身份验证密钥的目录。该指令存在于master/minion的配置文件中，默认情况下是/etc/salt/pki/(master或minion)。该目录在第一次启动时会自动生成,里面存放在认证所需的密匙。
-   minions\_pre目录中存放着刚启动的Minion的Minion ID,它们待在被Master接受

## 5\. salt认证

### 5.1 认证原理

1. Minion将自己的公钥发送给Master
2. Master认证后再将自己的公钥发送给Minion端

### 5.1 身份认证

       在初始密钥交换之前，Salt提供了一些命令来验证Salt Master和Salt Minions的身份。验证密钥身份有助于避免无意中连接到错误的Salt主设备，并有助于防止在建立初始连接时潜在的MiTM攻击。

salt master上执行,如下命令打印密匙:

```bash
salt-key -F master
```

salt minion上执行,如下命令打印密匙:

```bash
salt-call --local key.finger
```

将此值(salt-call --local key.finger)与在Salt master上运行命令时显示的值进行比较

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

### 5.3 开始认证

       Salt使用Master和Minion之间的所有通信进行AES加密。这样可以确保发送到Minions的命令不会被篡改，并且Master和Minion之间的通信是通过受信任的，可接受的密钥进行身份验证的。

```bash
[root@master-node1 ~]# salt-key
Accepted Keys:
Denied Keys:
Unaccepted Keys:
master-node1
minion-node2
Rejected Keys:
```

-   Salt-key对用于身份验证的Salt服务器公共密钥执行简单的管理。
-   执行salt-key命令会列出Salt Master已知的键
-   从上面代码块中可以看出Master识别出两个Minion，但是没有一个被Master接受。Minion要想Master接受并控制，需要执行特定的命令

下面代码块中是salt-key常用参数

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

我想控制所有主机，我的命令为:

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

到这里认证已经完成了。根据原理Master和Minion的公匙已经发送给了对方，使用tree看一下PKI\_DIR是否有变化

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

根据上面代码块中的信息可以看出，Master认证了minion，而Minion中多出了master公匙

### 5.4 验证

在Master发送命令来验证Mater与Minion之间的通信

```
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

---

> 本文迁移自作者 CSDN 博客，2020-05-02 首发于 CSDN，内容保持原貌。
