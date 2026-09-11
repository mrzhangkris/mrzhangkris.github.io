---
title: "CentOS 7 上安装并配置 DNS 服务（BIND）实现正向和反向解析的完整指南"
date: 2024-05-19 09:30:00
categories: [技术]
tags: [网络服务]
copyright_author: 张鹏
cover: /images/csdn/covers/centos-7-dns-bind-csdn138907062.png
---

#### CentOS 7 上安装并配置 DNS 服务（BIND）实现正向和反向解析的完整指南

-   -   [一、软件下载](#_2)
    -   [二、规划](#_10)
    -   [三、部署和配置](#_16)
    -   [四、维护和问题排查](#_125)
    -   [结论](#_130)


本文在 CentOS 7 系统上安装并配置 DNS 服务，包括正向和反向解析的设置。文章内容分四个部分进行：软件下载、规划、部署和配置。

### 一、软件下载

首先，需要安装 BIND 以及相关的工具，这些可以通过 CentOS 的默认仓库获得：

```bash
sudo yum install bind bind-utils
```

> -   **bind**：安装 DNS 服务器的主程序。
> -   **bind-utils**：安装用于 DNS 查询的工具，如 dig 和 nslookup。

### 二、规划

在配置 DNS 之前，进行合理的规划是关键：

-   **决定域名**：例如 example.com。
-   **规划 IP 地址**：为 DNS 服务器和所需主机分配 IP 地址。
-   **设计正向和反向区域**：决定哪些区域文件是必须的。

### 三、部署和配置

下面是详细的部署和配置步骤，包括正向和反向解析的设置。

-   安装 BIND：

```bash
sudo yum install bind bind-utils
```

-   编辑主配置文件 /etc/named.conf：

```bash
sudo vi /etc/named.conf
```

-   在 named.conf 中添加以下内容：

```
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

> **注释**：
>
> -   **listen-on port 53 { any; }**：允许 BIND 在所有接口的 53 端口监听 DNS 请求。
> -   **zone “example.com”**：定义正向解析的区域文件。
> -   **zone “1.168.192.in-addr.arpa”**：定义反向解析的区域文件。

-   创建正向区域文件：

```bash
sudo vi /var/named/forward.example.com
```

-   正向区域文件示例：

```
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

> **注释**：
>
> -   **SOA 记录**指定了授权开始，并列出了主域名服务器和域管理员的电子邮件。
> -   **NS 记录**指定了域名服务器。
> -   **A 记录**将域名映射到 IP 地址。

-   创建反向区域文件：

```bash
sudo vi /var/named/reverse.example.com
```

-   反向区域文件示例：

```
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

> 注释：
>
> -   **PTR 记录**用于反向 DNS 解析，将 IP 地址映射回域名。

-   启动 BIND 服务：确保所有的配置都正确无误后，启动 BIND 服务，让 DNS 开始工作。

```bash
sudo systemctl enable named
sudo systemctl start named
```

-   检查 DNS 服务状态：

```bash
sudo systemctl status named
```

这将显示 BIND 服务的当前状态，确保它是活跃的（running）。

-   测试 DNS 解析：使用 dig 命令来测试正向和反向解析是否配置成功。测试正向解析：

```bash
dig @localhost www.example.com
```

-   这应该返回 www.example.com 对应的 IP 地址 192.168.1.2。测试反向解析：

```bash
dig -x @localhost 192.168.1.2
```

这应该返回 192.168.1.2 对应的域名 www.example.com。

### 四、维护和问题排查

-   **查看日志**： BIND 的日志通常位于 /var/log/messages，这对于诊断问题非常有帮助。
-   **更新区域文件**： 如果需要添加更多的 DNS 记录，编辑相应的区域文件并重启 BIND 服务。
-   **安全配置**： 确保你的 DNS 服务器不对外开放递归查询，以避免成为放大攻击的工具。

### 结论

安装和配置 DNS 服务是构建网络基础设施的重要步骤。通过本文，您应该能够在 CentOS 7 上成功部署 BIND，实现正向和反向 DNS 解析。确保按照上述步骤检查并测试您的配置，以确保 DNS 服务的稳定和安全运行。
希望这篇文章对你有所帮助。如有任何问题或疑问，请在评论区留言。

---

> 本文迁移自作者 CSDN 博客，2024-05-19 首发于 CSDN，内容保持原貌。
