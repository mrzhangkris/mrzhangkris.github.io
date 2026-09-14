---
title: "Oracle 密码复杂度策略：用 Profile 加验证函数管住弱密码"
date: 2024-06-02 09:00:00
updated: 2026-09-14
categories: [技术]
tags: [Oracle, 安全]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1597138768744-9f97be8cdd64?w=1600&q=80&fm=jpg
---

数据库账号被弱密码撞开，是安全事件里最常见的入口之一。Oracle 自带可配置的密码策略机制，能让数据库自己拒绝太弱的密码，不必依赖使用者的自觉。这套机制由两半组成：**Profile 负责策略参数**（锁定时长、有效期），**验证函数负责复杂度规则**（长度、字符种类）。这篇按完整流程走一遍，并指出两个容易翻车的落地细节：验证函数必须建在 SYS schema 下、改 DEFAULT Profile 的影响面。

> 注：Oracle 数据库无法容器化快速验证，本文 SQL 未在真实实例实跑；语法依据 Oracle Database 11g/19c Security Guide 与 SQL Language Reference，上线前务必在测试库演练。

## 密码策略挂在 Profile 上

Oracle 通过 Profile 管理密码策略，默认只有一个叫 DEFAULT 的 Profile，所有未单独指定的用户都在它下面。可以直接改 DEFAULT，但更稳妥的做法是新建一个 Profile 再挂到目标用户上——**改动 DEFAULT 会立即影响所有用户**，包括那些你压根没想起来的应用账号，没有回旋余地。

动策略前有三件事要做在前面：

1. 评估影响面：`SELECT username FROM dba_users WHERE profile='DEFAULT';` 列出会被波及的全部账号；
2. 做好备份（记录当前 Profile 参数：`SELECT * FROM dba_profiles WHERE profile='DEFAULT';`），必要时能回滚；
3. 先挂到测试账号上验证，确认不会误伤业务用户——尤其是 `FAILED_LOGIN_ATTEMPTS`，连接池配置错密码的账号会在策略生效瞬间被批量锁定。

## 第一步：建一个带安全限制的 Profile

假设新 Profile 命名为 `SECURE_PROFILE`：

```sql
CREATE PROFILE SECURE_PROFILE LIMIT
  FAILED_LOGIN_ATTEMPTS 5          -- 密码错误尝试次数，超过锁定账号
  PASSWORD_LIFE_TIME 90            -- 密码有效期 90 天
  PASSWORD_REUSE_TIME 365          -- 一年内不能重复使用旧密码
  PASSWORD_REUSE_MAX 10            -- 密码历史保留 10 个，范围内不许重用
  PASSWORD_VERIFY_FUNCTION verify_function  -- 调用密码验证函数
  PASSWORD_LOCK_TIME 1/24          -- 锁定时长，1/24 天 = 1 小时
  PASSWORD_GRACE_TIME 7;           -- 密码过期前 7 天宽限期（登录时提醒）
```

每行的含义都在注释里：连续输错 5 次锁 1 小时，密码 90 天强制更换，一年内（或最近 10 个历史密码范围内）不许重用旧密码，过期前还有 7 天宽限期提示改密。

`PASSWORD_REUSE_TIME` 和 `PASSWORD_REUSE_MAX` 的关系值得说清：两个参数是"或"的关系，任一条件满足即禁止重用——365 天内的旧密码不能用，超过 365 天但在最近 10 个历史之内的也不能用。想彻底禁止重用就把两个值都设 `UNLIMITED`。

`PASSWORD_VERIFY_FUNCTION` 这一行是核心，它把"密码够不够复杂"的判断交给了验证函数——但注意，**这一步能否成功取决于函数建在哪**，见第二步。

## 第二步：自定义验证函数（必须建在 SYS 下）

Profile 只负责"调用哪个函数"，真正的复杂度规则写在函数里。**落地的第一个坑：密码验证函数必须由 SYS 用户创建**——这是 Oracle 的硬性规定，普通 DBA 账号建的函数挂到 Profile 上会直接报：

```text
ORA-28034: cannot use specified password verification function
```

Oracle 官方在 `$ORACLE_HOME/rdbms/admin/utlpwdmg.sql` 里提供了标准模板（11g 起自带 verify_function_11G 现成函数；19c 的该脚本还提供 ora12c_verify_function、ora12c_strong_verify_function 等更强的现成模板），自定义时照它的模式来：用 SYS 登录，创建函数，然后才能被 Profile 引用。

下面的版本要求密码至少 8 位，且同时包含数字、大小写字母和特殊字符：

```sql
-- 以 SYS 身份连接后执行
CREATE OR REPLACE FUNCTION sys.verify_function (
  username VARCHAR2,
  password VARCHAR2,
  old_password VARCHAR2)
RETURN BOOLEAN IS
BEGIN
  -- 密码不能和用户名相同
  IF LOWER(password) = LOWER(username) THEN
    raise_application_error(-20001,
      'Password must not be the same as the username.');
  END IF;

  -- 检查密码长度，至少 8 个字符
  IF LENGTH(password) < 8 THEN
    raise_application_error(-20002,
      'Password length must be at least 8 characters.');
  END IF;

  -- 检查是否包含数字
  IF REGEXP_LIKE(password, '[0-9]') = FALSE THEN
    raise_application_error(-20003,
      'Password must contain at least one numeric character.');
  END IF;

  -- 检查是否包含小写字母
  IF REGEXP_LIKE(password, '[a-z]') = FALSE THEN
    raise_application_error(-20004,
      'Password must contain at least one lowercase letter.');
  END IF;

  -- 检查是否包含大写字母
  IF REGEXP_LIKE(password, '[A-Z]') = FALSE THEN
    raise_application_error(-20005,
      'Password must contain at least one uppercase letter.');
  END IF;

  -- 检查是否包含特殊字符
  IF REGEXP_LIKE(password, '[\@\$\#\%\!\&]') = FALSE THEN
    raise_application_error(-20006,
      'Password must contain at least one special character (@,$,#,%,!,&).');
  END IF;

  RETURN TRUE;
END;
/
```

函数用正则逐项检查四类字符，任何一项不满足就抛出自定义错误，用户改密码时会直接看到是哪条规则没过——错误信息写清楚"缺什么"，比一句"密码不符合策略"能省掉大量来回询问。函数签名（username/password/old_password 三参数、返回 BOOLEAN）是 Oracle 规定的固定形式，不能增删参数；old_password 可用于"新旧密码相似度检查"，完整实现参考 utlpwdmg.sql 的 verify_function_11G 模板，按需裁剪。

**执行顺序**：函数必须先于 Profile 存在——`CREATE PROFILE ... PASSWORD_VERIFY_FUNCTION verify_function` 在函数不存在时会报 ORA-02376 类无效资源错误。先建函数、再建 Profile、最后挂用户，三步顺序不能乱。

## 第三步：把 Profile 应用到用户

```sql
ALTER USER username PROFILE SECURE_PROFILE;
```

这一句执行完，该用户的密码策略立即切换。验证方式：

```sql
SELECT username, profile FROM dba_users WHERE username = 'USERNAME';
```

确认 profile 列显示 SECURE_PROFILE 即生效。

## 验证策略真的在工作

用测试账号走一遍完整闭环：

```sql
-- 1. 弱密码应该被拒绝（报出自定义错误号）
ALTER USER test_user IDENTIFIED BY abc;
-- 预期：ORA-20002: Password length must be at least 8 characters.

-- 2. 达标的复杂密码应该成功
ALTER USER test_user IDENTIFIED BY 'Xk9#mP2$vL';
-- 预期：User altered.

-- 3. 连续错 5 次密码，账号应被锁定
-- （用错误密码尝试登录 5 次后）
SELECT username, account_status FROM dba_users
WHERE username = 'TEST_USER';
-- 预期：ACCOUNT_STATUS 显示 LOCKED（或 LOCKED(TIMED)，1 小时后自动解锁）

-- 4. 手动解锁（DBA 操作）
ALTER USER test_user ACCOUNT UNLOCK;
```

验证标准：弱密码被函数拦截且错误信息能定位到具体规则、强密码正常通过、错误尝试到阈值自动锁定、`ACCOUNT UNLOCK` 能解锁。四项全过，策略才算落地。

## 实践中的调整

上线前还有几点值得花时间：

- 复杂度阈值要结合业务和安全标准定，过严会导致用户把密码贴在显示器上——安全策略的失败模式往往是"绕开策略"而不是"遵守策略"。
- 策略生效前通知所有受影响用户，附上修改密码的指引；`PASSWORD_LIFE_TIME` 到期的那天，不知情用户的连接会直接失败。
- 应用账号（连接池用的）和业务账号分开对待：应用账号密码改动要同步改连接配置，改密窗口和应用发布窗口要协调。
- 对确有特殊需求的账号（监控、备份等改密代价高的），单独建一个宽松些的 Profile 作为例外，而不是给所有人开口子。

## 常见报错

- **ORA-28034: cannot use specified password verification function**：函数不是 SYS 建的，或函数编译无效（`SELECT object_name, status FROM dba_objects WHERE object_name='VERIFY_FUNCTION';` 查状态）。用 SYS 重建函数。
- **ORA-28007: the password cannot be reused**：撞上了 PASSWORD_REUSE_TIME/MAX 限制，换不在历史里的密码。
- **ORA-28000: the account is locked**：错误尝试超限或 DBA 手动锁定，`ALTER USER ... ACCOUNT UNLOCK` 解锁；频繁出现说明某个应用的密码配置错了，去连接配置里找。
- **策略"不生效"**：检查用户挂的 Profile（`dba_users.profile`）——新用户建出来默认挂 DEFAULT，你改的是 SECURE_PROFILE 的话，没执行 `ALTER USER ... PROFILE` 这一步等于白配。

## 注意事项

- 验证函数必须建在 SYS schema 下，普通账号建的挂不上去（ORA-28034）；官方 utlpwdmg.sql 有标准模板，自定义优先照它改。
- 执行顺序：先建函数 → 再建 Profile → 最后挂用户，顺序反了会报错。
- 修改现有 Profile 的策略会立即影响其下所有用户，先用 dba_users 评估影响面再动手；直接改 DEFAULT 等于全库生效，慎之又慎。
- 策略变更前备份相关配置（dba_profiles 查询结果留存），保留回滚路径：`ALTER PROFILE ... LIMIT 参数 UNLIMITED` 可逐项恢复。
- 新策略先在测试账号上跑一遍完整闭环（弱密码拒绝、强密码通过、锁定、解锁），确认不会意外锁定业务用户。
- 特殊账号走例外 Profile，不要为个别需求放松全局策略。
- 本文 SQL 未实跑，执行计划外的报错以所用 Oracle 版本的官方文档为准。

## 小结

Profile 管参数、SYS 函数管复杂度、`ALTER USER` 管挂载——三步搭起来的密码策略是数据库侧的"硬约束"，比任何制度文档都可靠。记住两个落地细节（函数建在 SYS 下、先函数后 Profile），策略就不会卡在 ORA-28034 上。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。