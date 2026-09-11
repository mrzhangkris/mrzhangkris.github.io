---
title: "用 Nginx secure_link 模块实现防盗链和临时链接"
date: 2024-05-29 13:55:08
updated: 2026-09-11
categories: [技术]
tags: [Nginx, 安全]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1557701197-2f99da0922dd?w=1600&q=80&fm=jpg
---

有些资源不能裸奔在公网上：付费下载的文件、限时分享的压缩包，都需要"拿着有效凭证才能访问"。Nginx 的 secure_link 模块（`ngx_http_secure_link_module`）用 URL 签名实现这一点——请求带上了正确签名和未过期的有效期参数才放行，否则直接拒掉。

## 工作机制

服务端用密钥对资源路径、过期时间等信息计算 MD5，经 base64url 编码后附在 URL 参数里；Nginx 收到请求时用同样的密钥和算法重新计算并比对：

- 签名对不上 → `$secure_link` 为空字符串，拒绝访问；
- 签名对、但已过有效期 → `$secure_link` 为 `"0"`；
- 签名对且没过期 → 验证通过，正常提供文件。

## 使用场景

- **防盗链**：没拿到签名的第三方站点，链接来的请求一概 403，带宽不会被外站白嫖。
- **临时链接**：签名里带过期时间，超时自动失效，适合限时共享文件、下载地址防扩散。

## 配置示例

保护 `/var/www/html` 下的 private.zip：

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    root /var/www/html;
    index index.html;
  }

  location /private.zip {
    secure_link $arg_md5,$arg_expires;
    secure_link_md5 "$secure_link_expires$uri$remote_addr secret_key";

    if ($secure_link = "") {
      return 403;
    }

    if ($secure_link = "0") {
      return 410;
    }
  }
}
```

逐行看：

- `secure_link $arg_md5,$arg_expires;`：告诉模块从 URL 的 `md5` 和 `expires` 参数里取签名和过期时间。
- `secure_link_md5 "..."`：定义签名算法的拼接串——过期时间、请求 URI、客户端 IP 再拼上自定的 `secret_key`，用这个串算 MD5。拼接串里有什么、客户端链接生成时就得按同样的顺序拼什么。
- 两个 `if` 分别处理验证失败（403）和签名有效但过期（410 Gone）。

![配图](/images/csdn/figures/nginx-secure-link-csdn139293849.png)

> 注：原文示例在两个 `if` 之后还有一行 `rewrite ^/(.*)$ /$1? permanent;`，它会把验证通过的请求 301 到丢弃了签名参数的同一 URL，跳转后必然再次验证失败，形成"通过即失效"的循环，重构时已移除——验证通过后由继承的 `root` 直接提供文件即可。

## 生成签名与构建 URL

三个环节串起来：

1. **生成签名**：用约定的密钥和过期时间，按 `secure_link_md5` 定义的顺序拼接字符串，计算 MD5 再做 base64url 编码，通常由后端脚本完成。
2. **构建 URL**：把签名和过期时间作为参数拼上资源地址，形如 `/private.zip?md5=<签名>&expires=<时间戳>`，发给用户。
3. **验证**：Nginx 收到请求后按配置重算比对，与预期一致才返回文件。

注意拼接串里有 `$remote_addr` 时，签名是和客户端 IP 绑定的——链接换台机器就失效，这既是加固也是限制：经过会改写源 IP 的代理链路时要留意。

## 注意事项

- secure_link 不是默认编译进 Nginx 的，需要 `--with-http_secure_link_module` 重新编译，先 `nginx -V` 确认。
- `secret_key` 一旦泄露，任何人都能伪造签名，务必只在服务端保存、定期更换。
- 过期时间用 Unix 时间戳，链接失效后返回 410，前端可以把这类响应引导用户重新申请下载。
- 想给不同用户发不同有效期的链接，把用户标识加进 `secure_link_md5` 的拼接串即可。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
