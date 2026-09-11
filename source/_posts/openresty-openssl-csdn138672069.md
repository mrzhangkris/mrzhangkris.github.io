---
title: "编译OpenResty遇到找不到OpenSSL的解决办法"
date: 2024-05-10 16:40:43
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/openresty-openssl-csdn138672069.png
---

以OpenResty-1.19.9.1为例
编辑openresty-1.19.9.1/build/nginx-1.19.9/auto/lib/openssl/conf

```conf
CORE_INCS="$CORE_INCS $OPENSSL/.openssl/include"
CORE_DEPS="$CORE_DEPS $OPENSSL/.openssl/include/openssl/ssl.h"
CORE_LIBS="$CORE_LIBS $OPENSSL/.openssl/lib/libssl.a"
CORE_LIBS="$CORE_LIBS $OPENSSL/.openssl/lib/libcrypto.a"
```

将/.openssl去掉

```conf
CORE_INCS="$CORE_INCS $OPENSSL/include"
CORE_DEPS="$CORE_DEPS $OPENSSL/include/openssl/ssl.h"
CORE_LIBS="$CORE_LIBS $OPENSSL/lib/libssl.a"
CORE_LIBS="$CORE_LIBS $OPENSSL/lib/libcrypto.a"
```

> 重新编译提示usr/local/openssl/lib/libssl.a：没有那个文件或目录错误，需要将上面文件中的lib改为lib64

---

> 本文迁移自作者 CSDN 博客，2024-05-10 首发于 CSDN，内容保持原貌。
