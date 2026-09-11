---
title: "CentOS 8 上安装 OpenResty"
date: 2020-04-10 23:09:21
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1564457461758-8ff96e439e83?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

OpenResty 把 Nginx 和一组 Lua 模块打成了一个包，需要定制编译选项时，源码安装是常规路子。这篇记录在 CentOS 8 上源码安装 OpenResty 1.19.3.1 的完整步骤，重点是让编译指向手动编译的 OpenSSL。

## 安装依赖

编译前先装齐工具链和库：

```bash
sudo yum install pcre-devel openssl-devel gcc curl wget tar -y
```

这些依赖包含了编译和运行 OpenResty 所需的基本组件。

## 下载并解压源码

从 [OpenResty 官网下载页](https://openresty.org/en/download.html) 获取最新版本的源码包：

```bash
wget https://openresty.org/download/openresty-1.19.3.1.tar.gz
tar -zxvf openresty-1.19.3.1.tar.gz
cd openresty-1.19.3.1
```

## 配置与编译

在解压出的目录里执行：

![配图](/images/csdn/figures/centos8-openresty-csdn105444421.png)

```bash
./configure --with-http_ssl_module --with-http_v2_module --with-openssl=/usr/local/openssl
make
sudo make install
```

`--with-openssl=/usr/local/openssl` 这个选项让 OpenResty 使用手动编译的 OpenSSL，而不是系统默认的版本。前提是你已经按需手动编译了 OpenSSL，并安装在 /usr/local/openssl 目录下。

## 验证并启动

安装完成后验证一下：

```bash
/usr/local/openresty/nginx/sbin/nginx -v
```

```text
nginx version: openresty/1.19.3.1
```

看到版本号就说明安装成功了。最后启动服务：

```bash
sudo /usr/local/openresty/nginx/sbin/nginx
```

## 注意事项

- 编译时的 --with-openssl 必须指向手动编译的 OpenSSL 路径，否则会用到系统默认的 OpenSSL。
- OpenSSL 本身的编译按 [OpenSSL 官方文档](https://www.openssl.org/source/) 的指导操作，保证安全性和兼容性。
- 源码方式安装的 OpenResty 位于 /usr/local/openresty/，启停都用其自带的 nginx 二进制。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
