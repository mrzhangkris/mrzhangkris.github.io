---
title: "Oracle Read-Only Views and Synonyms: The Complete Create, Grant, and Revoke Workflow"
date: 2024-06-02 09:15:00
updated: 2026-09-14
lang: en
categories: [Tech, Oracle]
tags: [Oracle]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1752742111841-f490c48aa668?w=1600&q=80&fm=jpg
---

Suppose you want a user to be able to query data but never modify it, while also keeping sensitive columns out of reach. In Oracle, the handiest combination is "view + read-only grant": collect the columns you want to expose into a view, then grant SELECT on the view, and the base tables stay completely invisible to that user. On top of that, synonyms add an aliasing layer that makes cross-schema access painless.

This post is organized by scenario: how to give a user read-only access, how to revoke grants, and how to simplify object names. A quick-reference statement table comes at the end. All SQL is standard Oracle syntax (11g and later).

> Note: Oracle could not be containerized for quick verification here, so the SQL in this post was not executed against a real instance; treat the Oracle Database SQL Language Reference as authoritative, and rehearse on a test database first.

## Scenario 1: Give a User Read-Only Access (Create Table → Create View → Grant)

This is the full chain. Three steps produce an account that "can query, sees only restricted columns, and cannot modify anything."

### Prepare a Sample Table

First create a base `employees` table with two rows:

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

Note that the table contains sensitive columns like `salary` and `phone_number` — the view in the next step deliberately leaves them out.

### Create the View: Decide Which Columns to Expose

The view `employee_overview` keeps only the employee ID, name, and email:

```sql
CREATE VIEW employee_overview AS
SELECT employee_id, first_name, last_name, email
FROM employees;
```

A view stores no data itself; it is just a packaged query. **Sensitive columns are not in the view's SELECT list, so a user going through the view can never touch them** — this is the standard approach to column-level isolation, far more reliable than filtering in the application layer. As a side note, the view's WHERE clause can also do coarse-grained row-level filtering (for example, only expose rows where `department_id = 10`); for row-level security that adapts dynamically to the caller's identity, Oracle's corresponding mechanism is VPD (the `DBMS_RLS` package), which is beyond the scope of this post.

### Create a Read-Only User and Grant Access

```sql
-- Create the user
CREATE USER readonly_user IDENTIFIED BY password;

-- Grant connection privilege (otherwise login fails)
GRANT CONNECT TO readonly_user;

-- Grant read-only privilege on the view
GRANT SELECT ON employee_overview TO readonly_user;
```

`GRANT SELECT` grants querying only — no INSERT, UPDATE, or DELETE. That is the entire basis of "read-only." Note that the grant target is the **view**, not the base table — no privilege on the `employees` base table is handed out at all.

Log in with this account to verify:

```sql
CONNECT readonly_user/password@your_database

SELECT * FROM employee_overview;   -- returns two rows and only four columns, as expected

SELECT salary FROM employees;      -- ORA-00942: table or view does not exist (base table invisible)
INSERT INTO employee_overview ...  -- ORA-01031: insufficient privileges
```

The verification standard: the view query succeeds, the base table raises ORA-00942 (the user simply "cannot see" the table), and write operations raise ORA-01031. Only when all three match expectations has the read-only isolation truly taken effect.

## Scenario 2: Revoke Privileges

Taking a privilege back is equally a single statement, effective immediately:

```sql
REVOKE SELECT ON employee_overview FROM readonly_user;
```

After the revoke, that user's next query on the view raises ORA-01031. To clean up the account completely (taking away login capability too):

```sql
REVOKE CONNECT FROM readonly_user;
DROP USER readonly_user;          -- add CASCADE if the user still owns objects
```

## Scenario 3: Simplify Object Names with Synonyms

A synonym is an alias for a database object. Give the view a shorter, generic name, and users no longer need to care which schema the view lives in:

```sql
-- Create synonym emp_view pointing to the view employee_overview
CREATE SYNONYM emp_view FOR employee_overview;
```

From then on, readonly_user can simply query the synonym:

```sql
SELECT * FROM emp_view;
```

For cross-schema access, the synonym must point to the object with its schema prefix:

```sql
CREATE SYNONYM emp_view FOR hr_schema.employee_overview;
```

Application code then just writes `emp_view`; which schema the underlying object lives in, and what it is called, is fully transparent to the application.

### Public Synonyms vs. Private Synonyms

| Type | Statement | Visible to | Required privilege |
|------|---------|---------|---------|
| Private synonym | `CREATE SYNONYM emp_view FOR ...` | The creator only (plus grantees) | `CREATE SYNONYM` |
| Public synonym | `CREATE PUBLIC SYNONYM emp_view FOR ...` | Every user in the database | `CREATE PUBLIC SYNONYM` (usually DBA-only) |

The source text said "log in as a DBA user and create a public synonym," but the statement used was `CREATE SYNONYM` (private) — the two don't match. To create a public synonym you must add the `PUBLIC` keyword; without it you get a private synonym that only the creator can use. In practice, for serving a single read-only user, **creating a private synonym under readonly_user** fits better (privileges stay contained, and the global namespace stays clean):

```sql
-- As readonly_user (or created on their behalf by a DBA)
GRANT CREATE SYNONYM TO readonly_user;
CREATE SYNONYM emp_view FOR app_schema.employee_overview;
```

When a synonym is no longer needed, drop it:

```sql
DROP SYNONYM emp_view;              -- private
DROP PUBLIC SYNONYM emp_view;       -- public
```

## Quick-Reference Statement Table

| Purpose | Statement |
|------|------|
| Create a view (column-level isolation) | `CREATE VIEW v AS SELECT the needed columns FROM base_table;` |
| Create a user | `CREATE USER u IDENTIFIED BY pwd;` |
| Grant login capability | `GRANT CONNECT TO u;` |
| Grant read-only access | `GRANT SELECT ON v TO u;` |
| Revoke read-only access | `REVOKE SELECT ON v FROM u;` |
| Drop a user | `DROP USER u [CASCADE];` |
| Create a private synonym | `CREATE SYNONYM s FOR [schema.]object;` |
| Create a public synonym | `CREATE PUBLIC SYNONYM s FOR [schema.]object;` |
| Drop a synonym | `DROP [PUBLIC] SYNONYM s;` |
| Check a user's privileges | `SELECT * FROM dba_tab_privs WHERE grantee='U';` |
| Check synonym mappings | `SELECT * FROM dba_synonyms WHERE synonym_name='S';` |

## Synonym Caveats, Pros, and Cons

Know the boundaries before using synonyms:

- **Naming conflicts**: within one namespace, a synonym cannot share a name with a table, view, or other object; when a public synonym collides with some user's private object, the private object wins (resolution order: local schema object → private synonym → public synonym).
- **Privilege requirements**: creating a synonym does not require any privilege on the target object, but **using it** does — a synonym is only an alias and grants nothing. If you create a synonym for readonly_user that points at a view but skip the GRANT SELECT, the query still fails with ORA-01031. This is the most common misconception.
- **Cross-database references**: when a synonym points at an object in a remote database, create a DATABASE LINK first, put `@dblink` in the synonym's FOR clause, and confirm the link account's privileges.

Its value is equally clear:

- **Simplified access**: when multiple users and schemas share objects, one short name grants access.
- **Flexible rebinding**: when the underlying object moves (new schema, new table name), recreate the synonym to point at the new object — not one line of application code changes.
- **Naming consistency**: use uniform naming across dev/test/production to cut the maintenance cost of environment differences.

The cost: once synonyms multiply, administration gets complicated (who points where requires querying dba_synonyms), and unreasonable mappings can introduce security risk — a public synonym effectively exposes an entry-point name to every user in the database, so someone has to keep watch.

## Caveats

- View + `GRANT SELECT` is the core of read-only isolation; synonyms only "name things" and carry no privilege duties. Skipping the GRANT and only creating the synonym still leaves the user unable to access anything.
- `GRANT CONNECT` has been heavily shrunk in Oracle (since 10g it carries only CREATE SESSION) — don't expect anything extra from it; creating a synonym requires an additional `GRANT CREATE SYNONYM`.
- After a view definition changes (columns added or removed), the synonyms and application code that depend on it need a synchronized review; when the view is invalid, synonym queries raise ORA-04063.
- Isolate sensitive data at the **view layer** (don't SELECT the column), and don't count on "SELECT was granted but the app hides it" — data reachable at the privilege level is as good as exposed.
- Record every grant and revoke in a change ticket, and periodically audit who holds privileges on which views via `dba_tab_privs`.

## Summary

The view decides "which data is exposed," the read-only grant decides "what can be done with the exposed data," and the synonym decides "what it is called." Combined, the three form a read-only access scheme that is transparent to applications and exposes nothing of the base tables. Granting and revoking are both single statements, so you can adjust them as the business demands.

> This article was reconstructed from the author's CSDN blog posts from 2020–2024, originally published on CSDN.
