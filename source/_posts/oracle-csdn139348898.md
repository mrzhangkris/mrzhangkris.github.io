---
title: "Oracle 密码复杂度策略：用 Profile 加验证函数管住弱密码"
date: 2024-06-02 09:00:00
updated: 2026-09-11
categories: [技术]
tags: [Oracle, 安全]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1597138768744-9f97be8cdd64?w=1600&q=80&fm=jpg
---

数据库账号被弱密码撞开，是安全事件里最常见的入口之一。Oracle 自带可配置的密码策略机制，能让数据库自己拒绝太弱的密码，不必依赖使用者的自觉。这篇记录如何用 Profile 搭配自定义验证函数，把密码复杂度策略真正落地。

### 密码策略挂在 Profile 上

Oracle 通过 Profile 管理密码策略，默认只有一个叫 DEFAULT 的 Profile，所有未单独指定的用户都在它下面。可以直接改 DEFAULT，但更稳妥的做法是新建一个 Profile 再挂到目标用户上——改动 DEFAULT 会立即影响所有用户，没有回旋余地。

动策略前有三件事要做在前面：评估对现有用户的影响（策略一生效，用这个 Profile 的人马上受约束）；做好备份，必要时能回滚；先挂到测试账号上验证，确认不会误伤业务用户。

### 建一个带安全限制的 Profile

假设新 Profile 命名为 `SECURE_PROFILE`：

![配图](/images/csdn/figures/oracle-csdn139348898.png)

```sql
-- 创建包含密码复杂度策略的新Profile
CREATE PROFILE SECURE_PROFILE LIMIT
  FAILED_LOGIN_ATTEMPTS 5       -- 密码错误尝试次数，超过将锁定账号
  PASSWORD_LIFE_TIME 90         -- 密码有效期为90天
  PASSWORD_REUSE_TIME 365       -- 一年内不能重复使用旧密码
  PASSWORD_REUSE_MAX 10         -- 重复使用旧密码的最大次数
  PASSWORD_VERIFY_FUNCTION verify_function -- 调用密码验证函数
  PASSWORD_LOCK_TIME 1/24       -- 错误尝试锁定账号时间，1小时
  PASSWORD_GRACE_TIME 7;        -- 密码过期前7天的宽限期
```

每行的含义都在注释里：连续输错 5 次锁 1 小时，密码 90 天强制更换，一年内不许重用旧密码，过期前还有 7 天宽限期。`PASSWORD_VERIFY_FUNCTION` 这一行是核心，它把"密码够不够复杂"的判断交给了下面的函数。

### 自定义验证函数 verify_function

Profile 只负责"调用哪个函数"，真正的复杂度规则写在函数里。下面这个版本要求密码至少 8 位，且同时包含数字、大小写字母和特殊字符：

```sql
-- 创建密码验证函数
CREATE OR REPLACE FUNCTION verify_function (
  username VARCHAR2,
  password VARCHAR2,
  old_password VARCHAR2)
RETURN BOOLEAN IS
BEGIN
  -- 检查密码长度，至少8个字符
  IF LENGTH(password) < 8 THEN
    raise_application_error(-20001, 'Password length must be at least 8 characters.');
  END IF;

  -- 检查是否包含数字
  IF REGEXP_LIKE(password, '[0-9]') = FALSE THEN
    raise_application_error(-20002, 'Password must contain at least one numeric character.');
  END IF;

  -- 检查是否包含小写字母
  IF REGEXP_LIKE(password, '[a-z]') = FALSE THEN
    raise_application_error(-20003, 'Password must contain at least one lowercase letter.');
  END IF;

  -- 检查是否包含大写字母
  IF REGEXP_LIKE(password, '[A-Z]') = FALSE THEN
    raise_application_error(-20004, 'Password must contain at least one uppercase letter.');
  END IF;

  -- 检查是否包含特殊字符
  IF REGEXP_LIKE(password, '[\@\$\#\%\!\&]') = FALSE THEN
    raise_application_error(-20005, 'Password must contain at least one special character (@, $, #, %, !, &).');
  END IF;

  RETURN TRUE;
END;
/
```

函数用正则逐项检查四类字符，任何一项不满足就抛出自定义错误，用户改密码时会直接看到是哪条规则没过。规则不满意可以按需增删分支。

### 把 Profile 应用到用户

```plsql
-- 将Profile应用到用户
ALTER USER username PROFILE SECURE_PROFILE;
```

这一句执行完，该用户的密码策略立即切换。

### 实践中的调整

上线前还有几点值得花时间：复杂度阈值要结合业务和安全标准定，过严会导致用户把密码贴在显示器上；策略生效前通知所有受影响用户，附上修改密码的指引；对确有特殊需求的账号，单独建一个宽松些的 Profile 作为例外，而不是给所有人开口子。

## 注意事项

- 修改现有 Profile 的策略会立即影响其下所有用户，先评估再动手。
- 策略变更前备份相关配置，保留回滚路径。
- 新策略先在测试账号上跑一遍，确认不会意外锁定业务用户。
- 特殊账号走例外 Profile，不要为个别需求放松全局策略。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
