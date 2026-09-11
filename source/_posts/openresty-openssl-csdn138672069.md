---
title: "编译 OpenResty 找不到 OpenSSL 的解决办法"
date: 2024-05-10 16:40:43
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1611677806845-363fccca2c51?w=1600&q=80&fm=jpg
---

自己编译 OpenResty、又想用系统里已装好的 OpenSSL（比如 `/usr/local/openssl`）时，configure 或 make 阶段经常直接报 OpenSSL 找不到。这不是 OpenSSL 没装，而是 Nginx 的构建脚本对目录布局有一个默认假设，和系统 OpenSSL 的实际布局对不上。以 OpenResty-1.19.9.1 为例，手动改一处构建脚本就能解决。

## 原因

编译时用 `./configure --with-openssl=/usr/local/openssl` 指定 OpenSSL 路径后，这个路径会被写进 `OPENSSL` 变量。Nginx 的构建脚本 `auto/lib/openssl/conf` 默认按**源码构建布局**拼路径——假定头文件和库在 `.openssl` 子目录下（`$OPENSSL/.openssl/include`、`$OPENSSL/.openssl/lib`）。但系统 OpenSSL 是标准布局，`include` 和 `lib` 直接挂在 `/usr/local/openssl` 下面，多出来的 `.openssl` 一层自然就找不到文件了。

## 修改方法

打开构建脚本（OpenResty 的 nginx 源码在 build 目录里）：

```
openresty-1.19.9.1/build/nginx-1.19.9/auto/lib/openssl/conf
```

原始内容是：

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

![配图](/images/csdn/figures/openresty-openssl-csdn138672069.png)

这四行分别是：往编译参数里加 OpenSSL 头文件目录、声明对 `ssl.h` 的依赖、链接 `libssl.a` 和 `libcrypto.a` 两个静态库。改完后重新跑 configure 和 make，找不到 OpenSSL 的问题就没了。

## 64 位系统上还得再看一眼

改完重新编译时，如果报的是 `/usr/local/openssl/lib/libssl.a` 没有那个文件或目录——头文件已经能找到了，卡在库文件上——多半是这台机器把 64 位库装在了 `lib64` 目录。把刚才脚本里的 `lib` 全部改成 `lib64` 即可：

```conf
CORE_LIBS="$CORE_LIBS $OPENSSL/lib64/libssl.a"
CORE_LIBS="$CORE_LIBS $OPENSSL/lib64/libcrypto.a"
```

## 小结

- 根因是构建脚本默认的 `.openssl` 目录布局与系统 OpenSSL 的标准布局不一致，去掉 `/.openssl` 即可对齐。
- `lib` 报错找不到时优先怀疑 `lib64`，`ls $OPENSSL` 看一眼目录就清楚。
- 这类改法只影响本次构建；OpenResty 升级重编时，构建脚本会被重新解包，这处修改需要重做一遍。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
