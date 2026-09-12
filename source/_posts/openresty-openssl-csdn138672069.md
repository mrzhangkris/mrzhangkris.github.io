---
title: "编译 OpenResty 找不到 OpenSSL：根因与三种解法"
date: 2024-05-10 16:40:43
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1611677806845-363fccca2c51?w=1600&q=80&fm=jpg
---

自己编译 OpenResty、想用系统里已装好的 OpenSSL（比如 `/usr/local/openssl`）时，configure 或 make 阶段经常直接报 OpenSSL 找不到——头文件找不到、`config` 脚本不存在、或者库文件缺失，报错形式不一。这不是 OpenSSL 没装，而是 `--with-openssl` 这个选项的语义和你以为的不一样。以 OpenResty-1.19.9.1（对应 nginx 1.19.9）为例，这篇讲清根因，给出三种解法。

## 报错现象

典型报错形式（以实际环境为准，常见的是这几种之一）：

```text
make[1]: *** /usr/local/openssl/.openssl/include/openssl/ssl.h: No such file or directory
./config: not found          # cd 到目录后找不到源码构建脚本
/usr/local/openssl/lib/libssl.a: No such file or directory
```

触发条件：执行了 `./configure --with-openssl=/usr/local/openssl`，而这个路径指向的是**已安装的 OpenSSL**（标准布局：include/lib 直挂目录下）。

## 根因：--with-openssl 期望的是源码树，不是安装目录

nginx 官方 `configure --help` 对这个选项的措辞值得逐字读：

```text
--with-openssl=DIR    set path to OpenSSL library sources
```

**sources**——它要的是 OpenSSL 的**源码目录**。configure 阶段生成的构建规则（实测 nginx 1.19.9 的 objs/Makefile）是：

![配图1](/images/csdn/figures/openresty-openssl-csdn138672069-1.png)

nginx 会对 `--with-openssl` 指向的目录执行 `cd DIR && ./config && make && make install_sw`——把这个目录当作 OpenSSL 源码树，在里面跑构建，产物装到 `DIR/.openssl` 子目录，然后从 `.openssl/include`、`.openssl/lib` 取头文件和静态库。

所以把**已安装的** OpenSSL 目录传进去，两层错位就出现了：

1. 目录里没有源码构建需要的 `config` 脚本和 Makefile，`cd DIR && ./config` 这一步就断；
2. 即使某些环境跳过了构建步骤，后续拼接的 `$OPENSSL/.openssl/include` 路径也比标准布局多出一层 `.openssl`，头文件自然找不到。

## 解法

### 解法一（推荐）：用 cc-opt/ld-opt 指向已安装的 OpenSSL

已安装的 OpenSSL 本来就该用"编译器/链接器参数"的方式接入，这是 nginx 官方给的标准通道：

```bash
./configure \
  --with-cc-opt="-I/usr/local/openssl/include" \
  --with-ld-opt="-L/usr/local/openssl/lib"
```

OpenResty 同理（它的 configure 透传这两个参数给内部的 nginx 构建）。不用改任何构建脚本，路径语义清清楚楚：头文件在哪、库在哪。

### 解法二：把 OpenSSL 源码目录传给 --with-openssl

如果本意就是"让 nginx 静态编译一份指定版本的 OpenSSL"（生产构建常用，版本可控），那正确用法是下载 OpenSSL **源码包**，解压后把源码目录传进去：

```bash
wget https://www.openssl.org/source/openssl-1.1.1k.tar.gz
tar -zxf openssl-1.1.1k.tar.gz
./configure --with-openssl=/path/to/openssl-1.1.1k
```

nginx 会在源码目录里完成 OpenSSL 的构建（产物在其 `.openssl` 子目录）再链接进 nginx——这正是该选项设计的本意。

### 解法三（原文方案）：手改构建脚本对齐标准布局

历史上还有一种做法：直接改 nginx 构建脚本里的路径拼接。打开（OpenResty 的 nginx 源码在 build 目录里）：

```text
openresty-1.19.9.1/build/nginx-1.19.9/auto/lib/openssl/conf
```

原始内容（实测源码第 39-42 行，与下文一字不差）：

```conf
CORE_INCS="$CORE_INCS $OPENSSL/.openssl/include"
CORE_DEPS="$CORE_DEPS $OPENSSL/.openssl/include/openssl/ssl.h"
CORE_LIBS="$CORE_LIBS $OPENSSL/.openssl/lib/libssl.a"
CORE_LIBS="$CORE_LIBS $OPENSSL/.openssl/lib/libcrypto.a"
```

把四处路径里的 `/.openssl` 去掉，改成标准布局：

```conf
CORE_INCS="$CORE_INCS $OPENSSL/include"
CORE_DEPS="$CORE_DEPS $OPENSSL/include/openssl/ssl.h"
CORE_LIBS="$CORE_LIBS $OPENSSL/lib/libssl.a"
CORE_LIBS="$CORE_LIBS $OPENSSL/lib/libcrypto.a"
```

这四行分别是：往编译参数里加 OpenSSL 头文件目录、声明对 `ssl.h` 的依赖、链接 `libssl.a` 和 `libcrypto.a` 两个静态库。

但要清楚这个方案的局限：它只改了"从哪里取文件"，**没有消除构建规则里 `cd DIR && ./config` 那一步**（在 auto/lib/openssl/make 里），目录里没有 config 脚本时照样断。所以它适用的前提是你传入的目录里同时有可用的 config 脚本（比如完整的 OpenSSL 源码树里已构建过、`.openssl` 被挪平），或者你的 OpenResty 版本构建流程恰好跳过了 config 步骤。**优先用解法一，这个方案当兜底。**

## 64 位系统上还得再看一眼

改完重新编译时，如果报的是 `/usr/local/openssl/lib/libssl.a: No such file or directory`——头文件已经能找到了，卡在库文件上——多半是这台机器把 64 位库装在了 `lib64` 目录。`ls /usr/local/openssl` 看一眼，是 `lib64` 就把脚本/参数里的 `lib` 全部改成 `lib64`：

```conf
CORE_LIBS="$CORE_LIBS $OPENSSL/lib64/libssl.a"
CORE_LIBS="$CORE_LIBS $OPENSSL/lib64/libcrypto.a"
```

解法一的写法对应换成 `--with-ld-opt="-L/usr/local/openssl/lib64"`。

## 验证已修复

重新走完 configure + make 后验证两点：

```bash
# 1. 编译产物存在
ls -lh build/nginx-1.19.9/objs/nginx     # OpenResty 在 build 目录下

# 2. 确认 OpenSSL 已链接进去（版本对得上）
./objs/nginx -V 2>&1 | tr ' ' '\n' | grep -i openssl
```

验证点：`nginx -V` 输出里能看到 OpenSSL 版本信息（如 `built with OpenSSL 1.1.1k`），且 `nginx -t` 能正常执行。

## 事后预防

- 升级 OpenResty 重新编译时，build 目录会被重新解包——解法三的手改会丢失，需要重做；解法一/二只存在于你的构建命令行/脚本里，天然免疫。把编译命令固化成构建脚本（带参数注释），升级时照着跑。
- 编译命令里写清 OpenSSL 的接入方式（源码树还是已安装路径），别让下一个人再猜一遍。

## 注意事项

- 根因是**选项语义误用**：`--with-openssl=DIR` 要的是 OpenSSL 源码目录，不是安装目录。
- 报错里出现 `.openssl` 路径就是它在找源码构建的产物目录——见到这个路径，立刻知道走错了通道。
- `lib` 报错找不到时优先怀疑 `lib64`，`ls $OPENSSL` 看一眼目录就清楚。
- 本文根因部分（--help 措辞、objs/Makefile 构建规则、auto/lib/openssl/conf 第 39-42 行内容）均在 nginx 1.19.9 源码/构建产物中实测核对；报错原文一节为原文场景记录，笔者容器环境（已装系统 OpenSSL 开发包）中 make 走了系统库未复现该报错，实际报错形式以你的环境为准。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。