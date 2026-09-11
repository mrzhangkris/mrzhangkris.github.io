---
title: "Nginx的satisfy指令_ 用途，使用场景及注意事项"
date: 2024-05-25 09:15:00
categories: [技术]
tags: [Nginx]
copyright_author: 张鹏
cover: /images/csdn/covers/nginx-satisfy-csdn139174686.png
---

##### 什么是satisfy指令？

Nginx的satisfy指令用于控制当请求符合多个访问控制条件时，如何对这些条件进行组合判断。具体来说，它决定了是在多个访问控制条件中，只要任意一个条件满足即可还是全部条件都必须满足。

##### 用途与使用场景

satisfy指令主要在有多个访问控制机制（如访问权限限制和身份验证）时使用。典型使用场景如：

1. 仅需满足某个条件：允许用户通过IP白名单或通过基本身份验证中的任何一个来访问资源。
2. 需要同时满足多个条件：需要用户既在IP白名单中，同时也通过基本身份验证。

##### 指令语法

```nginx
satisfy any | all;
```

-   satisfy any 表示只要满足任意一个访问控制条件即可。
-   satisfy all 表示需要满足所有的访问控制条件。

##### 注意事项

-   satisfy指令一般放置在server或location块中。
-   当与deny all或allow all结合使用时，需特别注意条件的组合方式。
-   默认情况下（未指定satisfy指令），Nginx采用all，即所有条件必须满足。

##### 示例与注释

1. 允许通过IP白名单或基本身份验证中的任何一个访问资源
```nginx
server {
  listen 80;
  server_name example.com;

  satisfy any;

  # IP白名单
  allow 192.168.1.0/24;
  deny all;

  # 基本身份验证
  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

在这个配置中，用户只需要满足IP白名单或通过基本身份验证中的任何一个条件即可访问资源。

1. 需要同时满足IP白名单和基本身份验证
```nginx
server {
  listen 80;
  server_name example.com;

  satisfy all;

  # IP白名单
  allow 192.168.1.0/24;
  deny all;

  # 基本身份验证
  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

在这个配置中，用户需同时满足IP白名单和通过基本身份验证才能访问资源。

1. deny all和allow all的情况
```nginx
server {
  listen 80;
  server_name example.com;

  satisfy any;

  deny all;
  allow all;

  # 基本身份验证
  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

在这个配置中，由于satisfy any指令，实际上deny all和allow all会同时存在冲突。Nginx会优先处理allow all，使得所有请求都被允许，而不管其他条件是否满足。所以，deny all在这种情况下不会生效。

1. return指令的情况
```nginx
server {
  listen 80;
  server_name example.com;

  satisfy any;

  deny all;
  allow 192.168.1.0/24;

  # 基本身份验证
  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location /secret {
    return 404;
  }

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

在这个配置中，请求到/secret路径时，即使满足satisfy中的条件（如IP白名单或身份验证），仍然会直接返回404。这是因为return指令直接终止处理并返回指定的HTTP状态码。

#### 总结

Nginx的satisfy指令在处理多重访问控制条件时非常有用，可根据具体需求通过any或all进行配置。理解其与deny all、allow all和return指令的组合效果，对于实现复杂的访问控制策略至关重要。

**希望本文能够帮助您更好地理解和使用Nginx的satisfy指令。**

---

> 本文迁移自作者 CSDN 博客，2024-05-25 首发于 CSDN，内容保持原貌。
