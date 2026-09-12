---
title: "Nginx auth_basic 基础认证：配置示例与加固"
date: 2024-05-24 10:24:22
updated: 2026-09-11
categories: [技术]
tags: [运维]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1580106815433-a5b1d1d53d85?w=1600&q=80&fm=jpg
---

内部管理页、监控面板这类地址不想裸露在公网，又还没到要上 OAuth 的程度，Nginx 自带的 auth_basic 模块正好补这个位置——两行配置加一个密码文件，就能把所有匿名请求挡在门外。这篇文章讲清楚它的基础配置、常用加固组合和两种典型的错误写法，最后带上 OpenResty 下的进阶用法。所有配置在 nginx/1.31.5（docker 镜像 `nginx:alpine`）容器内实测，状态码均来自实跑输出。

## auth_basic 是什么，什么时候用

auth_basic 做的事很简单：对访问指定资源的客户端要求用户名密码，对不上就拒绝。认证机制直观，适合不涉密的数据或内部管理环境——开发测试环境、运维后台和监控页、还没准备好完全公开的临时资源，都是它的典型位置。

## 实验环境

nginx/1.31.5 容器（`nginx:alpine`），htpasswd 来自 `apk add apache2-utils`；生产环境把 `example.com` 换成自己的域名，并确认套在 HTTPS 之后。

## 基础配置

### 第一步：创建用户密码文件

用 htpasswd 生成，Nginx 完全兼容它生成的密码文件格式：

```bash
sudo yum install httpd-tools  # 安装 htpasswd 工具
htpasswd -c /etc/nginx/.htpasswd user1  # 创建包含 user1 的用户密码文件
```

### 第二步：修改 Nginx 配置

![配图](/images/csdn/figures/auth-basic-csdn139167995.png)

在 server 或 location 里用 `auth_basic` 启用认证，用 `auth_basic_user_file` 指定密码文件：

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    auth_basic "Restricted Area";  # 认证对话框中显示的标题
    auth_basic_user_file /etc/nginx/.htpasswd;  # 用户密码文件

    proxy_pass http://localhost:8080;  # 认证通过后代理到后端服务
  }
}
```

三行指令各管一件事：`auth_basic` 启用认证并给出对话框标题，`auth_basic_user_file` 指向上一步生成的密码文件，`proxy_pass` 把通过认证的请求转发到后端服务。

配置完成后按三种凭证各打一次请求验证，实测结果（后端以静态页模拟）：

![配图1](/images/csdn/figures/auth-basic-csdn139167995-1.png)

OpenResty 完全继承了 Nginx 的 auth_basic 模块，配置写法不变，把 `server_name` 换成自己的域名即可直接使用。

## 常用加固组合

基础认证只有一道门，实际使用中通常再叠加几层限制。

### 结合 limit_req 限制访问速率

用 limit_req 模块限制单个 IP 的访问速率，减轻暴力破解的威胁：

```nginx
http {
  # 定义一个限制速率的区域
  limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;

  server {
    listen 80;
    server_name example.com;

    location / {
      auth_basic "Restricted Area";
      auth_basic_user_file /etc/nginx/.htpasswd;

      # 使用定义的区域应用限速
      limit_req zone=one burst=5 nodelay;

      proxy_pass http://localhost:8080;
    }
  }
}
```

`limit_req_zone` 定义名为 one 的限速区域（`10m` 是存放各 IP 速率状态的共享内存），`limit_req` 在 location 里应用它：允许 5 个突发请求，超速的立即拒绝。

限速对"慢速爆破"的拦截效果可以直接测出来。实测 rate=1r/s、burst=3 连发 5 个请求：

![配图2](/images/csdn/figures/auth-basic-csdn139167995-2.png)

burst 配额耗尽后，第 5 个请求直接 503。

### 自定义认证失败页面

认证失败默认返回一个 401 Unauthorized 错误页。想换成自己的页面，用 error_page 指令：

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    auth_basic "Restricted Area";
    auth_basic_user_file /etc/nginx/.htpasswd;

    error_page 401 /custom_401.html;
    location = /custom_401.html {
      root /usr/share/nginx/html;  # 自定义错误页面所在目录
      internal;  # 确保该页面不会被直接访问
    }

    proxy_pass http://localhost:8080;
  }
}
```

`error_page 401 /custom_401.html;` 指定认证失败时跳转到自定义页面，`internal` 保证该页只能由 nginx 内部跳转到达。实测认证失败时，客户端拿到的响应体就是这个自定义页的内容。

### 结合 allow/deny 做 IP 白名单

来源相对固定时，可以先用 allow/deny 收窄 IP 范围，再叠加认证：

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    # 允许特定IP地址段访问
    allow 192.168.1.0/24;
    deny all;

    auth_basic "Restricted Area";
    auth_basic_user_file /etc/nginx/.htpasswd;

    proxy_pass http://localhost:8080;
  }
}
```

`allow 192.168.1.0/24;` 放行 192.168.1.0 到 192.168.1.255 这段地址，`deny all;` 拒绝其余所有来源。白名单外的来源实测直接 403，连认证对话框都不会出现：

![配图3](/images/csdn/figures/auth-basic-csdn139167995-3.png)

## 一组对比：两种错误写法

**错误一：密码文件对 worker 进程不可读**

htpasswd 用 root 生成后顺手改成 640，worker 进程（通常运行在 nginx 用户下）就读不了它了：

```nginx
# 错：root:root 640，worker 读取失败
auth_basic_user_file /etc/nginx/.htpasswd;

# 对：确保 worker 用户可读（如 644 或归属修正）
auth_basic_user_file /etc/nginx/.htpasswd;
```

配置语法完全正确，但实测所有带凭证的请求一律 500——错误不在语法在权限。排查时先看 error.log，`crypt_r() failed` 一类报错就指向密码文件本身。

![配图4](/images/csdn/figures/auth-basic-csdn139167995-4.png)

**错误二：同一个 location 里用 return 模拟后端**

测试配置是否生效时，有人会在 location 里写 `return 200 "OK";` 代替 proxy_pass，结果无凭证也拿到 200，误以为 auth_basic 失效了。原因是处理顺序：`return` 在 rewrite 阶段执行，`auth_basic` 在其后的 access 阶段执行，请求活不到认证环节。auth_basic 的实测必须走 content 阶段的实际内容（proxy_pass 或静态文件）。

## 注意事项

- **凭证是 base64 编码不是加密**。Basic 认证通过 HTTP 头传递凭证，等于明文传输，务必套在 HTTPS 后面，也不要用它保护敏感信息。
- **密码文件权限是隐形雷**。语法正确不等于能工作，worker 读不了密码文件时全站 500（上文实测），改完权限记得 reload 前先 `nginx -t` 再 curl 一遍。
- **限速和收白名单先于加认证**。limit_req 挡爆破速率，allow/deny 砍来源范围，认证只做最后一道核对，三层按需叠加。
- **高并发大规模场景换机制**。每请求都要读密码文件算哈希，量大时性能不划算，应换更安全和高效的认证机制。

## OpenResty 上的进阶玩法

OpenResty 支持嵌入 Lua 脚本，认证逻辑可以做到接数据库、对接 OAuth 这个层级。下面是一个直接在代码里做用户名密码校验的例子：

```nginx
http {
  lua_shared_dict tokens 10m;

  server {
    listen 80;
    server_name openresty-example.com;

    location / {
      access_by_lua_block {
        local auth = ngx.var.http_authorization
        if not auth or auth == "" then
          ngx.header["WWW-Authenticate"] = 'Basic realm="Restricted Area"'
          ngx.exit(ngx.HTTP_UNAUTHORIZED)
        end

        local user_pass = ngx.decode_base64(auth:sub(7))
        local username, password = user_pass:match("^(.-):(.*)$")

        if not (username == "user1" and password == "password1") then
          ngx.exit(ngx.HTTP_UNAUTHORIZED)
        end
      }

      proxy_pass http://localhost:8080;
    }
  }
}
```

> 注：原文此处的 `ngx.headerWWW-Authenticate` 应为排版时丢失了引号与方括号，已按 OpenResty 的 ngx.header API 恢复为 `ngx.header["WWW-Authenticate"]`。

脚本流程：取到 `Authorization` 头后先解码 base64（`Basic ` 前缀占 6 个字符，所以 `sub(7)` 从第 7 位开始取），拆出用户名和密码做比对，不匹配就返回 401。

## 参考文献

1. [Nginx Documentation: HTTP Basic Auth](http://nginx.org/en/docs/http/ngx_http_auth_basic_module.html)
2. [OpenResty Documentation](https://openresty.org/)
3. [Apache HTTP Server Documentation](https://httpd.apache.org/docs/2.4/programs/htpasswd.html)
4. [Nginx Documentation: Limit Request](http://nginx.org/en/docs/http/ngx_http_limit_req_module.html)
5. [Nginx Documentation: Error Page](http://nginx.org/en/docs/http/ngx_http_core_module.html#error_page)

## 小结

- auth_basic 解决的是"谁能打开这个页面"，适合开发测试环境、内部管理系统和临时保护的资源。
- 它的凭证是 base64 编码而非加密，务必套在 HTTPS 后面，也不要用它保护敏感信息。
- 单独一道认证不够时，limit_req 防爆破、error_page 自定义失败页、allow/deny 收窄来源，按需组合。
- 更复杂的认证逻辑，OpenResty 的 Lua 脚本是现成的扩展点。
- 现场验证从基础组合起步：无凭证 401、正确凭证 200，两条 curl 过了再逐层加限速和白名单。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
