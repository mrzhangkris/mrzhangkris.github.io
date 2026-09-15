---
title: "在 AlmaLinux 9.8 上源码安装 OpenResty 1.31.1.1"
date: 2023-11-02 16:01:33
updated: 2026-09-14
categories: [技术, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1695668548342-c0c1ad479aee?w=1600&q=80&fm=jpg
---

记录在 AlmaLinux 9.8 上用源码方式安装 OpenResty 1.31.1.1 的完整过程。OpenResty 官方提供 dnf/yum 仓库，但当软件要装进自定义目录（本文装到 `/apps/openresty`），或环境不允许接外部仓库时，源码安装更可控——所有产物收在一个前缀目录里，升级、回退、清场都不牵连系统其他部分。

两种方式怎么选：官方仓库装到固定位置 `/usr/local/openresty`，升级走包管理器，适合一般场景；源码方式胜在版本自选、目录自定、不依赖外部仓库可达性，适合有目录规范或内网隔离的生产环境。本文记录的是后者。

本文流程在 AlmaLinux 9.8 容器（最小安装、dnf）完整实跑通过：装依赖、编译、启动返回 200、reload/stop 退出码 0，文中截图全部来自这次实跑，无法容器化的部分会明确标注。

> 注：旧环境（如 AlmaLinux 9.2 装 OpenResty 1.21.4.2）的步骤与此完全一致，把下载地址里的版本号换掉即可；整套流程在 RHEL 9 系（RHEL/Rocky/AlmaLinux 9）通用。

## 前置条件

- AlmaLinux 9.8（或同系 RHEL 9 发行版），root 权限；
- 能访问官方下载页 [OpenResty - Download](https://openresty.org/download)；
- 磁盘：源码包约 6 MB，编译后的源码树实测约 165 MB，加上安装产物，预留 1 GB 足够；
- 最小安装的镜像默认没有 wget，下载用系统自带的 curl 即可（依赖清单里因此也不装 curl，原因见步骤 2）。

| 名称 | 版本 | 安装方式 | 下载地址 |
| --- | --- | --- | --- |
| OpenResty | 1.31.1.1 | 源码手动安装 | https://openresty.org/download/openresty-1.31.1.1.tar.gz |

## 部署规划

- 软件包存放目录：/data/software
- 软件安装目录：/apps/openresty
- 在用配置文件存放目录：/apps/openresty/nginx/conf/online
- 不再使用的配置文件存放目录：/apps/openresty/nginx/conf/offline

online/offline 双目录是给配置变更留的退路：线上只启动 online 里的配置，改动时在 offline 里准备好新版本，验证无误后两边对调、reload 生效，回滚就是把目录名换回来，不用碰二进制。

## 部署步骤

### 1. 创建不可登录的用户 nginx

`-s /sbin/nologin` 让这个用户只能用来跑服务，不能登录 shell：

```bash
useradd -s /sbin/nologin nginx
```

执行后用 `id nginx` 确认，应看到分配好的 uid 和 gid。

### 2. 安装依赖

pcre-devel、zlib-devel、openssl-devel 是 Nginx 三大核心模块的编译依赖，gcc 负责编译，perl 是 OpenResty 构建过程要用的，make 提供 `gmake` 命令：

```bash
dnf install perl pcre-devel zlib-devel openssl-devel gcc make -y
```

el9 上 yum 只是 dnf 的别名，两者等价，本文统一写 dnf。

这里有个最小安装环境必踩的坑：依赖清单带上 `curl` 会让整条 dnf 事务失败——镜像自带 curl-minimal，与完整的 curl 包互斥。实测报错如下：

![配图1](/images/csdn/figures/almalinux-openresty-csdn134184189-1.png)

处理方式：清单里去掉 `curl`。系统自带的 curl-minimal 足够完成下载和验证，完整版 curl 在这套流程里并不需要。`make` 在部分桌面/开发型预装里已经有了，不确定就先 `rpm -q make` 看一眼，装过也不影响重跑。

顺带说明这个坑的来历：curl-minimal 是 RHEL 8 起才引入的精简版 curl，CentOS 7 时代直接 `yum install curl` 不会有任何冲突；这也是老文章照搬到 el9 上第一个翻车的地方。

### 3. 下载并解压安装包

```bash
cd /data/software/ && curl -O https://openresty.org/download/openresty-1.31.1.1.tar.gz
tar -zxvf openresty-1.31.1.1.tar.gz && cd openresty-1.31.1.1
```

下载完 `ls -l` 应看到约 6 MB 的 tar 包；解压后 `ls` 能看到 `configure`、`bundle` 等目录。命令里的版本号以你实际下载的包名为准。

### 4. 编译安装

`--prefix` 指定安装到规划目录：

```bash
./configure --prefix=/apps/openresty
gmake && gmake install
```

configure 阶段做的事是检查编译器与依赖库是否齐全，检查通过后在源码目录下生成 build 目录并生成 Makefile——所以它报错时不用翻日志太远，绝大多数情况就是步骤 2 的某个 devel 包没装上。三步对上才算完成：configure 结尾会直接给出 `gmake`、`gmake install` 的提示；编译无 error 收尾；`ls /apps/openresty` 能看到 `nginx` 目录（连同 luajit、lualib 等）。实测输出节选：

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

启动命令本身没有输出，属正常；随后取响应码，输出 200 即为启动成功。实测在 AlmaLinux 9.8 容器里得到的结果：

![配图2](/images/csdn/figures/almalinux-openresty-csdn134184189-2.png)

顺手看一眼版本，确认装上的就是目标版本：`/apps/openresty/nginx/sbin/nginx -v` 输出 `nginx version: openresty/1.31.1.1`。

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

reload、stop、quit 三个动作本次实测退出码均为 0。

带 `-c` 不是可省略的形式：省略时 nginx 会去读默认路径 `conf/nginx.conf`（也就是安装目录下那份原始配置），而不是 online 里的在用配置——容易出现"改了配置却不生效"或"reload 的是另一份文件"的暗病，操作命令里始终带上 `-c` 可以根治。

## 装坏了怎么办

源码安装的好处是清场干净：所有产物都在 `/apps/openresty` 一个目录里，`rm -rf /apps/openresty` 后从解压那步重新 `gmake install` 即可，不需要动系统其他部分。连用户一起回收的话再执行 `userdel nginx`。

## 常见报错

- **依赖安装报 curl 冲突**：见步骤 2 的实测输出，最小安装环境把 curl 从清单里去掉重跑。
- **`gmake: command not found`**：make 包没装，`dnf install make -y` 后重试。
- **启动即报 `bind() to 0.0.0.0:80 failed (98: Address already in use)`**：80 端口已有进程占用，`ss -lntp | grep :80` 找到占用者停掉或换监听端口（来源：nginx 标准报错）。
- **启动后 curl 不通**：按这个顺序排查——先回看启动命令有没有报错输出 → 检查 80 端口是否被占用（`ss -lntp | grep 80`）→ 检查防火墙是否拦截（`firewall-cmd --list-all`）。

## 注意事项

- 源码安装不受包管理器管理，后续升级需要重新编译，注意备份 conf 目录。
- stop 是立即停止，quit 是优雅停止，生产环境优先用后者；两者发出信号后命令都会立即返回。
- 本文实测环境为 AlmaLinux 9.8 容器（最小安装、dnf、OpenResty 1.31.1.1）；防火墙与 systemd 相关步骤在容器内无法验证，命令为 AlmaLinux 标准用法，来源：官方文档。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
