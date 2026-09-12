---
title: "Nginx 限制 IP 访问：allow 与 deny"
date: 2024-05-23 16:58:55
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1592659762303-90081d34b277?w=1600&q=80&fm=jpg
updated: 2026-09-11
---

运维场景里经常要限制某些 IP 才能访问：后台入口只对公司网段开放、接口目录只留给监控机。Nginx 为此提供了 `allow` 和 `deny` 两个指令，规则本身只有两句话，但匹配顺序、作用范围、网段写法这三处一不留神就会"配了不生效"或"把自己也锁在外面"。这篇把三种典型写法各配一组容器实测，再用一个错误顺序的对照说明规则为什么必须"先 allow 后 deny"。

## 实验环境

结论要能复现，先交代条件：

- nginx/1.31.5（docker 镜像 `nginx:alpine`，一次性容器，用完即删）；
- 站点根目录 `/var/www/html`，`curl` 验证状态码，改动后 `nginx -s reload` 生效；
- 容器里可用的来源 IP 有两个：环回 `127.0.0.1` 和容器网卡 `172.17.0.11`，正好用来做"名单内/名单外"的对照。

## 匹配规则：顺序命中即停

核心机制一句话：**Nginx 把 allow/deny 规则按书写顺序逐条比对来源 IP，命中任何一条立即停止，全都没命中才拒绝——所以先写放行名单，最后用 `deny all` 兜底。**

两个指令各一句话：

- **allow**：放行指定 IP 或 CIDR 网段；
- **deny**：拒绝指定 IP 或 CIDR 网段。

它们可以放在 `http`、`server` 或 `location` 块中，作用范围跟着块走：`server` 块管全站，`location` 块只管该路径。

## 实例一：单 IP 白名单

要求只有指定 IP 能访问，其余全部拒绝。生产场景里把 `192.168.1.1` 换成你的办公出口 IP：

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    # 允许指定的IP地址访问
    allow 192.168.1.1;
    # 拒绝所有其他IP地址访问
    deny all;

    root /var/www/html;
    index index.html;
  }
}
```

容器实测，同一套结构跑两个状态——名单里有本机环回时返回 200，把放行对象换成 `192.168.1.1`（本机不在名单）后，同一个请求立刻变成 403：

![单 IP 白名单实测](/images/csdn/figures/nginx-ip-csdn139152387-1.png)

403 就是 allow/deny 拒绝时的标准响应，错误日志里对应一行 `access forbidden by rule`——排查时看到它，就说明请求是死在 IP 规则上，而不是文件权限或路由问题。

## 实例二：网段放行（CIDR 写法）

整站只对一个内网网段开放，网段用 CIDR 写法（`10.0.0.0/24`），单 IP 则直接写地址：

```nginx
server {
  listen 80;
  server_name example.com;

  # 允许10.0.0.1 IP访问
  allow 10.0.0.1;
  # 允许10.0.0.0/24网段内的IP访问
  allow 10.0.0.0/24;
  # 拒绝所有其他IP地址访问
  deny all;

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

实测用一个网段加两个 IP 验证边界：容器里以 `127.0.0.0/8` 复演网段放行，来源是环回 IP 的请求命中网段返回 200，来源是容器网卡 `172.17.0.11` 的请求落在网段外返回 403——同一台机器，两个来源，一放一拒：

![网段放行实测](/images/csdn/figures/nginx-ip-csdn139152387-2.png)

注意 CIDR 匹配的是**来源 IP**，跟请求里访问哪个地址无关：上面 403 那条请求，访问的也是这台服务器，只因来源不在 `127.0.0.0/8` 就被拒了。

## 实例三：只锁一个路径

后台、管理接口通常只占站点的一个路径，锁 `/admin` 而不影响其余页面，把规则写进对应的 `location` 块：

```nginx
server {
  listen 80;
  server_name example.com;

  location /admin {
    # 允许特定的IP访问/admin路径
    allow 192.168.1.1;
    deny all;

    root /var/www/html;
    index index.html;
  }

  location / {
    root /var/www/html;
    index index.html;
  }
}
```

实测正是这个形态：本机 `127.0.0.1` 不在 `/admin` 的放行名单里，访问 `/admin` 得到 403，访问首页得到 200——规则的效力严格限定在块内：

![location 级限制实测](/images/csdn/figures/nginx-ip-csdn139152387-3.png)

## 错误写法：deny all 放在了 allow 前面

规则按顺序"命中即停"，`deny all` 一旦写在前面，所有请求在第一条就命中，后面的 allow 全部变成摆设：

```nginx
# 错：deny all 放最前，白名单形同虚设
deny all;
allow 127.0.0.1;

# 对：先列放行名单，deny all 只做兜底
allow 127.0.0.1;
deny all;
```

实测错误写法，来源就是白名单里的 `127.0.0.1`，照样 403：

![错误顺序实测](/images/csdn/figures/nginx-ip-csdn139152387-4.png)

错在哪：顺序匹配意味着"第一条规则拥有一票否决权"，兜底的 `deny all` 只有放在末尾，才能在"名单之外"这一种情况下才被命中。

## 改动如何生效

改完配置不要直接重启，走标准两步——先验证语法，再平滑加载：

```bash
# 测试Nginx配置文件是否有语法错误
sudo nginx -t

# 重新加载Nginx以应用新的配置
sudo systemctl reload nginx
```

`nginx -t` 拦住的每一个语法错误，都会让 reload 失败、新旧配置并存——规则写了却"时灵时不灵"，先确认 reload 是否真的成功过。

## 注意事项

- allow/deny 按书写顺序匹配，规则写反了（比如 `deny all` 放最前）会让后面的 allow 全部失效，这是本篇实测过的头号坑。
- 规则的作用范围跟所在块走：`server` 块管全站，`location` 块只管该路径，别把只该锁后台的规则误写到 `server` 级。
- 子网要用 CIDR 写法（如 `10.0.0.0/24`），单 IP 直接写地址。
- 线上有反向代理或 CDN 时，Nginx 看到的来源 IP 可能是代理的 IP 而不是用户的真实 IP，白名单要放行的是"Nginx 实际看到的那个地址"，配合 `realip` 模块或放行代理网段处理。
- 放行后台、管理接口这类敏感路径时，IP 白名单最好配合认证一起用，别只靠一层防护。

## 小结

回到开场的两个场景：公司网段看后台、监控机拉接口，都是"名单内放行、名单外拒绝"这一个模型——`allow` 列名单，`deny all` 兜底，位置写在正确的块里，顺序永远让兜底收尾。配完先 `nginx -t` 再 reload，403 出现时去日志里找 `access forbidden by rule`，IP 访问控制就从"碰运气"变成了可验证的规则。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
