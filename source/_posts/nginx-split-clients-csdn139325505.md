---
title: "用 Nginx split_clients 模块做 A/B 测试与灰度发布"
date: 2024-05-30 15:21:07
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1496181133206-80ce9b88a851?w=1600&q=80&fm=jpg
---

新首页设计到底比旧的好不好？新功能敢不敢直接全量上？A/B 测试和灰度发布都是同一个问题的不同问法：怎么把流量按比例、稳定地分成几组。Nginx 的 split_clients 模块（`ngx_http_split_clients_module`）在接入层就把这件事办了——对用户特征做哈希，按百分比切分流量，不需要应用代码参与。

## 使用场景

- **A/B 测试**：两个版本的页面各分一半流量，比较转化率和用户反馈，看哪个版本更有效。
- **灰度发布**：先给小比例用户放出新功能，观察没有问题再逐步放大，控制发布风险。
- **按用户特征路由**：根据 IP、User-Agent 等特征把特定用户群路由到不同的后端或版本。

## 配置示例

用 IP 加 User-Agent 把用户分成两组，分别访问两版首页：

```nginx
http {
  split_clients "${remote_addr}${http_user_agent}" $variant {
    50%     "A";
    *       "B";
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      if ($variant = "A") {
        # 版本A的首页
        root /var/www/version_a;
      }

      if ($variant = "B") {
        # 版本B的首页
        root /var/www/version_b;
      }
    }
  }
}
```

拆开看：

- `split_clients` 的第一个参数 `"${remote_addr}${http_user_agent}"` 是参与分组的用户特征串；`$variant` 是分组结果存放的变量。
- 块内 `50% "A"` 表示特征串哈希落在前 50% 区间的请求，`$variant` 值为 `"A"`；`* "B"` 是兜底分支，吃掉剩余的所有流量。比例和分支数量都可以按需调，比如 `10%`、`20%`、`*` 做三档灰度。
- location 里按 `$variant` 的值切换 root，指向不同版本各自的静态目录。

![配图](/images/csdn/figures/nginx-split-clients-csdn139325505.png)

## 为什么同一用户看到的版本是固定的

split_clients 对特征串做的是确定性哈希：同一个 IP 加同样的 User-Agent，算出来的哈希值每次都一样，落在哪个区间就永远是哪个版本。这就是 A/B 测试要求的数据一致性——用户不会这会儿看到 A 版、刷新一下变成 B 版，测试数据不会被混淆。也正因为如此，特征串的选择很关键：用 `$remote_addr` 时，移动网络用户换基站可能换 IP，分组就会漂移；有登录态的话，把稳定的用户标识加进特征串更可靠。

## 注意事项

- **特征串要稳定**：同一用户在整个测试期间必须落在同一组，IP 会变的场景（移动网络、共享出口）优先用更稳定的标识。
- **比例是近似值**：50% 是哈希意义上的大致均分，流量小时组间人数会有明显偏差，别在小样本上硬读数据。
- **性能开销很小**：每次请求多一次哈希计算，常态下可以忽略，不用担心这个模块本身的负载。
- **改配置要 reload**：调整分组比例或特征串会改变所有人的分组结果，正在进行的测试中途不要动。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
