---
title: "Nginx root 与 alias：一个是追加，一个是替换"
date: 2024-05-13 15:27:15
updated: 2026-09-14
categories: [技术]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1697577418970-95d99b5a55cf?w=1600&q=80&fm=jpg
---

配置静态文件服务时，`root` 和 `alias` 都负责告诉 Nginx 去文件系统的哪个目录找文件。这俩指令长得像、干的活不同，混淆的后果很直接：请求 404，或者拿到的根本不是你想要的文件。最经典的翻车现场是——配置怎么看怎么对，error_log 里却躺着一个从未写过的路径。

本文按配置实战组织：先交代实验环境，再用三组配置加真实输出把"追加"和"替换"两种行为跑给你看，然后实测两个最容易踩的路径拼接坑。所有输出均为 nginx/1.31.5 实跑结果。

## 实验环境

所有实例在容器里可复现：

- nginx/1.31.5（docker 镜像 `nginx:alpine`）；
- 文档目录 `/usr/share/nginx/html`（含 `index.html` 和 `images/logo.png`，内容分别为 INDEX、LOGO）；
- 独立资源目录 `/data/uploads/logo.png`（内容 UPLOAD），供 alias 映射；
- 配置挂载到 `/etc/nginx/conf.d/`，改动后 reload，容器内 curl 验证。

## 机制一句话：root 追加，alias 替换

两个指令的全部区别浓缩成一句话：**root 把完整 URI 追加到自己后面；alias 把 location 匹配掉的前缀替换成自己**。root 可以写在 http、server、location 任意层级；alias 只能写在 location 里。root 写在 server 块后，内部所有 location 继承这个值，除非自己再写一个覆盖——继承规则和大多数 Nginx 值型指令一样，就近生效。

## 实例一：root，URI 原样拼接

网站文档根目录是 `/var/www/html` 时的典型写法：

```nginx
server {
  listen 80;
  server_name example.com;

  root /usr/share/nginx/html;

  location / {
    try_files $uri $uri/ =404;
  }
}
```

请求 `/images/logo.png`，Nginx 找的是 `/usr/share/nginx/html` + `/images/logo.png`：

![配图1](/images/csdn/figures/nginx-root-alias-csdn138805077-1.png)

注意拼接是"原样"的：URI 长什么样，追加后就长什么样，不做任何剥除。这就是 root 心智负担低的原因——URL 结构和磁盘结构完全一致。这个特性也意味着：在子路径 location 里换 root，前缀依然带着走，`location /static/ { root /data; }` 对 `/static/a.png` 读的是 `/data/static/a.png`，不是 `/data/a.png`。要"剥掉前缀"的语义，那是 alias 的活，下一节就是。

## 实例二：alias，匹配前缀被替换

URL 上的 `/images` 想映射到磁盘上的 `/data/uploads`，又不让真实目录名出现在 URL 里：

```nginx
server {
  listen 81;
  server_name localhost;
  root /usr/share/nginx/html;

  location / {
    try_files $uri $uri/ =404;
  }

  location /images/ {
    alias /data/uploads/;
  }
}
```

同一个 URI `/images/logo.png`，这次拿到的是 UPLOAD——alias 生效了：

![配图2](/images/csdn/figures/nginx-root-alias-csdn138805077-2.png)

读图：location 匹配掉的 `/images/` 前缀被替换为 `/data/uploads/`，实际读取 `/data/uploads/logo.png`。还有一个容易被忽略的行为：`location /images/` 比 `location /` 前缀更长、优先级更高，**html/images 下同名的 LOGO 被彻底遮蔽**——alias location 一旦命中，root 规则对这个请求完全失效。

## 实例三：正则 location 必须带捕获组

前缀匹配覆盖不了的场景（比如文件名带正则处理），用正则 location 配 alias：

```nginx
location ~ ^/images/(.+)$ {
  alias /data/uploads/$1;
}
```

实测 `/images/logo.png` 正常返回 UPLOAD：

![配图3](/images/csdn/figures/nginx-root-alias-csdn138805077-3.png)

这里的 `$1` 不是可选项：alias 在正则 location 里**必须**引用捕获组，漏写 Nginx 启动时直接报错，配置根本过不了 `nginx -t`。

## 什么时候用哪个

判断标准只有一条：**URL 结构和磁盘结构是否一致**。

一致（绝大多数静态站）就用 root——server 块里写一次全局生效，URL 即路径，心智负担最低。不一致才用 alias：资源存放在文档根之外（比如动态生成的报表单独落一个目录）、或者你想隐藏真实的目录结构（URL 暴露 `/backups/` 这类目录名等于给扫描器递清单）。alias 的替换机制就是为这种"URL 一个样、磁盘另一个样"的需求准备的，代价是拼接规则要自己盯紧——下面两节全是它的坑。

## 错误写法：尾斜杠没对齐，路径直接粘连

alias 最经典的坑——location 带尾斜杠，alias 值没带：

```nginx
# 错：alias 末尾少了 /
location /images/ {
  alias /data/uploads;
}

# 对：两边都以 / 结尾，对齐
location /images/ {
  alias /data/uploads/;
}
```

实测错误写法直接 404，error_log 里的路径一针见血：

![配图4](/images/csdn/figures/nginx-root-alias-csdn138805077-4.png)

`/data/uploads` + `logo.png` = `/data/uploadslogo.png`——location 剥掉 `/images/` 后剩余的部分被直接粘在 alias 值后面，中间少了个分隔符。这就是"排查路径问题先看 error_log"的价值：Nginx 会打印它实际尝试的完整路径，拼没拼对一眼见分晓。

反向的不对齐（location 不带斜杠、alias 带）实测能返回 200——剩余部分 `/logo.png` 拼出 `/data/uploads//logo.png`，文件系统容忍了双斜杠。**能跑不等于对**：目录级语义依赖斜杠对齐，保持两边一致才不会在别的环境翻车。

## 实测补充：try_files 搭配 alias 的真相

社区老文章常说"alias 下 try_files 会拼错路径"。实测 nginx/1.31.5：

```nginx
location /images/ {
  alias /data/uploads/;
  try_files $uri =404;
}
```

存在的文件 200，不存在的文件 404 兜底正常。把 error_log 开到 debug 级（官方镜像自带 `nginx-debug` 二进制），请求一个必然不存在的路径，日志写明检查的是 `/data/uploads/nope.png`——单斜杠、按"前缀替换"语义拼装，旧版拼出双斜杠错路径的行为在这个版本已不存在。但你在老版本上复用配置时，别默认它正确——开 debug 日志或直接 curl 一个必然不存在的路径验证行为，是部署前的固定动作。

![配图5](/images/csdn/figures/nginx-root-alias-csdn138805077-5.png)

## 注意事项

- **尾斜杠两边对齐**：location 和 alias 值都以 `/` 结尾（或都不带），错位轻则路径粘连 404（上文实测），重则在带目录语义的配置里行为飘忽。
- **正则 location 的 alias 必须引用捕获组**：`alias /data/uploads/$1;`，漏写启动报错；捕获组写几个引用几个，别凭记忆写。
- **alias 只能写在 location 里**，root 四个层级都行；需要整站统一根目录用 root，局外部落映射用 alias。
- **正则 location 优先级高于普通前缀 location**：`location ~ ^/images/(.+)$` 会抢走 `location /images/` 的请求（除非后者加 `^~` 修饰），同一资源别让两条规则都能命中。
- **alias location 会遮蔽 root**：一旦命中，root 对该请求完全失效（上文实测），排查"文件明明在却读不到"先看是不是被 alias 截胡。
- **排查路径问题先开 error_log**：`open() "..." failed` 里的路径就是 Nginx 实际拼出来的路径，root/alias 的问题 90% 在这一行里现形。

## 小结

回到开头那个"配置怎么看怎么对，error_log 里却有陌生路径"的现场：root 是把完整 URI 追加到根目录后，alias 是把 location 前缀替换成目标路径——理解了"追加 vs 替换"，`/data/uploadslogo.png` 这种粘连路径一眼就能看出少了斜杠。写完配置固定做两个动作：`nginx -t` 过语法，curl 一个存在路径和一个必然不存在的路径、再到 error_log 里核对实际尝试的完整路径，路径拼接的坑就全部拦在上线之前。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
