---
title: "用 Nginx sub_filter 在响应返回前替换内容"
date: 2024-05-28 09:23:07
updated: 2026-09-14
categories: [技术, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1483058712412-4245e9b90334?w=1600&q=80&fm=jpg
---

后端代码不方便改，但响应里的某个域名、某个敏感词必须换掉——这种活最适合交给 Nginx 的 sub 模块（`ngx_http_sub_module`）：在响应返回给客户端之前，把内容里的指定字符串替换掉。反代场景下做域名迁移、链接改写、敏感词过滤，都不用碰后端一行代码。但"只换了第一处"、"JSON 不生效"、"开了压缩就失灵"这三个高频翻车点，都是配置默认值埋的，值得实测一遍看清楚。

本文按配置实战组织：先交代实验环境，再依次实测替换次数、内容类型、压缩三个默认行为。所有输出均为 nginx/1.31.5 实跑结果（官方镜像默认编译了 sub 模块，`nginx -V` 可查）。

## 能做什么

- **动态修改响应内容**：替换响应中的特定字符串，比如敏感词、旧的资源地址，后端服务完全不用改。
- **链接改写**：响应里出现的旧 URL 字符串（如 `http://old.example.com`）统一换成新地址，实现迁移期的平滑过渡。
- **注入公共片段**：拿高频出现的标记当锚点，比如把 `</body>` 替换成 `<script src="/stats.js"></script></body>`，给全站响应统一挂统计脚本，模板零改动。

注意它做的是**字面字符串替换**，不是正则匹配。需要正则替换的复杂场景，一般要借助第三方模块（比如 substitutions4nginx 的 `subs_filter`）或者在应用层处理。

反代域名迁移时的典型组合拳：先 `sub_filter` 把响应里的旧域名换成新的，再配合 301 把旧域名的入站请求也转过来——出站内容和入站流量两个方向一次收口。规则条数按需增加，1.9.4+ 支持同一层写多条，常见搭配是"HTML 里的链接一条、接口 JSON 里的资源地址一条"，配合 `sub_filter_types` 分别圈定作用面。

## 实验环境

单个容器模拟完整链路：8081 端口当"上游后端"（静态目录放着含两处 `old.example.com` 的 `page.html` 和含一处的 `data.json`，开了 gzip），80 端口反代它并挂 sub_filter。客户端用 curl。

## 配置示例

```nginx
server {
  listen 80;

  location / {
    proxy_pass http://127.0.0.1:8081;
    sub_filter "old.example.com" "new.example.com";
    sub_filter_once off;
    sub_filter_types application/json;
  }
}
```

三个指令各管一件事：

- `sub_filter 'old_string' 'new_string';`：定义一条替换规则，把响应里的 `old_string` 换成 `new_string`。
- `sub_filter_once off;`：替换响应中**所有**出现的位置；默认 `on` 只换第一处。
- `sub_filter_types application/json;`：把 JSON 加进处理范围。默认只处理 `text/html`，CSS、JS、JSON 一律原样放行。

sub_filter 只对显式配置了它的 location 生效；继承规则是"本层一条 sub_filter 都没写，才继承上一层"——在 location 里写了第一条，server 层的其他规则就全部失效，多条规则要写在同一层。1.9.4+ 还允许被替换串和替换串里带变量，可以拼上 `$host`、`$arg_*` 这类运行时值做动态改写；`sub_filter_types` 支持一次列多个 MIME，极端场景用 `*` 通配所有类型（0.8.29+）。

## 实测一：默认只换第一处

同一个响应里出现两处目标字符串，默认配置和 `sub_filter_once off` 的差别：

![配图1](/images/csdn/figures/nginx-sub-csdn139253978-1.png)

默认 on 的输出里新旧域名并存——替换了第一处就收工。域名迁移场景几乎总是要 `off`，不然页面一半新链接一半旧链接，比不换还糊涂。顺带一个实测发现：测试页第一处故意写成了 `Old.Example.com` 混合大小写，结果照样被替换——匹配是**大小写不敏感**的（官方文档口径），这既是容错也可能误伤（正文里恰好有同名大小写变体时要注意）。

## 实测二：默认只处理 text/html

`data.json` 里有同样的字符串，默认配置下原样通过；加了 `sub_filter_types` 之后替换生效：

![配图2](/images/csdn/figures/nginx-sub-csdn139253978-2.png)

现在的前后端交互大量走 JSON 接口，只靠默认的 text/html 范围经常"看起来没生效"——先查响应的 Content-Type 在不在 `sub_filter_types` 列表里。

## 实测三：压缩是替换的天敌

上游开了 gzip，客户端带着 `Accept-Encoding: gzip` 来请求，proxy 又没有额外配置——实测拿到的是一坨 gzip 二进制，替换完全没发生：上游压缩发生在内容离开后端之前，Nginx 拿到的是压缩字节流，字面匹配无从谈起。加上一行 `proxy_set_header Accept-Encoding "";` 告诉上游"我要未压缩内容"后，替换恢复工作：

![配图3](/images/csdn/figures/nginx-sub-csdn139253978-3.png)

这就是"sub_filter 和压缩冲突"的完整链路。想两头兼得（替换后再压缩省带宽），可以同时在 Nginx 这一层开 gzip——对客户端的响应仍会被 Nginx 压缩，只是上游到 Nginx 这段走明文，内网链路的带宽代价通常可接受。反过来，如果上游必须保留压缩且关不掉（第三方 SaaS 回源之类的场景），sub_filter 在这条链路上就是无解的：要么推动上游支持"不压缩"的出口，要么把替换挪到应用层——nginx 这一层没有"先解压、替换、再原样压回"的开关。

## 注意事项

- **性能开销**：替换发生在响应体流经 Nginx 的时候，大响应体加高并发下会有可感知的开销，上生产前先做一轮压测。
- **和压缩冲突**：反代场景记得加 `proxy_set_header Accept-Encoding "";` 让上游返回未压缩内容，替换才有机会生效（上文实测）。
- **缓存语义**：替换发生在内容返回阶段，缓存里存的是替换前的原始内容；启用 sub_filter 后响应会失去 `Content-Length`（改为分块传输，实测响应头变成 `Transfer-Encoding: chunked`），有些依赖内容长度的客户端逻辑会受影响。需要靠 Last-Modified 做缓存协商的场景，开 `sub_filter_last_modified on;`（1.5.1+）保留上游时间戳，默认它是被移除的。
- **多条规则**：同一个配置层写多条 `sub_filter` 需要 Nginx 1.9.4 及以上版本，旧版本只能一条。
- **别用来做强安全过滤**：字符串替换挡不住变形的注入内容，安全过滤要有专门的机制，sub_filter 只适合确定性的文本替换。

## 小结

回到"后端一行不改"的起点：`sub_filter` 一条规则确实能把改内容的事揽下来，但三个实测揭示了它的三个默认值陷阱——默认只换第一处（要 `off`）、默认只管 text/html（类型要显式加）、上游一压缩就整体失灵（要清 `Accept-Encoding`）。排查"替换不生效"就按这三步走：数一数换了几处、看看 Content-Type 在不在处理范围、确认上游没有返回压缩内容。三个都排除了还不生效，才轮得到怀疑别的。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
