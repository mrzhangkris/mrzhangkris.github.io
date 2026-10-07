---
title: "Oracle Network Transport Encryption: sqlnet.ora Server-Side and JDBC Client Configuration"
date: 2024-06-03 08:45:00
lang: en
updated: 2026-09-14
categories: [Tech, Oracle]
tags: [Oracle, Network Services]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1591913139332-f8172ef511da?w=1600&q=80&fm=jpg
---

The most valuable data lives in the database, yet the transport link between client and server is often running naked — being on the same intranet does not mean being safe. With a packet-capture tool sitting on the link, plaintext SQL statements and result sets are fully exposed. Oracle ships with native network encryption and data integrity checking: the server side is configured in `sqlnet.ora`, the client side in JDBC connection properties, and once both sides line up, encrypted transport is on — no extra certificate infrastructure required (unlike the SSL/TLS wallet approach).

This post records how to configure both ends, a runnable Java example, and three easy-to-hit pitfalls: algorithm negotiation failure, comment syntax, and choosing a weak checksum algorithm.

> Note: Oracle Database cannot be quickly verified in a container, so the configuration in this post was not run against a real instance; the parameter semantics follow the Oracle Database 19c Security Guide and the SQL*Net parameter reference. Always validate in a test environment before going live.

## The Core Mechanism in One Sentence

Oracle native encryption is negotiated when the connection is established: the client and the server each declare "do I want encryption, and which algorithms do I support," and the intersection of the two enables it. Two parameter families control **confidentiality** (ENCRYPTION, against eavesdropping) and **integrity** (CRYPTO_CHECKSUM, against tampering) respectively; they can be toggled independently and are usually configured together.

## Server Side: sqlnet.ora

Add the following to `sqlnet.ora` on the database server (located at `$ORACLE_HOME/network/admin/`):

```conf
# Encryption: required — reject connections that do not encrypt
SQLNET.ENCRYPTION_SERVER = REQUIRED
# Encryption algorithm candidates, negotiated in order
SQLNET.ENCRYPTION_TYPES_SERVER = (AES256, AES192, AES128)
# Integrity check: required
SQLNET.CRYPTO_CHECKSUM_SERVER = REQUIRED
# Checksum algorithms (12c and later: prefer SHA256 and above)
SQLNET.CRYPTO_CHECKSUM_TYPES_SERVER = (SHA256, SHA384, SHA512)
```

What these lines mean:

- `ENCRYPTION_SERVER = REQUIRED`: connection requests without encryption are refused outright. The semantics of the four levels:

| Level | Meaning |
|------|------|
| `REJECTED` | Reject encrypted connections (cannot connect when the peer requires encryption) |
| `ACCEPTED` | Encrypt if the peer requires it; accept plaintext otherwise |
| `REQUESTED` | Actively prefer encryption; fall back to plaintext if the peer does not support it |
| `REQUIRED` | Encryption is mandatory; refuse the connection otherwise |

- `ENCRYPTION_TYPES_SERVER`: algorithms are negotiated in the order listed, preferring AES256 and stepping down to AES128. **The algorithm lists on both ends must have an intersection**, otherwise negotiation fails and the connection cannot be established at all.
- `CRYPTO_CHECKSUM_*`: integrity checking uses hash signatures against tampering. The original article used SHA1 — before 12c, SHA1 was the only option; **from 12c on, MD5/SHA1/SHA256/SHA384/SHA512 are supported with SHA256 as the default**. SHA1 is weak by today's security standards; start new environments at SHA256.

After editing `sqlnet.ora`, restarting the database instance is not required — new connections pick it up immediately (existing connections are unaffected).

### The Comment Syntax Pitfall

The original article used inline `#` comments (`SQLNET.ENCRYPTION_SERVER = REQUIRED # enable encryption`). **sqlnet.ora does not support inline comments** — the parameter value swallows everything after `#`, which turns REQUIRED into an illegal value, making the parameter silently ineffective or producing connection errors of the ORA-12520 variety. Comments must occupy their own line (as in the block above). When troubleshooting "encryption configured but not taking effect," check for inline comments first.

## Client Side: JDBC Connection Properties

The client does not need any config file changes — put the encryption requirements into the connection properties:

```java
Properties props = new Properties();
props.setProperty("oracle.net.encryption_client", "REQUIRED");
props.setProperty("oracle.net.encryption_types_client", "(AES256, AES192, AES128)");
props.setProperty("oracle.net.crypto_checksum_client", "REQUIRED");
props.setProperty("oracle.net.crypto_checksum_types_client", "(SHA256, SHA384, SHA512)");
```

The property names map one-to-one to the server-side parameters (`SQLNET.ENCRYPTION_SERVER` ↔ `oracle.net.encryption_client`), and the values use the same four levels: REJECTED/ACCEPTED/REQUESTED/REQUIRED. **Only REQUIRED on both ends guarantees there is no room for a plaintext fallback on the link** — when only one end is REQUIRED, the other end at ACCEPTED/REQUESTED may still negotiate down to plaintext (depending on the combination).

## Complete Java Example

The following demonstrates establishing an encrypted connection and running one query with the JDBC thin driver:

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
        // Native network encryption: client-side requirements
        props.setProperty("oracle.net.encryption_client", "REQUIRED");
        props.setProperty("oracle.net.encryption_types_client",
                          "(AES256, AES192, AES128)");
        props.setProperty("oracle.net.crypto_checksum_client", "REQUIRED");
        props.setProperty("oracle.net.crypto_checksum_types_client",
                          "(SHA256, SHA384, SHA512)");

        try (Connection conn = DriverManager.getConnection(url, props)) {
            System.out.println("Connection established with encryption.");

            // The USER_USERS view describes the current user; the column is USERNAME (not NAME)
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

The connection string is an ordinary thin connection; encryption is triggered by the properties in `props`. Printing `Connection established with encryption.` means negotiation succeeded at the REQUIRED level — if the server does not support it or the algorithms share no intersection, `getConnection` throws a SQLException outright (errors of the ORA-12520/ORA-12537 family); it never silently degrades to plaintext.

**One correction to the original article**: the original queried `SELECT * FROM user_users` and then read values with `rs.getString("name")` — but the `USER_USERS` data dictionary view **has no NAME column** (its columns are USERNAME, USER_ID, ACCOUNT_STATUS, DEFAULT_TABLESPACE, etc., describing the currently logged-in user), so the original code would throw `SQLException: invalid column index/column name` (original: 「无效的列索引/列名」) at that point. The example above has been fixed to select `USERNAME` and `ACCOUNT_STATUS` (per the USER_USERS definition in the Oracle 19c SQL Language Reference).

## Verifying Encryption Is Actually in Effect

A successful connection does not mean encryption is in effect (when one end is REQUIRED and the other is misconfigured you get errors, but with both ends at ACCEPTED you get silent plaintext). On the DBA side, confirm with `v$session_connect_info`:

```sql
-- Query in the target session (or filter by sid as DBA)
SELECT sid, network_service_banner
FROM v$session_connect_info
WHERE sid = SYS_CONTEXT('USERENV', 'SID');
```

The `network_service_banner` column shows the negotiated result, for example `AES256 Encryption service adapter` — only when you see a concrete algorithm name is encryption actually running; if the banner only shows authentication-related entries without the word Encryption, the link is plaintext.

> Note: this verification SQL follows the V$SESSION_CONNECT_INFO definition in the Oracle 19c Reference Manual; it was not run.

## Common Errors

- **ORA-12520 / ORA-12537 (TNS connection refused)**: incompatible levels or algorithms between the two ends. Troubleshooting order: (1) does the server's sqlnet.ora contain inline comments polluting the parameter values; (2) do the two ENCRYPTION_TYPES lists share an intersection; (3) a REQUIRED-on-one-end + REJECTED-on-the-other combination is mutually exclusive by definition.
- **Noticeable performance drop after enabling**: AES256 + SHA512 carries the highest overhead; for throughput-sensitive workloads, step the algorithms down to AES128 + SHA256 (still sufficient security for the vast majority of intranet scenarios), or enable integrity checking without encryption.
- **sqlnet.ora changed but nothing happened**: no instance restart is needed, but changes apply only to **new connections** — existing connections in the pool keep their old negotiation result. Restart the application-side connection pool and verify again.

## Caveats

- The algorithm lists on server and client must share an intersection, otherwise negotiation fails and connection is impossible — when troubleshooting "the database suddenly cannot be reached," compare the two `ENCRYPTION_TYPES` lists first. Record the original values before changing parameters; rolling back means changing REQUIRED back to ACCEPTED (or deleting the line to restore the default).
- `REQUIRED` is a hard switch. Before going live, verify in a test environment that **every existing client** (application servers, reporting tools, the DBA's sqlplus, backup software) supports encryption — flipping it in one move can lock all legacy clients out and interrupt the business.
- Start checksum algorithms at SHA256 (the 12c+ default); keep SHA1/MD5 only for scenarios that must remain compatible with legacy clients.
- Encryption carries a modest CPU overhead; watch server load in high-throughput scenarios. Load-test first, then roll out.
- Native network encryption defends against link eavesdropping/tampering, not against the two ends themselves — plaintext in client memory and server-side data-file encryption (TDE) are two separate layers; do not conflate them.
- The configuration in this post was not run; for parameter names and level semantics, defer to the official documentation of the Oracle version you use (default algorithms differ across major versions).

## Wrap-up

For transport encryption, Oracle's native approach has a surprisingly low barrier: four server-side parameters, four client-side properties, with levels and algorithms aligned on both ends. What really takes time is the pre-launch compatibility inventory and the post-launch `v$session_connect_info` verification — configuration in effect and encryption in effect are two different things.

> This article was rebuilt from the author's CSDN blog posts published between 2020 and 2024, originally published on CSDN.
