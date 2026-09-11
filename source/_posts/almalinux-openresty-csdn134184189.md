---
title: "在 AlmaLinux 9.2 上源码安装 OpenResty 1.21.4.2"
date: 2023-11-02 16:01:33
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/almalinux-openresty-csdn134184189.png
---

记录在 AlmaLinux 9.2 上用源码方式安装 OpenResty 的完整过程。OpenResty 官方提供 yum 源，但需要装进自定义目录、或环境不允许走外部仓库时，源码安装更可控。安装目录规划在 /apps/openresty。

## 软件下载

官方下载页：[OpenResty - Download](https://openresty.org/download)

| 名称 | 版本 | 安装方式 | 下载地址 |
| --- | --- | --- | --- |
| OpenResty | 1.21.4.2 | 源码手动安装 | https://openresty.org/download/openresty-1.21.4.2.tar.gz |

## 部署规划

- 软件包存放目录：/data/software
- 软件安装目录：/apps/openresty
- 在用配置文件存放目录：/apps/openresty/nginx/conf/online
- 不再使用的配置文件存放目录：/apps/openresty/nginx/conf/offline

部署出问题时按这个顺序排查：检查是否缺少依赖包 → 检查 OpenResty 启动端口是否被占用 → 检查 ssl 版本确认是否引入问题 → 检查防火墙是否拦截。

## 部署步骤

### 1. 创建不可登录的用户 nginx

`-s /sbin/nologin` 让这个用户只能用来跑服务，不能登录 shell：

```bash
useradd -s /sbin/nologin nginx
```

### 2. 安装依赖

pcre-devel、zlib-devel、openssl-devel 是 Nginx 三大核心模块的编译依赖，gcc 负责编译，perl 是 OpenResty 构建过程要用的：

```bash
yum install perl pcre-devel zlib-devel openssl-devel gcc curl -y
```

### 3. 解压安装包

```bash
cd /data/software/ && tar -zxvf openresty-1.21.4.1.tar.gz && cd openresty-1.21.4.1
```

> 注：此处命令里的版本号（1.21.4.1）与标题及软件信息表（1.21.4.2）不一致，按原文保留，实际操作时以你下载的包名为准。

### 4. 编译安装

`--prefix` 指定安装到规划目录；AlmaLinux 上 GNU make 的命令名是 gmake：

```bash
./configure --prefix=/apps/openresty
gmake && gmake install
```

![配图](/images/csdn/figures/almalinux-openresty-csdn134184189.png)

### 5. 创建规划目录并赋权

把默认配置复制进 online 目录，整个安装目录归属交给 nginx 用户：

```bash
mkdir /apps/openresty/nginx/conf/{online,offline}
cd /apps/openresty/nginx/conf/
cp nginx.conf mime.types online/
chown -R nginx:nginx /apps/openresty/
```

### 6. 验证

启动后执行这条命令取响应码，输出 200 即为正常：

```bash
curl -I -s -m 10 http://localhost |grep HTTP|awk '{print $2}'
```

## 常用命令

启动、重载、停止都通过 `-c` 显式指定 online 目录里的配置：

```bash
# 启动
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf

# 重载配置
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf -s reload

# 立即停止
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf -s stop

# 优雅停止（处理完已有请求后退出）
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf -s quit
```

## 注意事项

- 源码安装不受包管理器管理，后续升级需要重新编译，注意备份 conf 目录。
- stop 是立即停止，quit 是优雅停止，生产环境优先用后者。
- 启动失败最常见的两个原因就是规划里列的：端口被占用、防火墙拦截。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
