---
title: "用 Nginx sub_filter 在响应返回前替换内容"
date: 2024-05-28 09:23:07
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1483058712412-4245e9b90334?w=1600&q=80&fm=jpg
---

后端代码不方便改，但响应里的某个域名、某个敏感词必须换掉——这种活最适合交给 Nginx 的 sub 模块（`ngx_http_sub_module`）：在响应返回给客户端之前，把内容里的指定字符串替换掉。反代场景下做域名迁移、链接改写、敏感词过滤，都不用碰后端一行代码。

## 能做什么

- **动态修改响应内容**：替换响应中的特定字符串，比如敏感词、旧的资源地址，后端服务完全不用改。
- **链接改写**：响应里出现的旧 URL 字符串（如 `http://old.example.com`）统一换成新地址，实现伪静态或迁移期的平滑过渡。

注意它做的是**字面字符串替换**，不是正则匹配。需要正则替换的复杂场景，一般要借助第三方模块（比如 substitutions4nginx 的 `subs_filter`）或者在应用层处理。

## 配置示例

```nginx
http {
  server {
    listen 80;
    server_name example.com;

    location / {
      sub_filter 'old_string' 'new_string';
      sub_filter_once off;
      sub_filter_types *;
    }

    location ~ \.php$ {
      # PHP 常规配置（此处省略）
    }
  }
}
```

三个指令各管一件事：

- `sub_filter 'old_string' 'new_string';`：定义一条替换规则，把响应里的 `old_string` 换成 `new_string`。
- `sub_filter_once off;`：替换响应中**所有**出现的位置；默认是 `on`，只替换第一处。
- `sub_filter_types *;`：对所有 MIME 类型的响应做替换。默认只处理 `text/html`，要替换 CSS、JSON 之类的内容就得把类型加上，`*` 表示不区分类型。

sub_filter 只对显式配置了它的 location 生效，上面示例里 PHP 的 location 就不受影响。

![配图](/images/csdn/figures/nginx-sub-csdn139253978.png)

## 注意事项

- **性能开销**：替换操作发生在响应体流经 Nginx 的时候，大响应体加高并发下会有可感知的开销，上生产前先做一轮压测。
- **和压缩冲突**：sub_filter 无法处理已压缩的响应。反代场景记得加 `proxy_set_header Accept-Encoding "";` 让上游返回未压缩内容，替换才有机会生效。
- **缓存语义**：替换发生在内容返回阶段，缓存里存的是替换前的原始内容；启用 sub_filter 后响应会失去 `Content-Length`（改为分块传输），有些依赖内容长度的客户端逻辑会受影响。
- **多条规则**：同一个配置层写多条 `sub_filter` 需要 Nginx 1.9.4 及以上版本，旧版本只能一条。
- **别用来做强安全过滤**：字符串替换挡不住变形的注入内容，安全过滤要有专门的机制，sub_filter 只适合确定性的文本替换。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
