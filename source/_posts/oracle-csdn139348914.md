---
title: "Oracle 只读视图与同义词：建视图、授权、回收的完整流程"
date: 2024-06-02 09:15:00
updated: 2026-09-11
categories: [技术]
tags: [Oracle]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1752742111841-f490c48aa668?w=1600&q=80&fm=jpg
---

想让某个用户只能查询、不能改动数据，还要挡住敏感列，Oracle 里最顺手的组合是「视图 + 只读授权」：把想暴露的列收进视图，再把视图的 SELECT 权限授出去，基表对用户完全不可见。同义词在这之上再加一层别名，让跨 schema 的访问更省事。

这篇按场景组织：要给用户只读访问怎么做、要回收权限怎么做、要简化对象名怎么做，最后给一份语句速查表。所有 SQL 为 Oracle 通用语法（11g 及以上适用）。

> 注：Oracle 无法容器化快速验证，本文 SQL 未在真实实例实跑，语法以 Oracle Database SQL Language Reference 为准；执行前请在测试库演练。

## 场景一：给用户只读访问（建表 → 建视图 → 授权）

这是最完整的链路，三步走完得到一个"能查、能查到的列受限、不能改"的账号。

### 准备示例表

先建一张 `employees` 基础表并塞两条数据：

```sql
CREATE TABLE employees (
  employee_id NUMBER PRIMARY KEY,
  first_name VARCHAR2(50),
  last_name VARCHAR2(50),
  email VARCHAR2(50),
  phone_number VARCHAR2(20),
  hire_date DATE,
  job_id VARCHAR2(10),
  salary NUMBER(8,2),
  manager_id NUMBER,
  department_id NUMBER
);

INSERT INTO employees (employee_id, first_name, last_name, email, phone_number,
                       hire_date, job_id, salary, manager_id, department_id)
VALUES (1, 'John', 'Doe', 'john.doe@example.com', '123-456-7890',
        SYSDATE, 'IT_PROG', 60000, 101, 10);

INSERT INTO employees (employee_id, first_name, last_name, email, phone_number,
                       hire_date, job_id, salary, manager_id, department_id)
VALUES (2, 'Jane', 'Smith', 'jane.smith@example.com', '321-654-0987',
        SYSDATE, 'HR_REP', 55000, 102, 20);

COMMIT;
```

注意表里有 `salary`、`phone_number` 这类敏感列——下一步建视图时会故意把它们排除在外。

### 创建视图：决定暴露哪些列

视图 `employee_overview` 只保留工号、姓名和邮箱：

```sql
CREATE VIEW employee_overview AS
SELECT employee_id, first_name, last_name, email
FROM employees;
```

视图本身不存数据，只是一条封装好的查询。**敏感列不在视图的 SELECT 列表里，用户通过视图就永远碰不到**——这是列级隔离的标准做法，比在应用层过滤可靠得多。

### 建只读用户并授权

```sql
-- 创建用户
CREATE USER readonly_user IDENTIFIED BY password;

-- 赋予连接权限（否则登录不了）
GRANT CONNECT TO readonly_user;

-- 授予视图的只读权限
GRANT SELECT ON employee_overview TO readonly_user;
```

`GRANT SELECT` 只授了查询，没有 INSERT、UPDATE、DELETE，这就是"只读"的全部来源。注意授权对象是**视图**不是基表——基表 `employees` 的权限一点都没给出去。

用这个账号登录验证：

```sql
CONNECT readonly_user/password@your_database

SELECT * FROM employee_overview;   -- 正常返回两行，只有四列

SELECT salary FROM employees;      -- ORA-00942: 表或视图不存在（基表不可见）
INSERT INTO employee_overview ...  -- ORA-01031: 权限不足
```

验证点：视图查询成功、基表报 ORA-00942（用户根本"看不到"这张表）、写操作报 ORA-01031。三个都符合预期，只读隔离才算生效。

## 场景二：回收权限

权限收回来同样一条语句，立即生效：

```sql
REVOKE SELECT ON employee_overview FROM readonly_user;
```

回收后该用户再查视图会报 ORA-01031。要彻底清理账号（连登录能力一起收回）：

```sql
REVOKE CONNECT FROM readonly_user;
DROP USER readonly_user;          -- 用户名下还有对象时加 CASCADE
```

## 场景三：用同义词简化对象名

同义词（Synonym）是数据库对象的别名。给视图配一个更短的通用名字，用户访问时不用关心视图建在哪个 schema 下：

```sql
-- 创建同义词 emp_view 指向视图 employee_overview
CREATE SYNONYM emp_view FOR employee_overview;
```

之后 readonly_user 直接查同义词即可：

```sql
SELECT * FROM emp_view;
```

跨 schema 访问时，同义词要指向带 schema 前缀的对象：

```sql
CREATE SYNONYM emp_view FOR hr_schema.employee_overview;
```

这样应用代码里写 `emp_view`，底层对象在哪个 schema、叫什么名字，对应用完全透明。

### 公用同义词 vs 私有同义词

| 类型 | 创建语句 | 可见范围 | 所需权限 |
|------|---------|---------|---------|
| 私有同义词 | `CREATE SYNONYM emp_view FOR ...` | 仅创建者（及被授权用户） | `CREATE SYNONYM` |
| 公用同义词 | `CREATE PUBLIC SYNONYM emp_view FOR ...` | 数据库内所有用户 | `CREATE PUBLIC SYNONYM`（通常 DBA 才有） |

原文写的是"登录为 DBA 用户创建公用同义词"，但语句用的是 `CREATE SYNONYM`（私有）——两者不一致。要建公用同义词必须加 `PUBLIC` 关键字；不加就是私有同义词，只有创建者能用。实际场景中，给单个只读用户用的话，**在 readonly_user 名下建私有同义词**更合适（权限收敛，不污染全局命名空间）：

```sql
-- 以 readonly_user 身份（或 DBA 代建）
GRANT CREATE SYNONYM TO readonly_user;
CREATE SYNONYM emp_view FOR app_schema.employee_overview;
```

不需要时删除同义词：

```sql
DROP SYNONYM emp_view;              -- 私有
DROP PUBLIC SYNONYM emp_view;       -- 公用
```

## 语句速查表

| 目的 | 语句 |
|------|------|
| 建视图（列级隔离） | `CREATE VIEW v AS SELECT 需要的列 FROM 基表;` |
| 建用户 | `CREATE USER u IDENTIFIED BY pwd;` |
| 给登录能力 | `GRANT CONNECT TO u;` |
| 给只读权限 | `GRANT SELECT ON v TO u;` |
| 回收只读权限 | `REVOKE SELECT ON v FROM u;` |
| 删用户 | `DROP USER u [CASCADE];` |
| 建私有同义词 | `CREATE SYNONYM s FOR [schema.]对象;` |
| 建公用同义词 | `CREATE PUBLIC SYNONYM s FOR [schema.]对象;` |
| 删同义词 | `DROP [PUBLIC] SYNONYM s;` |
| 查用户有哪些权限 | `SELECT * FROM dba_tab_privs WHERE grantee='U';` |
| 查同义词映射 | `SELECT * FROM dba_synonyms WHERE synonym_name='S';` |

## 同义词的注意事项与优缺点

用同义词前先知道它的边界：

- **命名冲突**：同一命名空间内，同义词不能和表、视图等其他对象重名；公用同义词与某用户的私有对象重名时，私有对象优先（解析顺序：本 schema 对象 → 私有同义词 → 公用同义词）。
- **权限要求**：创建同义词不需要对目标对象有权限，但**使用时**必须有——同义词只是别名，不做授权。给 readonly_user 建了指向某视图的同义词，但没 GRANT SELECT，查起来照样 ORA-01031。这是最常见的误解。
- **跨库引用**：同义词指向远程数据库对象时，要先建 DATABASE LINK，同义词 FOR 子句里带 `@dblink`，并确认链接的账号权限。

它的价值也很清楚：

- **简化访问**：多个用户、多个 schema 之间共享对象时，一个短名字就能访问。
- **灵活换绑**：底层对象迁移（换 schema、换表名）时，重建同义词指向新对象即可，应用代码一行不改。
- **命名一致**：开发/测试/生产环境用统一命名，减少环境差异带来的维护成本。

代价是同义词数量大了以后管理会变复杂（谁指向谁要靠查 dba_synonyms），且不合理的映射可能引入安全风险——公用同义词等于给全库用户暴露了一个入口名，需要有人盯着。

## 注意事项

- 视图 + `GRANT SELECT` 是只读隔离的核心，同义词只是"起名"，不承担权限职责；漏了 GRANT 只建同义词，用户依然访问不了。
- `GRANT CONNECT` 在 Oracle 中权限已大幅收缩（10g 之后只剩 CREATE SESSION），别指望它带来别的权限；要建同义词需额外 `GRANT CREATE SYNONYM`。
- 视图定义变更（增删列）后，依赖它的同义词和应用代码要同步核对；视图失效时同义词查询会报 ORA-04063。
- 敏感数据隔离要在**视图层**做（不 SELECT 该列），不要指望"授了 SELECT 但应用不显示"——权限层面能查到的数据，就等于暴露了。
- 授权/回收都建议记录在变更单里，定期用 `dba_tab_privs` 审一遍谁对哪些视图有权限。

视图负责"暴露哪些数据"，只读授权负责"能对暴露的数据做什么"，同义词负责"叫什么名字"——三者组合起来，就是一套对应用透明、对基表零暴露的只读访问方案。权限的授予与回收都是单条语句，随业务随时调整。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。