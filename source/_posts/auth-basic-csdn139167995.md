---
title: "使用auth_basic模块进行基础认证"
date: 2024-05-24 10:24:22
categories: [技术]
tags: [运维]
copyright_author: 张鹏
cover: /images/csdn/covers/auth-basic-csdn139167995.png
---

在建立和维护Web服务器时，身份认证是一个至关重要的环节。Nginx作为一个高性能的Web服务器，支持许多认证方法，其中较为简单和常用的一种即是基础身份认证（Basic Authentication），这需要借助auth\_basic模块实现。本文将详细介绍Nginx中auth\_basic模块的用途、使用场景、注意事项，并提供完整的示例和注释。此外，还将简要说明OpenResty上的auth\_basic模块。

### auth\_basic模块的用途

auth\_basic模块用于对访问指定资源的客户端进行简单的用户认证。通过该模块，可以确保只有满足提供的用户名和密码的请求才能访问特定资源。它的认证机制相对较为简单和直观，适用于一些不涉密的数据或内部管理的环境。

### 使用场景

1. **开发和测试环境**：在开发和测试环境中，确保只有相关开发人员或测试人员可以访问。
2. **管理和维护页面**：如搭建运维管理页面、监控页面、后台管理页面等，需要限制只允许有权限的用户访问。
3. **临时保护公开不合适的资源**：在部分资源还未准备好完全公开之前，临时性地加一道简单认证。

### 注意事项

1. **不适合传输敏感信息**：由于基础认证的原理是通过HTTP头传递用户名和密码，这些信息是通过base64编码的，不加密，因此不适合传输敏感信息。
2. **HTTPS的结合**：为了避免用户名和密码在传输过程中被窃取，必须结合HTTPS使用，否则认证信息可能被中间人攻击窃取。
3. **效率影响**：大规模、高并发的应用场景可能影响服务器效率，应寻求其他更安全和高效的认证机制。

### 示例与解释

配置一个基础身份认证非常简单，下面通过一个示例来逐步讲解如何实现：

#### 配置基于文件的基础认证

1. 创建一个用户密码文件

通过htpasswd工具生成用户密码文件。这个工具是Apache HTTP Server常用的工具，Nginx完全兼容其生成的密码文件。

```bash
sudo yum install httpd-tools  # 安装 htpasswd 工具
htpasswd -c /etc/nginx/.htpasswd user1  # 创建包含 user1 的用户密码文件
```
2. 修改Nginx配置文件

在Nginx配置文件中，使用auth\_basic来启用基础认证，并使用auth\_basic\_user\_file指令来指定包含用户信息的文件。

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    auth_basic "Restricted Area";  # 设定弹出的对话框中的标题
    auth_basic_user_file /etc/nginx/.htpasswd;  # 指定用户密码文件

    proxy_pass http://localhost:8080;  # 示例：代理到后端服务
  }
}
```

#### 详解：

-   **auth\_basic “Restricted Area”;**：该指令启用基础认证，"Restricted Area"是在客户端弹出的认证对话框中的标题。
-   **auth\_basic\_user\_file /etc/nginx/.htpasswd;**：指定用户和密码文件的路径，这个文件是在上一步中通过htpasswd创建的。
-   **proxy\_pass http://localhost:8080;**：表示将通过认证的请求代理到后端的服务。

#### 完整示例和注释

```nginx
server {
  listen 80;
  server_name example.com;

  # 设置网站根目录的访问控制
  location / {
    # 启用基础认证，客户端看到的对话框标题为 "Restricted Area"
    auth_basic "Restricted Area";

    # 基础认证的用户密码文件
    auth_basic_user_file /etc/nginx/.htpasswd;

    # 代理转发请求到本地8080端口的服务（如应用服务器）
    proxy_pass http://localhost:8080;
  }
}
```

### OpenResty上的auth\_basic模块

OpenResty是基于Nginx的一个更强大的Web平台，集成了许多额外的模块和库。实际上，OpenResty完全继承了Nginx的auth\_basic模块，因此其使用方法和语法几乎没有变化。对于OpenResty来说，基础认证的配置与Nginx是相同的。

```nginx
server {
  listen 80;
  server_name openresty-example.com;

  location / {
    auth_basic "Restricted Area";  # 弹出对话框的标题
    auth_basic_user_file /etc/nginx/.htpasswd;  # 用户密码文件路径

    proxy_pass http://localhost:8080;  # 代理到后端服务
  }
}
```

## 高级用法

虽然基础身份认证相对简单，但在实际应用中，可以结合一些高级技巧和模块来增强其功能和安全性。下面将介绍如何结合其他Nginx模块和设置来实现更强大的认证和访问控制。

### 限制访问次数与速率

结合Nginx的limit\_req模块，可以限制特定IP地址对受保护资源的访问次数和速率，从而减轻可能的暴力破解行为。

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

在上述例子中：

-   \*\*limit\_req\_zone $binary\_remote\_addr zone=one:10m rate=1r/s; \*\*定义了一个命名为one的限速区域，每秒允许一个请求，每个IP地址有10MB的内存空间来存储速率记录。
-   \*\*limit\_req zone=one burst=5 nodelay; \*\*在location块中应用了此限速规则，允许短时间内的突发请求数为5，超出速率限制的请求将被立即拒绝。

### 自定义认证失败页面

默认情况下，认证失败会返回一个简单的401 Unauthorized错误页面。这可能不适合所有应用场景。可以通过Nginx的error\_page指令自定义认证失败页面：

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    auth_basic "Restricted Area";
    auth_basic_user_file /etc/nginx/.htpasswd;

    error_page 401 /custom_401.html;
    location = /custom_401.html {
      root /usr/share/nginx/html;  # 自定义错误页面的路径
      internal;  # 确保该页面不会被直接访问
    }

    proxy_pass http://localhost:8080;
  }
}
```

在上述例子中，通过error\_page 401 /custom\_401.html;指定了自定义的401错误页面，并在location /custom\_401.html块中定义页面的路径和内容。

### 基于IP地址的访问控制

如果希望只有特定的IP地址范围可以进行身份认证，可以结合Nginx的allow和deny指令：

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

在上述例子中：

-   \*\*allow 192.168.1.0/24; \*\*允许192.168.1.0到192.168.1.255范围内的IP地址访问。
-   \*\*deny all; \*\*拒绝其他所有IP地址。

### OpenResty中的高级用法

OpenResty作为Nginx的扩展平台，支持LUA脚本，这意味着可以在基础认证之外实现更复杂的逻辑。如基于数据库的认证或结合第三方OAuth服务。

#### 基于自定义LUA脚本的认证示例

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
          ngx.headerWWW-Authenticate = 'Basic realm="Restricted Area"'
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

上述配置中，通过LUA脚本自定义了认证逻辑，直接在代码中定义了用户名和密码验证。

### 参考文献

1. [Nginx Documentation: HTTP Basic Auth](http://nginx.org/en/docs/http/ngx_http_auth_basic_module.html)
2. [OpenResty Documentation](https://openresty.org/)
3. [Apache HTTP Server Documentation](https://httpd.apache.org/docs/2.4/programs/htpasswd.html)
4. [Nginx Documentation: Limit Request](http://nginx.org/en/docs/http/ngx_http_limit_req_module.html)
5. [Nginx Documentation: Error Page](http://nginx.org/en/docs/http/ngx_http_core_module.html#error_page)

在Nginx中使用auth\_basic模块进行基础身份认证是一种简单有效的方法，适合用于开发、测试环境以及内部管理系统。通过阅读本文，您应该了解了该模块的用途、适用场景、注意事项以及如何配置和使用基础身份认证

**希望本文对您的Web服务安全管理有所帮助。**

---

> 本文迁移自作者 CSDN 博客，2024-05-24 首发于 CSDN，内容保持原貌。
