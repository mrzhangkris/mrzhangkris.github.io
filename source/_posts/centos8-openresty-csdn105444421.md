---
title: "CentOS8上安装OpenResty安装"
date: 2020-04-10 23:09:21
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/centos8-openresty-csdn105444421.png
---

#### 文章目录

-   [步骤1：安装依赖项](#1_3)
-   [步骤2：下载和解压OpenResty](#2OpenResty_9)
-   [步骤3：配置和编译](#3_16)
-   [步骤4：验证安装](#4_24)
-   [步骤5：启动OpenResty](#5OpenResty_34)
-   [注意事项](#_39)
-   [结论](#_43)

OpenResty是一个基于Nginx的高性能Web平台，它通过将Nginx与一组强大的Lua模块打包在一起，提供了更加灵活和强大的功能。本文将指导您在CentOS 8上安装OpenResty，并包括手动编译的OpenSSL的注意事项。

## 步骤1：安装依赖项

在开始安装OpenResty之前，需要安装一些必要的依赖项。在终端中执行以下命令：

```bash
sudo yum install pcre-devel openssl-devel gcc curl wget tar -y
```

这些依赖项包括了编译和运行OpenResty所需的基本组件。

## 步骤2：下载和解压OpenResty

从[OpenResty官网下载](https://openresty.org/en/download.html)最新版本的OpenResty源码包。

```
wget https://openresty.org/download/openresty-1.19.3.1.tar.gz
tar -zxvf openresty-1.19.3.1.tar.gz
cd openresty-1.19.3.1
```

## 步骤3：配置和编译

在解压后的OpenResty目录中，执行以下命令配置和编译OpenResty：

```
./configure --with-http_ssl_module --with-http_v2_module --with-openssl=/usr/local/openssl
make
sudo make install
```

这里的–with-openssl=/usr/local/openssl选项告诉OpenResty使用手动编译的OpenSSL而不是系统默认的OpenSSL。确保您已经按照需要手动编译了OpenSSL，并将其安装在/usr/local/openssl目录下。

## 步骤4：验证安装

安装完成后，验证OpenResty是否成功安装。执行以下命令：

```
/usr/local/openresty/nginx/sbin/nginx -v
```

应该看到类似以下输出：

```
nginx version: openresty/1.19.3.1
```

这表明OpenResty已成功安装。

## 步骤5：启动OpenResty

最后，您可以启动OpenResty服务。执行以下命令：

```
sudo /usr/local/openresty/nginx/sbin/nginx
```

## 注意事项

-   确保在编译OpenResty时使用了正确的–with-openssl选项，并指定了手动编译的OpenSSL路径。
-   在配置OpenSSL时，务必按照[OpenSSL官方文档](https://www.openssl.org/source/)的指导进行操作，以确保安全性和兼容性。

## 结论

OpenResty是一个功能强大且灵活的Web平台，通过结合Nginx和Lua脚本，为开发人员提供了丰富的功能和扩展性。在CentOS 8上安装OpenResty需要一些步骤，包括安装依赖项、下载和解压源码包、配置和编译、验证安装和启动服务。同时，在安装过程中要注意指定手动编译的OpenSSL路径，以确保OpenResty正常工作。

**希望这篇博客能够帮助您顺利在CentOS 8上安装和使用OpenResty。**

---

> 本文迁移自作者 CSDN 博客，2020-04-10 首发于 CSDN，内容保持原貌。
