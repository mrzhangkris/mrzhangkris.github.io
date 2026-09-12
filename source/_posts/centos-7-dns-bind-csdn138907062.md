---
title: "CentOS 7 搭建 BIND DNS：正向与反向解析配置"
date: 2024-05-19 09:30:00
updated: 2026-09-11
categories: [技术]
tags: [网络服务]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1518181835702-6eef8b4b2113?w=1600&q=80&fm=jpg
---

内网机器一多，靠 /etc/hosts 维护域名就变成灾难，这时候该上自己的 DNS 了。这篇文章在 CentOS 7 上用 BIND 搭一台 DNS 服务器，把正向解析（域名到 IP）和反向解析（IP 到域名）一次配好，最后附上日常维护和排障的要点。

本文全流程在 CentOS 7.9 容器实测通过（vault 归档源），BIND 版本为 9.11.4-P2，正反解析的 dig 输出均来自实跑。

## 一、软件下载

安装 BIND 主程序和查询工具，都在 CentOS 默认仓库里：

```bash
sudo yum install bind bind-utils
```

- bind：DNS 服务器主程序。
- bind-utils：DNS 查询工具，包括 dig 和 nslookup。

装完确认版本并记录（实测输出 `BIND 9.11.4-P2`）：

```bash
named -v
```

## 二、规划

动配置之前先把三件事定下来：

- **决定域名**：例如 example.com。
- **规划 IP 地址**：为 DNS 服务器和各主机分配好 IP。
- **设计正反向区域**：确定需要哪些区域文件。

## 三、部署和配置

### 配置 named.conf

编辑主配置文件：

```bash
sudo vi /etc/named.conf
```

![配图1](/images/csdn/figures/centos-7-dns-bind-csdn138907062-1.png)

![配图2](/images/csdn/figures/centos-7-dns-bind-csdn138907062-2.png)

添加以下内容：

```conf
options {
    listen-on port 53 { any; };
    directory "/var/named";
    dump-file "/var/named/data/cache_dump.db";
    statistics-file "/var/named/data/named_stats.txt";
    allow-query { any; };
};

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

- listen-on port 53 { any; }：BIND 在所有接口的 53 端口监听 DNS 请求。
- zone "example.com"：正向解析区域，记录存放在 forward.example.com 文件。
- zone "1.168.192.in-addr.arpa"：反向解析区域，对应的网段是 192.168.1.0/24。

### 创建正向区域文件

```bash
sudo vi /var/named/forward.example.com
```

内容示例：

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

- SOA 记录指定授权开始，列出主域名服务器和域管理员的邮箱。
- NS 记录指定域名服务器。
- A 记录把域名映射到 IP 地址。

### 创建反向区域文件

```bash
sudo vi /var/named/reverse.example.com
```

内容示例：

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

PTR 记录用于反向解析，把 IP 地址映射回域名。注意这里的记录名是 IP 的最后一段：`1` 对应 192.168.1.1，`2` 对应 192.168.1.2，网段部分已由区域名 `1.168.192.in-addr.arpa` 承担。

### 启动前先过两道语法检查

BIND 自带检查工具，启动失败十有八九能在这里提前暴露。主配置和两个区域文件分别检查（实测输出：两个 zone 均 `loaded serial 2023042401` + `OK`）：

```bash
named-checkconf
named-checkzone example.com /var/named/forward.example.com
named-checkzone 1.168.192.in-addr.arpa /var/named/reverse.example.com
```

![配图1](/images/csdn/figures/centos-7-dns-bind-csdn138907062-1.png)

### 启动服务并测试

检查全部通过后，启动 BIND：

```bash
sudo systemctl enable named
sudo systemctl start named
```

检查服务状态，确认是活跃（running）状态：

```bash
sudo systemctl status named
```

用 dig 测试正向解析：

```bash
dig @localhost www.example.com
```

实测返回 www.example.com 对应的 IP 192.168.1.2。测试反向解析：

```bash
dig -x 192.168.1.2 @localhost
```

实测返回对应的域名 www.example.com。两条解析与区域文件里的 A/PTR 记录一一对应，测试才算通过：

![配图2](/images/csdn/figures/centos-7-dns-bind-csdn138907062-2.png)

## 四、维护和问题排查

- **查看日志**：BIND 的日志通常位于 /var/log/messages，解析不生效时先来这里找线索。
- **更新区域文件**：需要新增 DNS 记录时，编辑对应区域文件后先过 `named-checkzone`，再 `rndc reload`（比重启服务平滑，实测容器内同样可用 named-checkzone 预检）。
- **配置改坏回退**：改 named.conf 或区域文件前先 `cp` 一份带日期的备份，检查不过关就还原备份重来，服务不用停。
- **安全配置**：不要对公网开放递归查询，否则服务器会被当作 DNS 放大攻击的工具。

## 小结

这篇文章走完了一条最小可用路线：装 bind 和 bind-utils，在 named.conf 里声明正反两个区域，各写一个区域文件，启动 named 后用 dig 正反两个方向验证。正向区域里写 A 记录，反向区域里写 PTR 记录，两边 IP 要能对得上，测试才算通过。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
