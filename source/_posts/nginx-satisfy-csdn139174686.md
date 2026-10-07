---
title: "Nginx satisfy 指令：多重访问控制的组合判断"
date: 2024-05-25 09:15:00
updated: 2026-09-14
categories: [技术, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1667670778881-537035257bd8?w=1600&q=80&fm=jpg
---

同一个 location 上同时挂了 IP 白名单和密码验证时，请求要过几道关卡？`satisfy` 指令就是回答这个问题的：`any` 表示任意一道关卡放行即可，`all` 表示每道都得过。做"内网免密、外网要密码"这类策略，全靠它。但它和 allow/deny 的书写顺序、和 return 指令的先后关系，藏着几个实测才能看清的坑。

本文按配置实战组织：先交代实验环境，再用四组配置加真实输出验证 any/all 两种组合语义、顺序陷阱和 return 的优先级。所有输出均为 nginx/1.31.5 实跑结果。

## 实验环境

所有实例在容器里可复现：

- nginx/1.31.5（docker 镜像 `nginx:alpine`）；
- 密码文件用 `openssl passwd -apr1` 生成 apr1 哈希写入 `/etc/nginx/.htpasswd`，账号 `user` 密码 `password1`；
- 容器内 curl 的来源 IP 是 127.0.0.1，实验里用它扮演"白名单内网 IP"；
- 受保护内容用真实静态文件，每轮改动后 reload 再验证（reload 是异步的，紧跟着 curl 会打到旧配置的 worker，看到"不生效"先等一秒）。

## 机制一句话

`satisfy` 决定的是**多道访问关卡之间的逻辑关系**：这里的"关卡"指 access 模块的 allow/deny（IP 控制）和 auth_basic（密码验证）。`any` 是"或"——过任意一道即可；`all` 是"且"——每道都得过。不写 satisfy 时默认 `all`。

默认值选 `all` 是安全上的保守：多道关卡都要求通过，漏配某一道不会直接敞开大门；而"或"语义一旦配错（比如 allow 网段写宽了），等于整条防线降级为单关卡。所以任何"任一放行"的需求都必须显式声明 `satisfy any`，让这个降级动作发生在纸面上，接受 review。

## 实例一：satisfy any，内网免密

IP 白名单加上密码验证，`satisfy any` 让两者变成"或"的关系：

```nginx
server {
  listen 80;
  satisfy any;

  allow 127.0.0.1;   # 白名单（实验中扮演内网）
  deny all;

  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / { root /usr/share/nginx/html; }
}
```

实测白名单 IP 的两种请求：

![配图1](/images/csdn/figures/nginx-satisfy-csdn139174686-1.png)

白名单内无凭证直接 200——IP 关卡放行后密码关卡**根本不再检查**，连密码输错都照样放行。这正是"内网免密、外网要密码"的实现方式：内网 IP 走 allow 门，外网来源被 deny all 挡住后只剩密码门可走。

## 实例二：satisfy all，双重验证

只把 `any` 换成 `all`，语义变成"且"：

```nginx
satisfy all;

allow 127.0.0.1;
deny all;
auth_basic "Restricted";
auth_basic_user_file /etc/nginx/.htpasswd;
```

同一白名单 IP 的三种请求实测：

![配图2](/images/csdn/figures/nginx-satisfy-csdn139174686-2.png)

无凭证 401、密码错 401、密码对才 200——IP 和密码缺一不可。适合"只允许办公网段访问，且访问者要实名登录"的场景。认证失败时 Nginx 回 401 并带上 `WWW-Authenticate: Restricted` 头，浏览器凭这个头弹出账号密码框——realm 字符串就来自 `auth_basic` 指令的参数。对照实例一和实例二的输出能直观看到：satisfy 改变的就是关卡之间的与或关系，其余配置一字未动。

选型的判断依据就一条：**关卡之间是"信任叠加"还是"替代关系"**。内网免密是替代关系（IP 可信度已足够，密码是给外网的补偿），用 any；纵深防御是信任叠加（IP 只是圈定范围，身份还得实名），用 all。拿不准就用默认 all——它只可能把人挡在外面，不会放进不该进的人。

"外网要密码"的另一半同样值得实拍：让请求来自白名单之外的 IP（实验里从另一台容器发起），两种语义立刻分道扬镳——

![配图3](/images/csdn/figures/nginx-satisfy-csdn139174686-3.png)

`satisfy any` 下非白名单来源被 deny all 拒掉后只剩密码门，凭证正确照样 200——这正是内网免密、外网要密码的完整闭环。而 `satisfy all` 下同一个来源即使密码完全正确，拿到的也是 403 而非 401：IP 关卡不过，密码门根本不开。排查"密码对了还进不去"的工单时，先看来源 IP 在不在 allow 名单里，再看返回的是 403 还是 401——状态码直接告诉你卡在哪道关卡。

这套组合不必整站铺开。auth_basic 和 allow/deny 都能下放到 location 层，把控制收窄到单个目录：

```nginx
location /admin/ {
  satisfy any;
  allow 10.0.0.0/8;    # 办公网段免密
  deny all;
  auth_basic "Admin";
  auth_basic_user_file /etc/nginx/.htpasswd;
}
```

继承关系也要记牢：写在 server 块的 auth_basic 会被子 location 继承，想给某个路径豁免认证（比如监控探活的回调地址），得在该 location 里显式写 `auth_basic off;`——漏写的结果是探活一直收到 401，告警响了你都不知道为什么。

## 错误写法：deny all 的顺序陷阱

allow/deny 是**按书写顺序逐条检查，第一条匹配即停**。把 `deny all` 写在前面：

```nginx
# 错：deny all 匹配所有来源，allow 永远轮不到
deny all;
allow 127.0.0.1;

# 对：具体网段在前，deny all 兜底
allow 127.0.0.1;
deny all;
```

错误写法在 `satisfy any` 下的实测：

![配图4](/images/csdn/figures/nginx-satisfy-csdn139174686-4.png)

IP 关卡对所有请求都说"不"，白名单形同虚设，`satisfy any` 下只剩密码门还能进人。危险在于 `nginx -t` 对这种逻辑错误毫无反应——语法完全正确，策略已经变形。**涉及 allow/deny 的策略，改完必须在测试环境用不同来源各 curl 一遍**。

## return 的优先级比所有关卡都高

访问控制再严，也拦不住 rewrite 阶段的 return：

```nginx
server {
  listen 81;
  satisfy any;

  deny all;
  allow 127.0.0.1;

  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location /secret { return 404; }
  location / { root /usr/share/nginx/html; }
}
```

无凭证请求 `/secret` 的实测：

![配图5](/images/csdn/figures/nginx-satisfy-csdn139174686-5.png)

直接 404——IP 检查和密码验证压根没执行。原因是 `return` 在 rewrite 阶段就终结了请求，而 access 检查和 auth_basic 都在更晚的 access 阶段。这个特性反过来用就是"某个路径彻底关门"的干脆做法，但也有反面：**在受保护的 location 里用 `return 200 "..."` 做应答，整个访问控制对它失效**——本次实验设计时就实际踩中了这一点。

## 注意事项

- `satisfy` 可以放在 http、server、location 块中，作用范围逐层向内生效；不写时默认 `all`，想要"任一放行"必须显式写 `satisfy any`。
- `satisfy all` 下来源不在 allow 名单时，密码正确也是 403（上文实测）；`satisfy any` 下则是 401 起步、密码对放行。两个状态码就是排查入口。
- allow/deny 按书写顺序取第一条匹配，`deny all` 和具体网段同块时顺序决定一切，`nginx -t` 只查语法不查逻辑。
- 受保护路径里别放 `return`——rewrite 阶段的它会让 auth_basic 和 allow/deny 全部失效（上文实测）。
- `.htpasswd` 用 `htpasswd` 或 `openssl passwd -apr1` 生成，路径别放在 web 根目录下；容器环境里 nginx:alpine 不带 openssl，需要从外部生成后挂入。

## 小结

回到开头的问题：同一个 location 挂 IP 白名单和密码验证要过几道关卡——`satisfy any` 过一道就够，`satisfy all` 一道都不能少。实测里还看清了两个"关卡之外"的变量：allow/deny 的书写顺序决定 IP 关卡本身通不通，rewrite 阶段的 return 则能整层跳过所有关卡。配置完用三种请求各过一遍——白名单无凭证、白名单错密码、非白名单无凭证——三种语义（any/all/顺序错误）的差别立刻现形。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
