---
title: "用 Nginx secure_link 模块实现防盗链和临时链接"
date: 2024-05-29 13:55:08
updated: 2026-09-11
categories: [技术]
tags: [Nginx, 安全]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1557701197-2f99da0922dd?w=1600&q=80&fm=jpg
---

有些资源不能裸奔在公网上：付费下载的文件、限时分享的压缩包，都需要"拿着有效凭证才能访问"。Nginx 的 secure_link 模块（`ngx_http_secure_link_module`）用 URL 签名实现这一点——请求带上了正确签名和未过期的有效期参数才放行，否则直接拒掉。签名对不对、过期判定怎么走，光看文档容易想当然，本文全部实测。

按配置实战组织：先交代实验环境与签名生成，再验证放行、过期、无签名、篡改、换源五种请求的实际走向。所有输出均为 nginx/1.31.5 实跑结果。

![配图](/images/csdn/figures/nginx-secure-link-csdn139293849.png)

## 实验环境

- nginx/1.31.5（docker 镜像 `nginx:alpine`，`nginx -V` 确认自带 `--with-http_secure_link_module`）；
- 受保护文件 `/usr/share/nginx/html/private.zip`（内容 SECRET）；
- 签名由后端脚本生成——本实验用一段 Python 扮演（真实可跑）：

```python
import hashlib, base64, time

expires = int(time.time()) + 300          # 5 分钟后过期
raw = f"{expires}/private.zip127.0.0.1 secret_key"   # 过期时间+URI+客户端IP+空格+密钥
sig = base64.urlsafe_b64encode(
    hashlib.md5(raw.encode()).digest()).rstrip(b"=").decode()
print(f"/private.zip?md5={sig}&expires={expires}")
```

注意编码细节：MD5 摘要做的是 **base64url**（`+`→`-`、`/`→`_`），并去掉末尾的 `=` 补位——用标准 base64 编码签名必然对不上。

## 这条防线挡住谁

两个典型场景，对应签名的两种用法：

- **防盗链**：签名和过期时间由你的后端在用户完成购买/登录后下发，第三方站点拿不到密钥、造不出签名，从它页面上链过来的请求一概 403——带宽不会被外站白嫖。配合上文实测的 IP 绑定，连"链接被复制到别处"都挡得住。
- **临时链接**：签名里带过期时间，超时自动失效，适合限时共享文件、下载地址防扩散。发出去的链接过期即 410，不需要后端再维护任何"撤销列表"——失效逻辑完全在 URL 自己身上，这是 secure_link 相比"数据库存 token"方案最省心的地方。

它的边界也要说清：签名保护的是"URL 的合法性"，不是"文件内容的机密"——持有有效链接的人在有效期内照样能下载完整文件。需要内容级保密，那是 HTTPS 传输加密和应用层加密的职责。

## 配置

保护 `/private.zip`：

```nginx
server {
  listen 80;

  location / {
    root /usr/share/nginx/html;
  }

  location /private.zip {
    root /usr/share/nginx/html;
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

- `secure_link $arg_md5,$arg_expires;`：从 URL 的 `md5` 和 `expires` 参数里取签名和过期时间。
- `secure_link_md5 "..."`：定义签名算法的拼接串——过期时间、请求 URI、客户端 IP 再拼上自定的 `secret_key`，用这个串算 MD5。拼接串里有什么、客户端链接生成时就得按同样的顺序拼什么。
- 验证结果写在 `$secure_link` 里：签名对不上为空字符串，签名对但已过期为 `"0"`，都过为 `"1"`。两个 `if` 分别把前两种情况映射成 403 和 410 Gone，验证通过则由 `root` 直接提供文件。

> 注：原文示例在两个 `if` 之后还有一行 `rewrite ^/(.*)$ /$1? permanent;`，它会把验证通过的请求 301 到丢弃了签名参数的同一 URL，跳转后必然再次验证失败，形成"通过即失效"的循环，重构时已移除——验证通过后由继承的 `root` 直接提供文件即可。

## 实测：五种请求的实际走向

用生成的签名构造 URL，五种情况各打一发：

![配图1](/images/csdn/figures/nginx-secure-link-csdn139293849-1.png)

读图：三条主线——签名对且未过期 200 拿到文件；签名对但时间已过 410；没有签名 403。注意 410 的判定用的是"**生成签名时**填入的过期时间"：Nginx 拿请求里的 `expires` 参数重算签名，两个值必须配套。这引出一个容易误测的坑：

**常见误测：拿有效签名直接改 URL 里的 `expires` 参数想看"过期"效果，得到的不是 410 而是 403**——因为 `expires` 是签名计算的输入之一，改它等于篡改签名（实测确认）。想测过期，必须让脚本用"已经过去的时间戳"重新生成一整套签名和参数。

防盗链维度同样实测：把签名里的 IP 换成别的机器（同一 URL、不同来源 IP 请求），因为拼接串里有 `$remote_addr`，签名验证立即失败：

![配图2](/images/csdn/figures/nginx-secure-link-csdn139293849-2.png)

链接换台机器就失效，这既是加固也是限制：经过会改写源 IP 的代理链路时要留意，必要时把 `$remote_addr` 从拼接串里去掉，用"链接不绑定人"的弱签名换兼容性。

## 注意事项

- 模块是否可用先 `nginx -V | grep secure_link` 确认：官方 docker 镜像默认编译了它（实测 1.31.5 自带），源码自行编译才需要加 `--with-http_secure_link_module`。
- `secret_key` 一旦泄露，任何人都能伪造签名，务必只在服务端保存、定期更换；签名算法是 MD5，安全性完全依赖密钥保密而非算法强度。
- 过期时间用 Unix 时间戳（秒），链接失效返回 410，前端可以把这类响应引导用户重新申请下载。
- 想给不同用户发不同有效期的链接，把用户标识加进 `secure_link_md5` 的拼接串即可，签名的"防伪范围"跟着拼接串走。

## 小结

回到"资源不裸奔"的起点：一条 secure_link 配置把"能不能下载"变成了"有没有在有效期内、从绑定 IP 拿着正确签名来"。五种请求的实测走向里最有价值的两个认知是——**`expires` 参数是签名输入，改它不叫过期叫篡改**；**拼接串里的每个变量都是签名的一部分，加了 `$remote_addr` 就等于把链接钉死在单一来源上**。上线前用一段签名脚本把 200/410/403 三种走向各验一遍，比上线后盯着日志猜要踏实得多。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
