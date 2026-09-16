---
title: "Oracle Password Complexity Policy: Locking Down Weak Passwords with a Profile and a Verification Function"
date: 2024-06-02 09:00:00
updated: 2026-09-14
categories: [Tech, Oracle]
tags: [Oracle, Security]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1597138768744-9f97be8cdd64?w=1600&q=80&fm=jpg
lang: en
---

Database accounts opened through weak passwords are one of the most common entry points in security incidents. Oracle ships a configurable password policy mechanism that lets the database itself reject passwords that are too weak, without relying on users' self-discipline. The mechanism has two halves: **the Profile holds the policy parameters** (lockout duration, expiration), and **the verification function holds the complexity rules** (length, character classes). This post walks through the complete procedure and points out two details that are easy to get wrong in production: the verification function must be created under the SYS schema, and the blast radius of modifying the DEFAULT Profile.

> Note: An Oracle database cannot be containerized for quick verification, so the SQL in this post has not been run against a real instance; the syntax follows the Oracle Database 11g/19c Security Guide and the SQL Language Reference. Always rehearse on a test database before going live.

## Password Policy Hangs Off the Profile

Oracle manages password policy through Profiles. By default there is exactly one Profile named DEFAULT, and every user without an explicit assignment lives under it. You can modify DEFAULT directly, but the safer approach is to create a new Profile and attach it to the target user — **changing DEFAULT immediately affects every user**, including application accounts you never think about, with no room to roll back.

Three things to do before touching the policy:

1. Assess the blast radius: `SELECT username FROM dba_users WHERE profile='DEFAULT';` lists every account that will be affected;
2. Take a backup (record the current Profile parameters: `SELECT * FROM dba_profiles WHERE profile='DEFAULT';`) so you can roll back if needed;
3. Attach the Profile to a test account first and confirm it does not hurt business users — especially with `FAILED_LOGIN_ATTEMPTS`: accounts in a connection pool configured with a wrong password will get locked out en masse the moment the policy takes effect.

## Step 1: Create a Profile with Security Limits

Suppose the new Profile is named `SECURE_PROFILE`:

```sql
CREATE PROFILE SECURE_PROFILE LIMIT
  FAILED_LOGIN_ATTEMPTS 5          -- failed password attempts before the account is locked
  PASSWORD_LIFE_TIME 90            -- password valid for 90 days
  PASSWORD_REUSE_TIME 365          -- old passwords cannot be reused within a year
  PASSWORD_REUSE_MAX 10            -- keep 10 historical passwords; no reuse within that range
  PASSWORD_VERIFY_FUNCTION verify_function  -- invoke the password verification function
  PASSWORD_LOCK_TIME 1/24          -- lockout duration, 1/24 day = 1 hour
  PASSWORD_GRACE_TIME 7;           -- 7-day grace period before expiry (warning at login)
```

The meaning of each line is in the comments: 5 consecutive wrong attempts locks the account for 1 hour, passwords are force-rotated every 90 days, old passwords cannot be reused within a year (or within the last 10 historical passwords), and there is a 7-day grace period with a change reminder before expiration.

The relationship between `PASSWORD_REUSE_TIME` and `PASSWORD_REUSE_MAX` deserves a clear explanation: the two parameters are an "or" — reuse is forbidden once either condition is met — old passwords within 365 days cannot be used, and neither can passwords older than 365 days that still fall within the last 10 historical ones. To ban reuse outright, set both to `UNLIMITED`.

The `PASSWORD_VERIFY_FUNCTION` line is the core: it hands the "is this password complex enough" judgment to the verification function — but note, **whether this step succeeds depends on where the function lives**, see Step 2.

## Step 2: The Custom Verification Function (Must Be Created Under SYS)

The Profile only decides "which function to call"; the actual complexity rules live inside the function. **The first production pitfall: the password verification function must be created by the SYS user** — this is a hard Oracle requirement. A function created by an ordinary DBA account and attached to a Profile fails outright with:

```text
ORA-28034: cannot use specified password verification function
```

Oracle officially provides a standard template at `$ORACLE_HOME/rdbms/admin/utlpwdmg.sql` (11g ships the ready-made verify_function_11G; the 19c version of the script also offers stronger ready-made templates such as ora12c_verify_function and ora12c_strong_verify_function). When customizing, follow its pattern: log in as SYS, create the function, and only then can the Profile reference it.

The version below requires a password of at least 8 characters containing digits, upper- and lowercase letters, and special characters:

```sql
-- Run after connecting as SYS
CREATE OR REPLACE FUNCTION sys.verify_function (
  username VARCHAR2,
  password VARCHAR2,
  old_password VARCHAR2)
RETURN BOOLEAN IS
BEGIN
  -- The password must not match the username
  IF LOWER(password) = LOWER(username) THEN
    raise_application_error(-20001,
      'Password must not be the same as the username.');
  END IF;

  -- Check password length, at least 8 characters
  IF LENGTH(password) < 8 THEN
    raise_application_error(-20002,
      'Password length must be at least 8 characters.');
  END IF;

  -- Check for digits
  IF REGEXP_LIKE(password, '[0-9]') = FALSE THEN
    raise_application_error(-20003,
      'Password must contain at least one numeric character.');
  END IF;

  -- Check for lowercase letters
  IF REGEXP_LIKE(password, '[a-z]') = FALSE THEN
    raise_application_error(-20004,
      'Password must contain at least one lowercase letter.');
  END IF;

  -- Check for uppercase letters
  IF REGEXP_LIKE(password, '[A-Z]') = FALSE THEN
    raise_application_error(-20005,
      'Password must contain at least one uppercase letter.');
  END IF;

  -- Check for special characters
  IF REGEXP_LIKE(password, '[\@\$\#\%\!\&]') = FALSE THEN
    raise_application_error(-20006,
      'Password must contain at least one special character (@,$,#,%,!,&).');
  END IF;

  RETURN TRUE;
END;
/
```

The function uses regular expressions to check the four character classes one by one, and throws a custom error the moment any check fails — users changing their password see exactly which rule failed. An error message that says "what's missing" saves far more back-and-forth than a generic "password does not meet policy". The function signature (the username/password/old_password three parameters, returning BOOLEAN) is a fixed form mandated by Oracle; you cannot add or remove parameters. old_password can be used for "new/old password similarity checks"; for a full implementation refer to the verify_function_11G template in utlpwdmg.sql and trim it to taste.

**Execution order**: the function must exist before the Profile — `CREATE PROFILE ... PASSWORD_VERIFY_FUNCTION verify_function` raises an invalid resource error of the ORA-02376 family if the function does not exist. Create the function first, then the Profile, then attach users — the order of the three steps cannot be shuffled.

## Step 3: Apply the Profile to a User

```sql
ALTER USER username PROFILE SECURE_PROFILE;
```

The moment this statement runs, the user's password policy switches over. To verify:

```sql
SELECT username, profile FROM dba_users WHERE username = 'USERNAME';
```

Confirm the profile column shows SECURE_PROFILE and the policy is live.

## Verify the Policy Actually Works

Walk a test account through the complete loop:

```sql
-- 1. A weak password should be rejected (raises the custom error number)
ALTER USER test_user IDENTIFIED BY abc;
-- Expected: ORA-20002: Password length must be at least 8 characters.

-- 2. A complex password that meets the bar should succeed
ALTER USER test_user IDENTIFIED BY 'Xk9#mP2$vL';
-- Expected: User altered.

-- 3. Five consecutive wrong passwords should lock the account
-- (after 5 login attempts with a wrong password)
SELECT username, account_status FROM dba_users
WHERE username = 'TEST_USER';
-- Expected: ACCOUNT_STATUS shows LOCKED (or LOCKED(TIMED), auto-unlocked after 1 hour)

-- 4. Manual unlock (DBA operation)
ALTER USER test_user ACCOUNT UNLOCK;
```

Acceptance criteria: weak passwords are intercepted by the function with an error that pinpoints the rule, strong passwords pass normally, wrong attempts auto-lock at the threshold, and `ACCOUNT UNLOCK` releases the account. Only when all four pass is the policy truly in place.

## Tuning in Practice

A few points worth the time before go-live:

- Set complexity thresholds against your business and security standards. Overly strict rules push users to stick passwords on their monitors — the failure mode of a security policy is usually "bypassing the policy", not "following it".
- Notify every affected user before the policy takes effect, with instructions on changing passwords; on the day `PASSWORD_LIFE_TIME` expires, connections from unaware users will simply fail.
- Treat application accounts (used by connection pools) differently from business accounts: changing an application account's password requires updating connection configs, so the password-change window must be coordinated with the application release window.
- For accounts with genuinely special needs (monitoring, backup — anything where rotation is costly), create a separate, looser Profile as an exception rather than opening a loophole for everyone.

## Common Errors

- **ORA-28034: cannot use specified password verification function**: the function was not created by SYS, or it compiled invalid (check with `SELECT object_name, status FROM dba_objects WHERE object_name='VERIFY_FUNCTION';`). Recreate the function as SYS.
- **ORA-28007: the password cannot be reused**: you hit the PASSWORD_REUSE_TIME/MAX limits; pick a password outside the history.
- **ORA-28000: the account is locked**: too many failed attempts or a manual DBA lock; unlock with `ALTER USER ... ACCOUNT UNLOCK`. If it happens frequently, some application has a wrong password in its connection config — go look there.
- **Policy "not taking effect"**: check which Profile the user is attached to (`dba_users.profile`) — new users are created under DEFAULT by default; if you modified SECURE_PROFILE but never ran `ALTER USER ... PROFILE`, the configuration went nowhere.

## Caveats

- The verification function must be created under the SYS schema; one created by an ordinary account cannot be attached (ORA-28034). The official utlpwdmg.sql has a standard template — base your customization on it.
- Execution order: function first → then Profile → then attach users. Reversing the order raises errors.
- Modifying an existing Profile's policy immediately affects all of its users; assess the blast radius with dba_users first. Modifying DEFAULT directly is effectively database-wide — proceed with extreme caution.
- Back up the relevant configuration before any policy change (keep the dba_profiles query output) to preserve a rollback path: `ALTER PROFILE ... LIMIT parameter UNLIMITED` restores items one by one.
- Run the full loop on a test account first (weak rejected, strong accepted, lock, unlock) to confirm no business user gets locked out accidentally.
- Special accounts get an exception Profile; never loosen the global policy for one-off needs.
- The SQL in this post was not run against a live instance; for errors beyond the plan, defer to the official documentation of your Oracle version.

## Summary

The Profile manages parameters, the SYS-owned function manages complexity, and `ALTER USER` manages attachment — the password policy assembled from these three steps is a "hard constraint" on the database side, more reliable than any policy document. Remember the two production details (create the function under SYS, function before Profile) and the policy will never stall on ORA-28034.

> This article was rewritten from the author's CSDN blog posts originally published between 2020 and 2024.
