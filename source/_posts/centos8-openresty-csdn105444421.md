---
title: "源码安装 OpenResty 1.19.3.1（链接自编 OpenSSL）：RHEL 8/9 适用，Rocky 9 实测"
date: 2020-04-10 23:09:21
updated: 2026-09-14
categories: [技术, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1564457461758-8ff96e439e83?w=1600&q=80&fm=jpg
---

OpenResty 把 Nginx 和一组 Lua 模块打成了一个包，需要定制编译选项时，源码安装是常规路子。这篇记录在 RHEL 系（CentOS 8 / Rocky 9 命令一致）上源码安装 OpenResty 1.19.3.1 的完整步骤，重点是 `--with-openssl` 的正确指向——它要的是 OpenSSL 的**源码目录**，不是安装目录，这点搞错编译直接失败。全文在 Rocky Linux 9.3 容器里实跑复现：configure、make、安装、启动到 curl 200。

## 前置条件

- RHEL 8/9 系服务器，root 或 sudo 权限（本文实测环境为 rockylinux:9.3 容器）。
- 编译工具链：gcc、make、perl（OpenResty 的 configure 脚本靠 perl 驱动）。
- 库：pcre-devel（URL 重写模块依赖）、zlib-devel（gzip 压缩）。
- 一份 OpenSSL 源码包（本文以 openssl-3.1.4 为例），解压后放在任意路径，比如 /usr/local/src/openssl-3.1.4。

## 步骤一：安装依赖

```bash
dnf install gcc make perl pcre-devel zlib-devel wget -y
```

验证点：`rpm -q pcre-devel zlib-devel` 两个包都在。缺了 pcre-devel，configure 会在检查 PCRE 库时退出——实测报错见"常见报错"配图。

## 步骤二：下载并解压源码

从 [OpenResty 官网下载页](https://openresty.org/en/download.html) 获取源码包：

```bash
wget https://openresty.org/download/openresty-1.19.3.1.tar.gz
tar -zxvf openresty-1.19.3.1.tar.gz
tar -zxvf openssl-3.1.4.tar.gz
cd openresty-1.19.3.1
```

## 步骤三：配置与编译

```bash
./configure --with-http_ssl_module --with-http_v2_module \
  --with-openssl=/usr/local/src/openssl-3.1.4
make -j$(nproc)
make install
```

`--with-openssl` 的语义要特别说明：nginx（含 OpenResty）会在构建时**把指定目录当作 OpenSSL 源码树就地编译并静态链接**，所以它指向的必须是解压出来的源码目录，而不是 `make install` 之后的安装目录。如果安装目录里恰好没有 Makefile，构建到 OpenSSL 这一步就会失败。习惯把 OpenSSL 源码解压到 /usr/local/openssl 就地编译的话，路径才会"碰巧"一致。

验证点：configure 跑完没有 ERROR，尾部给出构建提示。实测（Rocky 9.3 容器）尾部输出长这样：

![配图1](/images/csdn/figures/centos8-openresty-csdn105444421-1.png)

make 结束无报错退出，OpenResty 会依次构建 LuaJIT、nginx 和全部捆绑模块，耗时几分钟。

## 步骤四：验证并启动

安装位置固定在 /usr/local/openresty/。验证版本，然后启动并确认服务真的在响应：

```bash
/usr/local/openresty/nginx/sbin/nginx -v
/usr/local/openresty/nginx/sbin/nginx
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/
```

![配图2](/images/csdn/figures/centos8-openresty-csdn105444421-2.png)

两个验证点：`nginx -v` 输出的版本号带 openresty/ 前缀，说明用的是 OpenResty 的 nginx 而非系统里可能存在的另一个 nginx；curl 拿到 200 说明服务真的起来了，不止是装上了。

## 常见报错

**PCRE 缺失**：没装 pcre-devel 时，configure 在检查 PCRE 库的环节连续三个 `not found` 后退出（exit 1），外层脚本再报 `the HTTP rewrite module requires the PCRE library.`。实测输出：

![配图3](/images/csdn/figures/centos8-openresty-csdn105444421-3.png)

装上 pcre-devel 重跑 configure 即可，不用清缓存。

**OpenSSL 路径写错**：`--with-openssl` 指向安装目录而非源码目录时，构建在 OpenSSL 环节失败（原文实录）。解决：改指向源码目录重新 configure、make。

## 卸载与回退

源码安装的卸载很简单：停掉进程后 `rm -rf /usr/local/openresty/` 即可，不污染系统目录。这也是编译安装相对 rpm 安装的好处之一——整个安装都在一个前缀目录里，回退干净。

## 注意事项

- `--with-openssl` 必须指向 OpenSSL 源码树，构建时静态编进 nginx；指向安装目录是这类文章里最常见的翻车点。
- OpenSSL 本身的编译按 [OpenSSL 官方文档](https://www.openssl.org/source/) 操作，安全补丁版本的选择以生产要求为准；源码下载建议核对官网的 sha256。
- 源码安装的 OpenResty 全部位于 /usr/local/openresty/，启停都用其自带的 `nginx` 二进制（`/usr/local/openresty/nginx/sbin/nginx -s stop|reload`），不要混用系统 nginx。
- 生产环境建议配 systemd unit 托管 OpenResty 进程，避免手工启停。
- 1.19.3.1 是 2020 年的版本线，新项目直接用 OpenResty 官方 yum 源或更新的源码版；本文流程的价值在于"从源码定制编译"这个动作本身，版本按需替换。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
