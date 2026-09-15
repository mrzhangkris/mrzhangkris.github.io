---
title: "Nginx location 匹配规则实测：优先级、正则顺序与嵌套"
date: 2024-05-22 09:37:37
categories: [技术, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

一个请求进来该由哪个 location 处理，取决于 Nginx 的 location 匹配规则。这套规则网上说法很多——"最长匹配""正则优先"各种版本都有流传，有的还是错的。本文用 nginx/1.31.5 容器把四类匹配模式逐一实测，给出经过验证的优先级结论：精确匹配怎么命中、`^~` 到底"跳过"了什么、正则是按顺序还是按最长、嵌套 location 如何生效。

## 实验环境

- nginx/1.31.5（nginx:alpine 容器）
- 验证方法：每个 location 里放 `return 200 "标记"`，curl 不同 URI 看返回的标记——命中哪个块一目了然，这也是排查 location 问题时最实用的技巧

## 四类匹配模式

| 写法 | 名称 | 语义 |
|------|------|------|
| `location = /uri` | 精确匹配 | URI 完全相等才命中 |
| `location ^~ /uri` | 前缀匹配（跳过正则） | 前缀命中且是同类最长时，不再查正则 |
| `location ~ 正则` | 正则匹配（区分大小写） | 按配置顺序取第一个命中 |
| `location ~* 正则` | 正则匹配（不区分大小写） | 同上 |
| `location /uri` | 普通前缀匹配 | 记住最长的那个，继续查正则 |

## 匹配顺序（实测结论）

Nginx 处理一个请求的完整流程：

1. **先查精确匹配 `=`**：命中立即使用，查找结束；
2. **再查所有前缀匹配**（普通前缀和 `^~` 一起比），记住**最长**的那个：
   - 最长的前缀若带 `^~`：直接采用，**跳过正则**；
   - 否则把它暂存，继续下一步；
3. **按配置书写顺序查正则**（`~` 和 `~*`）：第一个命中的立即采用；
4. **所有正则都不命中**：回退使用第 2 步暂存的最长前缀。

一句话记法：**精确 > 最长前缀（`^~` 立即定案）> 正则（顺序优先）> 普通前缀兜底**。

> 注：原文写的顺序是"精确 → 前缀 → 正则 → ^~"，把 `^~` 排在正则之后是不对的——`^~` 是前缀匹配的修饰符，作用恰恰是在正则**之前**拦截。上文顺序为实测与官方文档（ngx_http_core_module 的 location 一节）核对后的结果。

## 实例一：四类模式同场竞技

配置（节选）：

```nginx
server {
  listen 80;
  location = /exact        { return 200 "A"; }  # 精确匹配
  location ^~ /static      { return 200 "B"; }  # ^~ 前缀
  location ~ \.php$        { return 200 "D"; }  # 正则（区分大小写）
  location ~* \.(gif|jpg)$ { return 200 "C"; }  # 正则（不分大小写）
  location /prefix         { return 200 "E"; }  # 普通前缀
  location /               { return 200 "F"; }  # 兜底
}
```

逐个 URI 实测命中结果：

![四类 location 同场竞技实测](/images/csdn/figures/nginx-location-csdn139108958-1.png)

三个值得注意的命中：

- **`/static/a.php` 命中 `^~ /static` 而不是 `~ \.php$`**——这就是 `^~` "跳过正则"的实证：前缀阶段它是最长匹配（/static 比 / 长），带 `^~` 直接定案，正则没机会跑；
- **`/exact/aaa` 没命中 `= /exact`**，落到默认块——精确匹配要求 URI 完全相等，多一段路径都不算；
- **`/b.JPG` 命中 `~*` 不区分大小写正则**——大写扩展名被 `~*` 接住，换成 `~` 就漏了。

## 实例二：正则是"顺序优先"，不是"最长优先"

流传很广的说法是"正则选最长匹配"，实测证明是错的：

```nginx
location ~ /a     { return 200 "A"; }    # 短的写在前面
location ~ /a/b/c { return 200 "ABC"; }  # 长的写在后面
```

请求 `/a/b/c` 同时匹配两个正则，命中哪个？

![正则顺序优先实测](/images/csdn/figures/nginx-location-csdn139108958-2.png)

结果是先写的短模式 `~ /a` 命中。**正则按配置文件里的书写顺序取第一个命中，与长短无关**——正则块的先后顺序就是优先级。想把更具体的规则优先生效，就把它写在前面。

## 实例三：嵌套 location

location 块内可以再嵌套 location 块，对某个路径下的特定子路径做特殊处理：

```nginx
location /images {
  root /var/www/images;
  location ~ \.jpg$ {
    # 只对 /images 下的 jpg 生效的配置
  }
}
```

实测：父块 /images 里放兜底 return，内层嵌一个 `~ \.jpg$`：

![嵌套 location 实测](/images/csdn/figures/nginx-location-csdn139108958-3.png)

`/images/pic.jpg` 命中内层正则，`/images/pic.png` 留在外层——嵌套 location 只在父块路径范围内进一步细分，继承父块的上下文（root、proxy 设置等），是"目录级配置 + 文件类型级例外"的标准写法。

## 错误写法：依赖"直觉顺序"排正则

一个典型事故现场——把宽泛的正则写在具体的前面：

```nginx
location ~ ^/api/     { proxy_pass http://backend; }   # 宽泛，写在前面
location ~ ^/api/v2/  { proxy_pass http://new_backend; } # 具体，写在后面
```

按实测的顺序优先规则，所有 `/api/v2/...` 请求都会被第一条接走，第二条永远不生效——配置没报错、日志也正常，只是路由悄悄错了。修正方法：具体的写在前面，宽泛的写在后面；或者干脆用前缀匹配（`location /api/v2/` + `location /api/`），前缀是按最长匹配的，不受书写顺序影响。

## 综合示例

把几种模式放在一起的典型配置：

```nginx
server {
  listen 80;
  server_name example.com;

  location = / {
    return 200 'Exact match for root';
  }

  location / {
    return 200 'Default root prefix match';
  }

  location ^~ /static {
    return 200 'Static files';
  }

  location ~ \.php$ {
    fastcgi_pass 127.0.0.1:9000;
    include fastcgi_params;
  }

  location /images {
    root /data;

    location ~ \.jpg$ {
      return 200 'JPEG image';
    }
  }
}
```

逐条对照实测规则：

- `location = /` 只匹配根路径的精确请求，命中即结束——高频固定路径（首页、健康检查）用它最划算；
- `location ^~ /static` 让静态目录整体按前缀处理，即使 URI 以 .php 结尾也不会掉进 FastCGI；
- `location ~ \.php$` 匹配所有以 .php 结尾的请求，走 FastCGI；
- `location /images` 与其嵌套的 `~ \.jpg$` 分别处理目录和其中的 JPEG 文件；
- `location /` 兜底，接住所有漏网请求。

## 注意事项

- 精确匹配 `=` 命中后立即结束查找，连正则都不查——高频访问的固定路径（如 `/`、`/healthz`）用它性能最好。
- 正则按配置文件里的书写顺序取第一个命中，与"最长匹配"无关（实测二），正则块的先后顺序就是优先级；同类规则"具体在前、宽泛在后"。
- `^~` 的价值在于跳过正则：确定某前缀想整体按前缀处理（如静态目录）时加上它，避免被后面的正则意外截胡（实测一的 /static/a.php）。
- 普通前缀匹配之间比的是**最长**（/prefix/sub 命中 /prefix 而不是 /），这一点和正则的顺序规则不同，别混。
- 嵌套 location 只在父 location 的路径范围内进一步细分，继承父块的上下文。
- 拿不准实际命中哪个 location 时，别猜——用本文的验证方法：往候选 location 里临时放 `return 200 "标记"`，curl 一下看返回；或者看 access 日志。配置改完 `nginx -t` 过了再 reload。

location 匹配这套规则，靠读文章记不如靠标记法实测一遍：`=` 立即定案、`^~` 拦截正则、正则按顺序、前缀按最长，四句话覆盖了全部行为。配置里每次调整 location 顺序后，用 return 标记扫一遍关键 URI，路由错乱这类"静默事故"就无处藏身。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。