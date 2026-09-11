---
title: "Rewrite 模块的入门指南"
date: 2024-05-21 10:09:19
categories: [技术]
tags: [运维]
copyright_author: 张鹏
cover: /images/csdn/covers/rewrite-csdn139085203.png
---

Nginx 的 rewrite 模块是一个功能强大的工具，可以在处理请求时修改 URL。它通常用于 URL 重写、重定向、条件性处理等。在这篇博客将通过完整的示例和注释详细介绍如何使用 Nginx 的 rewrite 模块及其使用场景和注意事项。

##### 什么是 Nginx Rewrite 模块？

Nginx 的 rewrite 模块允许基于正则表达式匹配和条件来修改请求的 URI。重写可以在请求处理阶段进行，并用于内部重定向或外部重定向到其他 URL。

##### 使用场景

1. 简化用户请求的URL路径
2. 为缺失的文件提供友好的错误页面
3. 重定向旧的URL到新的URL
4. 根据条件重定向用户到不同的网站或内容

##### 示例和注释

以下是一些使用 Nginx rewrite 模块的常见示例和详细注释：

###### 示例1：基本的 URL 重写

将 URL example.com/old-path 重写为 example.com/new-path。

```nginx
server {
  listen 80;
  server_name example.com;

  # 基本的 URL 重写
  rewrite ^/old-path$ /new-path permanent;

  location / {
    try_files $uri $uri/ =404;
  }
}
```

**注释**：

-   rewrite ^/old-path$ /new-path permanent; 这行代码使用正则表达式匹配请求的 URI，然后将其重写为新的路径并返回 301 永久重定向状态码。
-   try\_files $uri $uri/ =404; 确保 Nginx 尝试请求实际文件或文件夹，如果没有找到则返回404错误。

###### 示例2：使用变量重写 URL

用一个变量表示用户请求的语言版本，以实现动态 URL 重写。

```
server {
    listen 80;
    server_name example.com;

    # 动态 URL 重写
    set $lang en;

    if ($http_accept_language ~* "^zh") {
        set $lang zh;
    }

    rewrite ^/docs/(.*)$ /$lang/docs/$1 break;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

**注释**：

-   set $lang en; 设置了一个默认的语言变量，这里默认语言是英语。
-   if ($http\_accept\_language ~\* “^zh”) { set $lang zh; } 通过检查请求头中的语言，自动设置语言变量，如果首选语言是中文则设置为zh。
-   rewrite ^/docs/(.\*)$ /$lang/docs/$1 break; 重写 /docs/ 下的所有路径到相应的语言目录。

###### 示例3：条件重写和防止循环

基于条件进行重写，并防止重写规则自己无限循环。

```
server {
    listen 80;
    server_name example.com;

    # 防止循环重写
    set $done 0;

    if ($uri ~ ^/old-path$) {
        set $done 1;
    }

    if ($done) {
        rewrite ^ /new-path break;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

**注释**：

-   set $done 0; 初始化一个变量，用于标记是否已经完成了重写。
-   if (uri /old−pathuri ~ ^/old-pathuri /old−path) { set $done 1; } 如果 URI 匹配旧路径，设置 $done 为 1。
-   if ($done) { rewrite ^ /new-path break; } 在 $done 被设置的情况下进行重写，并使用 break 终止重写规则，以防止循环。

##### 注意事项

1. **重定向类型**： 有两种主要重定向类型，permanent (301) 和 redirect (302)。使用时根据需要选择适当的重定向类型。
2. **性能问题**：过于复杂的正则表达式可能会影响性能，尽量简化正则表达式并避免不必要的重写。
3. **条件匹配**： 避免在 if 语句中执行复杂逻辑，因为这可能会增加配置的复杂性和调试难度。官方文档建议只在极其需要的情况下使用 if。
4. **测试配置**： 任何更改都应在部署前进行测试，以确保不会导致意外的行为或影响现有流量。

---

> 本文迁移自作者 CSDN 博客，2024-05-21 首发于 CSDN，内容保持原貌。
