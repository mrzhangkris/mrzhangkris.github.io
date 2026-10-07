---
title: "Oracle 网络传输加密：sqlnet.ora 服务端与 JDBC 客户端配置"
date: 2024-06-03 08:45:00
updated: 2026-09-14
categories: [技术, Oracle]
tags: [Oracle, 网络服务]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1591913139332-f8172ef511da?w=1600&q=80&fm=jpg
---

数据库里存的是最值钱的数据，但客户端到服务器之间的传输链路常常是裸奔的——同一内网不等于安全，抓包工具摆在链路上，明文 SQL 和结果集一览无余。Oracle 内置了原生网络加密（Native Network Encryption）和数据完整性校验机制：服务端在 `sqlnet.ora` 里配置，客户端在 JDBC 连接属性里配置，两边对上就能启用加密传输，不需要额外的证书体系（区别于 SSL/TLS 钱包方案）。

这篇记录两端的配置方法、一个可运行的 Java 示例，以及三个容易踩的坑：算法协商失败、注释写法、校验算法选弱了。

> 注：Oracle 数据库无法容器化快速验证，本文配置未在真实实例实跑；参数语义依据 Oracle Database 19c Security Guide 与 SQL*Net 参数参考，上线前务必在测试环境验证。

## 核心机制一句话

Oracle 原生加密在连接建立时协商：客户端和服务端各自声明"我要不要加密、支持哪些算法"，双方取交集启用。两个参数族分别控制**机密性**（ENCRYPTION，防偷看）和**完整性**（CRYPTO_CHECKSUM，防篡改），可以独立开关，通常一起配。

## 服务端：sqlnet.ora

在数据库服务器的 `sqlnet.ora`（位于 `$ORACLE_HOME/network/admin/`）中添加：

```conf
# 加密：必须加密，拒绝不加密的连接
SQLNET.ENCRYPTION_SERVER = REQUIRED
# 加密算法候选列表，按顺序协商
SQLNET.ENCRYPTION_TYPES_SERVER = (AES256, AES192, AES128)
# 完整性校验：必须校验
SQLNET.CRYPTO_CHECKSUM_SERVER = REQUIRED
# 校验算法（12c+ 建议 SHA256 及以上）
SQLNET.CRYPTO_CHECKSUM_TYPES_SERVER = (SHA256, SHA384, SHA512)
```

这几行的含义：

- `ENCRYPTION_SERVER = REQUIRED`：不加密的连接请求直接拒绝。四个级别的语义：

| 级别 | 含义 |
|------|------|
| `REJECTED` | 拒绝加密连接（对端要求加密时连不上） |
| `ACCEPTED` | 对端要求加密就加密，不要求也接受明文 |
| `REQUESTED` | 主动希望加密，对端不支持时降级明文 |
| `REQUIRED` | 必须加密，否则拒绝连接 |

- `ENCRYPTION_TYPES_SERVER`：算法按括号里的顺序协商，优先 AES256，逐级降到 AES128。**两端的算法列表必须有交集**，否则协商失败直接连不上。
- `CRYPTO_CHECKSUM_*`：完整性校验用哈希签名防篡改。原文用的 SHA1——12c 之前只有 SHA1 可选，**12c 起支持 MD5/SHA1/SHA256/SHA384/SHA512，默认 SHA256**；SHA1 在如今的安全标准下偏弱，新环境直接上 SHA256 起步。

改完 `sqlnet.ora` 不需要重启数据库实例，新建连接即生效（存量连接不受影响）。

### 注释写法的坑

原文采用行内 `#` 注释的写法（`SQLNET.ENCRYPTION_SERVER = REQUIRED # 开启加密`）。**sqlnet.ora 不支持行内注释**——参数值会把 `#` 后面的内容一起吞进去，导致 REQUIRED 变成非法值，参数静默失效或报 ORA-12520 类连接错误。注释必须单独成行（如上文的写法）。排查"配置了加密但没生效"时，先看有没有行内注释。

## 客户端：JDBC 连接属性

客户端不需要动配置文件，把加密要求写进连接属性即可：

```java
Properties props = new Properties();
props.setProperty("oracle.net.encryption_client", "REQUIRED");
props.setProperty("oracle.net.encryption_types_client", "(AES256, AES192, AES128)");
props.setProperty("oracle.net.crypto_checksum_client", "REQUIRED");
props.setProperty("oracle.net.crypto_checksum_types_client", "(SHA256, SHA384, SHA512)");
```

属性名和服务端参数一一对应（`SQLNET.ENCRYPTION_SERVER` ↔ `oracle.net.encryption_client`），取值同样是 REJECTED/ACCEPTED/REQUESTED/REQUIRED 四级别。**两端都设 REQUIRED 才能保证链路上没有明文回退的余地**——只有一端 REQUIRED 时，另一端 ACCEPTED/REQUESTED 也可能协商成明文（取决于组合）。

## Java 完整示例

下面用 JDBC thin 驱动演示建立加密连接并执行一次查询：

```java
import java.sql.*;
import java.util.Properties;

public class EncryptedConnectionDemo {
    public static void main(String[] args) {
        String url = "jdbc:oracle:thin:@(DESCRIPTION="
            + "(ADDRESS=(PROTOCOL=TCP)(HOST=192.168.0.24)(PORT=1521))"
            + "(CONNECT_DATA=(SID=orcl)))";

        Properties props = new Properties();
        props.setProperty("user", "user1");
        props.setProperty("password", "password");
        // 原生网络加密：客户端侧要求
        props.setProperty("oracle.net.encryption_client", "REQUIRED");
        props.setProperty("oracle.net.encryption_types_client",
                          "(AES256, AES192, AES128)");
        props.setProperty("oracle.net.crypto_checksum_client", "REQUIRED");
        props.setProperty("oracle.net.crypto_checksum_types_client",
                          "(SHA256, SHA384, SHA512)");

        try (Connection conn = DriverManager.getConnection(url, props)) {
            System.out.println("Connection established with encryption.");

            // USER_USERS 视图描述当前用户，列名是 USERNAME（不是 NAME）
            try (Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery(
                     "SELECT username, account_status FROM user_users")) {
                while (rs.next()) {
                    System.out.println("user: " + rs.getString("USERNAME")
                        + ", status: " + rs.getString("ACCOUNT_STATUS"));
                }
            }
        } catch (SQLException ex) {
            ex.printStackTrace();
        }
    }
}
```

连接串还是普通的 thin 连接，加密由 `props` 里的属性触发。打印出 `Connection established with encryption.` 说明 REQUIRED 级别下协商成功——如果服务端不支持或算法无交集，`getConnection` 会直接抛 SQLException（ORA-12520/ORA-12537 类错误），不会静默降级成明文。

**一处对原文的修正**：原文查询 `SELECT * FROM user_users` 后用 `rs.getString("name")` 取值——`USER_USERS` 数据字典视图**没有 NAME 列**（它的列是 USERNAME、USER_ID、ACCOUNT_STATUS、DEFAULT_TABLESPACE 等，描述当前登录用户），原代码运行到这里会抛 `SQLException: 无效的列索引/列名`。上面的示例已改为取 `USERNAME` 和 `ACCOUNT_STATUS`（依据 Oracle 19c SQL Language Reference 的 USER_USERS 定义）。

## 验证加密真的生效了

连接成功不等于加密生效（一端 REQUIRED 一端配置错误时可能报错，但两端都 ACCEPTED 时会静默明文）。DBA 侧用 `v$session_connect_info` 确认：

```sql
-- 在目标会话里查（或 DBA 按 sid 过滤）
SELECT sid, network_service_banner
FROM v$session_connect_info
WHERE sid = SYS_CONTEXT('USERENV', 'SID');
```

`network_service_banner` 列会显示协商结果，例如 `AES256 Encryption service adapter`——看到具体算法名才算加密在跑；只显示认证相关 banner 而没有 Encryption 字样，说明链路是明文的。

> 注：该验证 SQL 依据 Oracle 19c 参考手册中 V$SESSION_CONNECT_INFO 的定义，未实跑。

## 常见报错

- **ORA-12520 / ORA-12537（TNS 连接被拒）**：两端级别或算法不兼容。排查顺序：① 服务端 sqlnet.ora 有没有行内注释把参数值污染了；② 两端 ENCRYPTION_TYPES 有没有交集；③ 一端 REQUIRED 另一端 REJECTED 的组合直接互斥。
- **配置后性能下降明显**：AES256 + SHA512 的开销最高；吞吐敏感场景可以把算法降到 AES128 + SHA256（安全性对绝大多数内网场景仍然足够），或只开完整性校验不开加密。
- **改了 sqlnet.ora 没生效**：不需要重启实例，但只对**新建连接**生效——连接池里的存量连接还是旧协商结果，重启应用侧连接池再验证。

## 注意事项

- 服务端和客户端的算法列表要有交集，否则协商失败直接连不上——排查"突然连不上数据库"时先对两边的 `ENCRYPTION_TYPES`；改参数前记录原值，回退就是把 REQUIRED 改回 ACCEPTED（或删除该行恢复默认）。
- `REQUIRED` 是硬开关，上线前先在测试环境验证**所有存量客户端**（应用服务器、报表工具、DBA 的 sqlplus、备份软件）都支持加密，避免一刀切把老客户端全拦在门外造成业务中断。
- 校验算法选 SHA256 起步（12c+ 默认值），SHA1/MD5 留给必须兼容老客户端的场景。
- 加密有少量 CPU 开销，高吞吐场景留意服务端负载变化；先压测再全量。
- 原生网络加密防的是"链路窃听/篡改"，不防两端本身——客户端内存里的明文、服务端的数据文件加密（TDE）是另外两层，别混为一谈。
- 本文配置未实跑，参数名与级别语义以所用 Oracle 版本的官方文档为准（不同大版本默认算法有差异）。

## 小结

传输加密这件事，Oracle 原生方案的门槛其实很低：服务端四行参数、客户端四个属性，两端级别和算法对齐即可。真正要花时间的是上线前的兼容面盘点和上线后的 `v$session_connect_info` 验证——配置生效和加密生效，是两件事。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。