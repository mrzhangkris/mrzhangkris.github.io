---
title: "Nginx auth_request 模块：把认证交给外部服务"
date: 2024-05-25 09:00:00
updated: 2026-09-11
categories: [技术]
tags: [Nginx]
copyright_author: 司南
cover: /images/csdn/covers/nginx-auth-request-csdn139173856.png
---

给某个路径加访问控制，又不想把认证逻辑复制进每个后端服务，Nginx 的 auth_request 模块就是为这个场景准备的：Nginx 先把请求转给一个认证端点，拿到状态码再决定放行还是拒绝。这篇讲它的原理、配置和一个可跑的完整示例。

## auth_request 模块简介

auth_request 是 Nginx 的官方模块，处理客户端请求时先把请求交给外部认证服务，认证服务根据请求内容（如 HTTP 头或查询参数）返回状态码：认证通过，Nginx 继续处理请求；不通过，Nginx 返回错误码拒绝访问。

它的三个典型用途：

- **身份验证**：请求到达后端之前先验证用户身份。
- **访问控制**：借助外部认证服务实现复杂的权限判断逻辑。
- **单点登录**：与 SSO 系统集成，各服务共享一套登录状态。

## 常见使用场景

- **API 网关**：作为 API 网关的一部分，确保只有通过认证的请求才能访问 API。
- **保护管理后台**：只有授权用户能进后台。
- **Web 应用防火墙**：与 WAF 系统配合，做更细粒度的请求过滤和检测。

## 配置示例

### 示例环境

假设有一个外部认证服务，通过 /auth 端点做用户认证并返回 HTTP 状态码：成功返回 200，失败返回 401 或 403。自编译 Nginx 时需要加 `--with-http_auth_request_module` 参数启用该模块；然后编辑 nginx.conf 或虚拟主机配置文件，写入下面的配置。

### 完整配置

![配图](/images/csdn/figures/nginx-auth-request-csdn139173856.png)

```nginx
http {
  # 定义认证服务的逻辑
  server {
    listen 127.0.0.1:8080;
    location /auth {
      # 此处为简单示例，实际应用中应调用外部认证服务
      if ($http_authorization = "Basic dXNlcm5hbWU6cGFzc3dvcmQ=") {  # 假设认证使用Basic Auth
        return 200;
      }
      return 401;
    }
  }

  server {
    listen 80;
    server_name example.com;

    location / {
      # 使用 auth_request 调用认证服务
      auth_request /auth;

      # 处理认证服务的响应结果
      error_page 401 = @error401;
      error_page 403 = @error403;

      # 正常处理请求
      proxy_pass http://backend;
    }

    # 定义认证失败时的处理逻辑
    location @error401 {
      return 401 "Unauthorized";
    }

    location @error403 {
      return 403 "Forbidden";
    }

    # 认证服务的代理设置
    location /auth {
      proxy_pass http://127.0.0.1:8080/auth;
      proxy_pass_request_body off; # 不代理请求体到认证服务
      proxy_set_header Content-Length "";
      proxy_set_header X-Original-URI $request_uri;
    }
  }
}
```

### 配置说明

**认证服务**：第一个 server 块监听 127.0.0.1:8080，模拟一个简单认证服务——检查请求头 Authorization 是否等于预设的 Basic Auth 值，等于返回 200，否则 401。实际项目中，这里应该换成调用真实认证服务的代理配置。

**主站点**：location / 里的核心指令：

- `auth_request /auth;` 处理用户请求前，先向 /auth 发起子请求做认证；
- `error_page 401 = @error401;` 与 `error_page 403 = @error403;` 把认证失败的状态码交给对应的内部处理块；
- `proxy_pass http://backend;` 认证通过后，把请求代理到后端服务器。

**认证失败处理**：@error401 和 @error403 两个命名 location 分别返回 401 "Unauthorized" 和 403 "Forbidden"。

**认证端点的代理设置**：location /auth 把子请求转给 127.0.0.1:8080 的认证服务，三条配套指令各有用途——`proxy_pass_request_body off` 不把请求体发给认证服务；`proxy_set_header Content-Length ""` 清空内容长度头，与上一条配套；`proxy_set_header X-Original-URI $request_uri` 把用户访问的原始 URI 传给认证服务，认证逻辑可以据此做路径级判断。

### 测试与验证

启动 Nginx 后访问 http://example.com，用不同的 Authorization 头测试认证行为：带上正确的值（本例中为 "Basic dXNlcm5hbWU6cGFzc3dvcmQ="）应能正常访问后端资源；不带或带错则拿到 401，由 @error401 返回错误信息。

## 注意事项

- auth_request 按子请求状态码判断结果：2xx 放行，401/403 拒绝，认证服务务必按这个约定返回。
- 子请求默认不带请求体（配置里明确关掉了 proxy_pass_request_body），需要读请求体才能判断的认证场景不适合直接用它。
- 示例里的认证服务只用于演示；生产环境要换成真实认证服务，并只监听本机或内网地址。
- location /auth 是公开可达的，外部用户可以直接请求它探测认证服务；给该 location 加 internal 指令可限制为仅内部子请求访问。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
