---
title: "Nginx return 指令：不惊动后端，直接把话回了"
date: 2024-05-20 15:01:40
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1651340550839-3b295d930048?w=1600&q=80&fm=jpg
---

站点要停机维护，你不想让用户撞上一堆后端报错；旧链接换了域名，你不想写一行跳转代码；内网探活想要个固定应答，你不想为此起一个服务。这些事的共同点是：不需要任何后端参与，Nginx 自己就能把响应给出去。干这活的指令是 `return`，属于内置的 rewrite 模块（`ngx_http_rewrite_module`）——指定状态码、跳转地址，甚至响应正文，请求到它这里就地终结。

本文按配置实战组织：先交代实验环境，再给三组可直接复制的配置与真实输出（维护页、重定向、文本应答），加上 server 级整站开关，最后用实测说清两个容易踩的坑。所有输出均为 nginx/1.31.5 实跑结果，未验证的结论会明确标注。

![配图1](/images/csdn/figures/nginx-return-http-csdn139065651-1.png)

![配图2](/images/csdn/figures/nginx-return-http-csdn139065651-2.png)

![配图3](/images/csdn/figures/nginx-return-http-csdn139065651-3.png)

![配图4](/images/csdn/figures/nginx-return-http-csdn139065651-4.png)

![配图5](/images/csdn/figures/nginx-return-http-csdn139065651-5.png)

## 实验环境

所有实例在容器里可复现：

- nginx/1.31.5（docker 镜像 `nginx:alpine`）；
- 配置挂载到 `/etc/nginx/conf.d/`，每轮改动后 `docker exec 容器名 nginx -s reload`；
- 容器内用 `curl` 验证，不映射端口。

## 指令语义：一句话短路

`return` 的心智模型一句话：**执行到它，请求立即结束，后面的 location 匹配、代理、文件查找全部不再发生**。它可以带三种参数：只给状态码（`return 503;`）、状态码加跳转地址（`return 301 https://...`）、状态码加响应正文（`return 200 "ok";`）。写在 server 块里是整站生效，写在 location 块里只管匹配到的请求。

至于生效阶段：location 里的 return 在 content 阶段直接应答，server 里的 return 在更早的 rewrite 阶段就把请求拦下——实际配置里通常不用特意关心在哪个阶段，location 里写了 return，Nginx 自然在合适的时机结束请求。真正要记的是下文的 server 级短路行为。

## 实例一：维护页，503 加上 Retry-After

停机维护时把全站指到 503，这是 return 最经典的用法：

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    return 503;
  }
}
```

实测请求任意路径都返回 503，请求不会到任何上游：

![配图1](/images/csdn/figures/nginx-return-http-csdn139065651-1.png)

读图：状态行是 `503 Service Temporarily Unavailable`，响应体是 Nginx 内置的英文错误页（实测 Content-Length 只有 197 字节）——对内部探活够用，给真实用户看就太敷衍了。

光有 503 还不够体面——用户不知道该什么时候回来。用 `add_header` 补一个 `Retry-After` 头：

```nginx
location / {
  add_header Retry-After "3600" always;
  return 503;
}
```

这里的 `always` 不是装饰。实测去掉它，503 响应里 **Retry-After 头不会出现**：`add_header` 默认只对 200、301 这类成功响应生效，4xx/5xx 必须加 `always` 才带得上。这条是 return + add_header 组合最高频的翻车点。

## 实例二：旧链接搬家，301 重定向

旧地址要永久挪到新域名，一条指令完成跳转：

```nginx
location /redirect {
  return 301 https://www.example.com;
}
```

实测响应头里带上了 `Location`，浏览器凭它跳转：

![配图2](/images/csdn/figures/nginx-return-http-csdn139065651-2.png)

301 与 302 的选择：地址永久变更用 301，浏览器和搜索引擎会把权重转到新地址；临时性跳转（比如活动页）用 302，别让搜索引擎把临时地址当永久收录。

## 实例三：直接回文本，健康检查专属

内网探活想要个固定应答，连静态文件都省了：

```nginx
location /ok {
  return 200 "ok\n";
}

location /text {
  default_type text/plain;
  return 200 "hello $request_uri\n";
}
```

实测两个 location 的行为差异：

![配图3](/images/csdn/figures/nginx-return-http-csdn139065651-3.png)

读图：`/ok` 返回了 200 和正文，但 Content-Type 是 `application/octet-stream`——**return 的文本默认按二进制流处理，浏览器会弹下载而不是展示**。给健康检查用无所谓，但想让文本正常显示（或正文里用 `$request_uri` 这类变量拼内容），照 `/text` 的写法配一句 `default_type text/plain`。

## server 级 return：整站开关

return 写在 server 块里时优先级更高——**请求还没进 location 匹配就被拦下了**。把实例一的配置改成 server 级，同时在 location 里留一个正常应答做对照：

```nginx
server {
  listen 80;
  server_name localhost;

  return 301 https://new.example.com;

  location /ok {
    return 200 "never reached\n";
  }
}
```

请求 `/ok`，实测：

![配图4](/images/csdn/figures/nginx-return-http-csdn139065651-4.png)

写明了 `return 200` 的 location 完全没机会执行，所有请求都被 server 级的 301 接管。这个特性可以当整站下线开关用——上线前记得删掉，否则调试半天 location 都不会生效。

## 一组对比：重复的 return

同一个 location 写两条 return，直觉上"后面的覆盖前面的"，实际相反：

```nginx
# 错：第二条永远不生效
location /dup {
  return 200 "first\n";
  return 200 "second\n";
}

# 对：一个 location 只留一条 return
location /dup {
  return 200 "first\n";
}
```

实测返回的是 `first`：

![配图5](/images/csdn/figures/nginx-return-http-csdn139065651-5.png)

危险在于 `nginx -s reload` 不报任何错——第二条被静默忽略。规则一条：**一个块内只写一条 return，多个分支需求拆成多个 location**。return 短路的语义决定了它执行到就结束，不存在"执行两条"的可能。

## 注意事项

- **位置决定作用域**。写在 server 块是整站开关（location 全部失效），写在 location 块只管本路径；拿不准先想清楚你要拦的是"整个站"还是"某个路径"。
- **同一块内多条 return 只有第一条生效**，且 reload 不报错（上文实测）。review 配置时看到块内多条 return 直接判错。
- **纯文本响应配 `default_type`**。默认 `application/octet-stream` 在浏览器端表现为下载文件（上文实测），探活接口无所谓，给人看的文本必须配。
- **错误码要带自定义头，`add_header` 必须加 `always`**。503 维护页配 `Retry-After` 却发现头丢了，九成是这个原因（上文实测）。
- **503 页面给用户留出口**。纯状态码页面是 Nginx 内置的英文错误页，认真做维护就配 `error_page 503 /maintenance.html`，至少告诉用户"几点恢复"。

## 小结

回到开头的三个场景：维护页是 `return 503` 配 `Retry-After`，旧链接搬家是 `return 301` 带新地址，探活应答是 `return 200 "ok"` 配 `default_type`。三个场景共用同一个心智模型——**return 就是 Nginx 的"直接回话"，执行到即终结，不惊动任何上游**。写完配置拿 curl 把状态码和响应头各过一遍，特别是确认 `always` 和 `default_type` 这两个容易静默失效的细节，就能在上线前把坑全拦住。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
