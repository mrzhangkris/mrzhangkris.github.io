---
title: "Nginx auth_basic 基础认证：配置示例与加固"
date: 2024-05-24 10:24:22
updated: 2026-09-11
categories: [技术]
tags: [运维]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1580106815433-a5b1d1d53d85?w=1600&q=80&fm=jpg
---

内部管理页、监控面板这类地址不想裸露在公网，又还没到要上 OAuth 的程度，Nginx 自带的 auth_basic 模块正好补这个位置——两行配置加一个密码文件，就能把所有匿名请求挡在门外。这篇文章讲清楚它的基础配置、常见使用场景，以及限速、自定义错误页、IP 白名单这几个常用的加固组合，最后带上 OpenResty 下的用法。

## auth_basic 是什么，什么时候用

auth_basic 做的事很简单：对访问指定资源的客户端要求用户名密码，对不上就拒绝。认证机制直观，适合不涉密的数据或内部管理环境。典型的三个场景：

1. **开发和测试环境**：只让相关的开发、测试人员能访问。
2. **管理和维护页面**：运维后台、监控页这类必须限权的地方。
3. **临时保护**：资源还没准备好完全公开，先加一道简单的门。

用它之前先知道三个限制：

- **用户名密码不是加密传输的**。Basic 认证通过 HTTP 头传递凭证，内容只是 base64 编码，等于明文。不适合保护敏感信息。
- **必须结合 HTTPS**。否则认证信息可能被中间人窃取。
- **大规模高并发场景会影响服务器效率**，这种时候应换更安全和高效的认证机制。

## 基础配置

### 第一步：创建用户密码文件

用 htpasswd 工具生成。这个工具来自 Apache HTTP Server，Nginx 完全兼容它生成的密码文件格式：

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

三行各自的含义：

- `auth_basic "Restricted Area";` 启用基础认证，引号里的字符串是客户端弹出的认证对话框标题。
- `auth_basic_user_file /etc/nginx/.htpasswd;` 指定用户密码文件路径，就是上一步 htpasswd 生成的那个。
- `proxy_pass http://localhost:8080;` 把通过认证的请求转发到后端服务。

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

- `limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;` 定义了一个名为 one 的限速区域，速率为每秒 1 个请求。`10m` 是这块共享内存区域的总大小，用来存放各 IP 的速率状态记录。
- `limit_req zone=one burst=5 nodelay;` 在 location 里应用这条限速规则，允许 5 个突发请求，超出速率限制的请求立即拒绝。

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

`error_page 401 /custom_401.html;` 指定认证失败时跳转到自定义页面，`location = /custom_401.html` 块定义页面路径，`internal` 保证这个页面只能由 nginx 内部跳转到达，不能被直接访问。

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

`allow 192.168.1.0/24;` 放行 192.168.1.0 到 192.168.1.255 这段地址，`deny all;` 拒绝其余所有来源。

## OpenResty 上的进阶玩法

OpenResty 支持嵌入 Lua 脚本，基础认证之外可以实现更复杂的逻辑，比如基于数据库的认证，或对接第三方 OAuth 服务。下面是一个用 Lua 自定义认证逻辑的例子，直接在代码里做用户名密码校验：

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
- 它的凭证只是 base64 编码而非加密，务必套在 HTTPS 后面使用，也不要用它保护敏感信息。
- 单独一道认证不够时，limit_req 限速防爆破、error_page 自定义失败页、allow/deny 收窄来源，三者按需组合。
- 需要更复杂的认证逻辑时，OpenResty 的 Lua 脚本是现成的扩展点。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
