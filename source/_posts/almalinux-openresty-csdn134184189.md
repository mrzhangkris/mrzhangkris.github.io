---
title: "在 AlmaLinux 9.2 上源码安装 OpenResty 1.21.4.2"
date: 2023-11-02 16:01:33
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1695668548342-c0c1ad479aee?w=1600&q=80&fm=jpg
---

记录在 AlmaLinux 9.2 上用源码方式安装 OpenResty 1.21.4.2 的完整过程。OpenResty 官方提供 yum 源，但需要装进自定义目录、或环境不允许走外部仓库时，源码安装更可控。照本文走完，你会在 `/apps/openresty` 得到一套可用 `nginx.conf` 启动、`curl` 返回 200 的 OpenResty，并知道装坏了怎么清场重来。

本文流程在 RockyLinux 9 容器（与 AlmaLinux 9.2 同属 RHEL 9 系、共用软件源）完整实跑通过，版本确认与启动验证均来自实跑输出；无法容器化的部分会明确标注。

## 前置条件

- AlmaLinux 9.2（或同系 RHEL 9 发行版），root 权限；
- 能访问官方下载页 [OpenResty - Download](https://openresty.org/download)；
- 磁盘留出源码包与编译产物的空间（源码包约 5 MB，编译过程峰值会大几个数量级）。

| 名称 | 版本 | 安装方式 | 下载地址 |
| --- | --- | --- | --- |
| OpenResty | 1.21.4.2 | 源码手动安装 | https://openresty.org/download/openresty-1.21.4.2.tar.gz |

## 部署规划

- 软件包存放目录：/data/software
- 软件安装目录：/apps/openresty
- 在用配置文件存放目录：/apps/openresty/nginx/conf/online
- 不再使用的配置文件存放目录：/apps/openresty/nginx/conf/offline

## 部署步骤

### 1. 创建不可登录的用户 nginx

`-s /sbin/nologin` 让这个用户只能用来跑服务，不能登录 shell：

```bash
useradd -s /sbin/nologin nginx
```

执行后用 `id nginx` 确认，应看到分配好的 uid 和 gid。

### 2. 安装依赖

pcre-devel、zlib-devel、openssl-devel 是 Nginx 三大核心模块的编译依赖，gcc 负责编译，perl 是 OpenResty 构建过程要用的：

```bash
yum install perl pcre-devel zlib-devel openssl-devel gcc make -y
```

执行完应看到"完毕！"且无冲突报错。实测有一个真实的坑：在最小安装的 RHEL 9 系环境里，依赖清单带上 `curl` 会让整条 yum 事务失败——系统自带 curl-minimal，与完整 curl 包冲突：

![配图1](/images/csdn/figures/almalinux-openresty-csdn134184189-1.png)

处理方式：从清单里去掉 `curl`（系统自带的 curl 命令足够下载和验证用），再单独补装 `make`——它提供 `gmake` 命令，下一步编译要用。注意本机的 AlmaLinux 如果不是最小安装，make 通常已预装，执行一遍 `rpm -q make` 确认即可。

### 3. 下载并解压安装包

```bash
cd /data/software/ && wget https://openresty.org/download/openresty-1.21.4.2.tar.gz
tar -zxvf openresty-1.21.4.2.tar.gz && cd openresty-1.21.4.2
```

解压完 `ls` 应看到 `configure`、`bundle` 等目录。命令里的版本号以你实际下载的包名为准。

### 4. 编译安装

`--prefix` 指定安装到规划目录：

```bash
./configure --prefix=/apps/openresty
gmake && gmake install
```

configure 结束时应看到它给出 `gmake`、`gmake install` 的提示；`gmake` 跑完无 error、`gmake install` 结束后，`ls /apps/openresty` 能看到 `nginx` 目录，三步都对上才算编译安装完成：

![编译安装流程](/images/csdn/figures/almalinux-openresty-csdn134184189.png)

### 5. 创建规划目录并赋权

把默认配置复制进 online 目录，整个安装目录归属交给 nginx 用户：

```bash
mkdir /apps/openresty/nginx/conf/{online,offline}
cd /apps/openresty/nginx/conf/
cp nginx.conf mime.types online/
chown -R nginx:nginx /apps/openresty/
```

验证：`ls /apps/openresty/nginx/conf/online/` 应看到 `nginx.conf` 和 `mime.types` 两个文件。

### 6. 启动与验证

用 `-c` 显式指定 online 目录里的配置启动：

```bash
/apps/openresty/nginx/sbin/nginx -c /apps/openresty/nginx/conf/online/nginx.conf
```

启动后执行这条命令取响应码，输出 200 即为正常。实测在 RockyLinux 9 容器里得到的结果：

![配图2](/images/csdn/figures/almalinux-openresty-csdn134184189-2.png)

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

reload 与 quit 两个动作实测均正常返回。

## 装坏了怎么办

源码安装的好处是清场干净：所有产物都在 `/apps/openresty` 一个目录里，`rm -rf /apps/openresty` 后从解压那步重新 `gmake install` 即可，不需要动系统其他部分。连用户一起回收的话再执行 `userdel nginx`。

## 常见报错

- **依赖安装报 curl 冲突**：见步骤 2 的实测输出，最小安装环境去掉 curl 重装。
- **`gmake: command not found`**：make 包没装，`yum install make -y` 后重试。
- **启动后 curl 不通**：按这个顺序排查——检查是否缺少依赖包 → 检查 OpenResty 启动端口是否被占用（`ss -lntp | grep 80`）→ 检查防火墙是否拦截（`firewall-cmd --list-all`）。

## 注意事项

- 源码安装不受包管理器管理，后续升级需要重新编译，注意备份 conf 目录。
- stop 是立即停止，quit 是优雅停止，生产环境优先用后者。
- 本文实测环境为 RockyLinux 9 容器，与 AlmaLinux 9.2 同属 RHEL 9 系；防火墙与 systemd 相关步骤在容器内无法验证，命令为 AlmaLinux 标准用法，来源：官方文档。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
