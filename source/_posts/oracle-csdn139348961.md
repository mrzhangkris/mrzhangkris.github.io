---
title: "Oracle 网络传输加密：sqlnet.ora 服务端与 JDBC 客户端配置"
date: 2024-06-03 08:45:00
updated: 2026-09-11
categories: [技术]
tags: [Oracle, 网络服务]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1591913139332-f8172ef511da?w=1600&q=80&fm=jpg
---

数据库里存的是最值钱的数据，但客户端到服务器之间的传输链路常常是裸奔的——同一内网不等于安全。Oracle 内置了网络加密和数据完整性校验机制，服务端在 `sqlnet.ora` 里配置，客户端在 JDBC 连接属性里配置，两边对上就能启用加密传输。这篇记录两端的配置方法和一个可运行的 Java 示例。

### 服务器端：sqlnet.ora

在数据库服务器的 `sqlnet.ora` 文件中添加：

```conf
SQLNET.ENCRYPTION_SERVER = REQUIRED # 开启加密
SQLNET.ENCRYPTION_TYPES_SERVER = (AES256, AES192, AES128) # 采用AES对称加密算法
SQLNET.CRYPTO_CHECKSUM_SERVER = REQUIRED # 需要对数据完整性进行验证
SQLNET.CRYPTO_CHECKSUM_TYPES_SERVER = SHA1 # 签名算法
```

这四行的含义：加密和校验都设为 `REQUIRED`，意味着不加密、不做完整性校验的连接请求会被直接拒绝；算法按括号里的顺序协商，优先 AES256，逐级降到 AES128；完整性用 SHA1 做签名。

> 注：原文采用行内 `#` 注释的写法。不同版本的 sqlnet.ora 对行内注释的解析行为存疑，稳妥的做法是把注释单独成行（以 `#` 开头），参数值本身保持干净。

### 客户端：JDBC 连接属性

客户端不需要动配置文件，把加密要求写进连接属性即可：

```java
Properties props = new Properties();
props.setProperty("oracle.net.encryption_client", "REQUIRED");
props.setProperty("oracle.net.encryption_types_client", "(AES256, AES192, AES128)");
```

属性名和服务端一一对应，取值同样支持 `REQUIRED` / `ACCEPTED` 等级别；两端都设 `REQUIRED` 才能保证链路上没有明文回退的余地。

### Java 完整示例

![配图](/images/csdn/figures/oracle-csdn139348961.png)

下面用 JDBC 驱动演示建立加密连接并执行一次查询：

```java
import java.sql.*;
import java.util.Properties;
import oracle.jdbc.OracleConnection;
import oracle.jdbc.pool.OracleDataSource;

public class EncryptedConnectionDemo {
    public static void main(String[] args) {
        Connection conn = null;
        try {
            String url = "jdbc:oracle:thin:@(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=192.168.0.24)(PORT=1521))(CONNECT_DATA=(SID=orcl)))";
            Properties props = new Properties();
            props.setProperty("user", "user1");
            props.setProperty("password", "password");
            props.setProperty("oracle.net.encryption_client", "REQUIRED");
            props.setProperty("oracle.net.encryption_types_client", "(AES256, AES192, AES128)");

            conn = DriverManager.getConnection(url, props);
            System.out.println("Connection established successfully with encryption.");

            // 执行查询
            try (Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery("SELECT * FROM user_users")) {
                while (rs.next()) {
                    String name = rs.getString("name");
                    System.out.println("name: " + name);
                }
            }
        } catch (SQLException ex) {
            ex.printStackTrace();
        } finally {
            try {
                if (conn != null) {
                    conn.close();
                }
            } catch (SQLException ex) {
                ex.printStackTrace();
            }
        }
    }
}
```

连接串还是普通的 thin 连接，加密由 `props` 里的两个属性触发。如果连接成功打印出 `Connection established successfully with encryption.`，说明协商到了加密通道。

## 注意事项

- 服务端和客户端的算法列表要有交集，否则协商失败直接连不上——排查"突然连不上数据库"时先对一下两边的 `ENCRYPTION_TYPES`。
- `REQUIRED` 是硬开关，上线前先在测试环境验证所有存量客户端都支持加密，避免业务中断。
- SHA1 在如今的安全标准下偏弱，新环境可评估更高强度的校验算法。
- 加密有少量 CPU 开销，高吞吐场景留意服务端负载变化。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
