---
title: "基于AlmaLinux安装OpenResty"
date: 2023-11-02 16:01:33
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/almalinux-openresty-csdn134184189.png
---

本文基于AlmaLinux9.2安装OpenResty-1.21.4.2

### 一、软件下载

-   官方下载

[OpenResty - Download](https://openresty.org/download)

### 二、规划

#### 1、部署步骤

-   1、安装依赖包
-   2、创建并解压OpenResty安装包
-   3、编译安装OpenResty

> 部署出现问题时的相关操作：
>
> 1. 检查是否缺少依赖包
> 2. 检查OpenResty启动端口是否被占用
> 3. 检查ssl版本确认是否是引入问题
> 4. 检查防火墙是否拦截

#### 2、软件信息

| 名称 | 版本 | 安装方式 | 下载地址 |
| --- | --- | --- | --- |
| OpenResty | 1.21.4.2 | 源码手动安装 | https://openresty.org/download/openresty-1.21.4.2.tar.gz |

#### 3、部署规划

-   软件包存放目录：/data/software
-   软件安装目录：/apps/openresty
-   规划使用的配置文件存放目录：/apps/openresty/nginx/conf/online
-   不再使用的配置文件存放目录：/apps/openresty/nginx/conf/offline

### 三、部署

-   1、创建不可登录的用户nginx

```bash
useradd -s /sbin/nologin nginx
```

-   2、安装依赖

```bash
yum install perl pcre-devel zlib-devel openssl-devel gcc curl -y
```

-   3、解压安装包

```bash
cd /data/software/ && tar -zxvf openresty-1.21.4.1.tar.gz &&cd openresty-1.21.4.1
```

-   4、编译安装

```bash
./configure --prefix=/apps/openresty
gmake && gmake install
```

-   5、创建规划信息

```bash
mkdir /apps/openresty/nginx/conf/{online,offline}
cd /apps/openresty/nginx/conf/
cp nginx.conf mime.types online/
chown -R nginx:nginx /apps/openresty/
```

-   6、验证

```bash
curl -I -s -m 10 http://localhost |grep HTTP|awk '{print $2}'
```

### 四、附件

1、常用命令

-   启动

```bash
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf
```

-   重载

```bash
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf -s reload
```

-   立即停止

```bash
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf -s stop
```

-   优雅停止

```bash
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf -s quit
```

---

> 本文迁移自作者 CSDN 博客，2023-11-02 首发于 CSDN，内容保持原貌。
