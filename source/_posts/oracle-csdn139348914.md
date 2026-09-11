---
title: "Oracle 只读视图与同义词：建视图、授权、回收的完整流程"
date: 2024-06-02 09:15:00
updated: 2026-09-11
categories: [技术]
tags: [Oracle]
copyright_author: 司南
cover: /images/csdn/covers/oracle-csdn139348914.png
---

让某个用户只能查询、不能改动数据，Oracle 里最顺手的组合是"视图 + 只读授权"：把想暴露的列收进视图，再把视图的 SELECT 权限授出去，基表对用户完全不可见。同义词则是在这之上再加一层别名，让跨 schema 的访问更省事。这篇按完整流程走一遍：建视图、授权、回收，最后说同义词的用法和坑。

### 第一步：准备示例表

先建一张 `employees` 基础表并塞两条数据：

```sql
-- 创建 employees 基础表
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

-- 插入示例数据
INSERT INTO employees (employee_id, first_name, last_name, email, phone_number, hire_date, job_id, salary, manager_id, department_id)
VALUES (1, 'John', 'Doe', 'john.doe@example.com', '123-456-7890', SYSDATE, 'IT_PROG', 60000, 101, 10);

INSERT INTO employees (employee_id, first_name, last_name, email, phone_number, hire_date, job_id, salary, manager_id, department_id)
VALUES (2, 'Jane', 'Smith', 'jane.smith@example.com', '321-654-0987', SYSDATE, 'HR_REP', 55000, 102, 20);
```

注意表里有 `salary`、`phone_number` 这类敏感列——后面建视图时会故意把它们排除在外。

### 第二步：创建视图

视图 `employee_overview` 只保留工号、姓名和邮箱：

```sql
-- 创建视图 employee_overview
CREATE VIEW employee_overview AS
SELECT employee_id, first_name, last_name, email
FROM employees;
```

视图本身不存数据，只是一条封装好的查询。敏感列不在视图的 SELECT 列表里，用户通过视图就永远碰不到。

### 第三步：建只读用户并授权

![配图](/images/csdn/figures/oracle-csdn139348914.png)

```sql
-- 创建新用户 readonly_user，密码为 password
CREATE USER readonly_user IDENTIFIED BY password;

-- 赋予连接权限
GRANT CONNECT TO readonly_user;

-- 授予只读权限
GRANT SELECT ON employee_overview TO readonly_user;
```

`GRANT SELECT` 只授了查询，没有 INSERT、UPDATE、DELETE，这就是"只读"的全部来源。用这个账号登录验证一下：

```sql
-- 使用 readonly_user 进行连接
CONNECT readonly_user/password@your_database;

-- 查询视图
SELECT * FROM employee_overview;
```

查询正常返回，而尝试对视图做写操作会直接报权限不足。

### 回收权限

权限收回来同样一条语句：

```sql
-- 撤销用户 readonly_user 对视图 employee_overview 的 SELECT 权限
REVOKE SELECT ON employee_overview FROM readonly_user;
```

### 加一层同义词

同义词（Synonym）是数据库对象的别名。给视图配一个更短的通用名字，用户访问时不用关心视图建在哪个 schema 下：

```sql
-- 登录为 DBA 用户，创建公用同义词
CONNECT dba_user/password@your_database;

-- 创建公用同义词 emp_view 指向视图 employee_overview
CREATE SYNONYM emp_view FOR employee_overview;
```

之后 readonly_user 直接查同义词即可：

```sql
-- 使用同义词 emp_view 来查询视图
SELECT * FROM emp_view;
```

不需要时删除同义词：

```sql
-- 删除同义词 emp_view
DROP SYNONYM emp_view;
```

### 同义词的注意事项与优缺点

用同义词前先知道它的边界：

- **命名冲突**：同一命名空间内，同义词不能和表、视图等其他对象重名。
- **权限要求**：创建同义词的用户必须对目标对象有适当权限。
- **跨库引用**：同义词指向远程数据库对象时，还要配套数据库链接的配置和权限。

它的价值也很清楚：

- **简化访问**：多个用户、多个架构之间共享对象时，一个短名字就能访问。
- **灵活换绑**：底层对象迁移时重新映射同义词即可，应用代码不用改。
- **命名一致**：不同环境用统一命名，减少维护成本。

代价是同义词数量大了以后管理会变复杂，且不合理的映射可能引入安全风险，需要有人盯着。

## 小结

视图负责"暴露哪些数据"，只读授权负责"能对暴露的数据做什么"，同义词负责"叫什么名字"——三者组合起来，就是一套对应用透明、对基表零暴露的只读访问方案。权限的授予与回收都是单条语句，随业务随时调整。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
