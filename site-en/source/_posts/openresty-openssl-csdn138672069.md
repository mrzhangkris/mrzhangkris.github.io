---
title: "OpenResty Build Fails to Find OpenSSL: Root Cause and Three Fixes"
date: 2024-05-10 16:40:43
updated: 2026-09-14
lang: en
categories: [Tech, Nginx]
tags: [Nginx]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1611677806845-363fccca2c51?w=1600&q=80&fm=jpg
---

When you compile OpenResty yourself and want to use the OpenSSL already installed on the system (say, under `/usr/local/openssl`), the configure or make stage often fails outright complaining that OpenSSL cannot be found — missing headers, a nonexistent `config` script, or missing library files, with the error taking different shapes. This is not because OpenSSL is not installed; it is because the semantics of the `--with-openssl` option are not what you assume. This article fully reproduces and fixes the problem in a debian:12 container with OpenResty-1.27.1.1 (corresponding to nginx 1.27.1) + OpenSSL 3.3.1: first the error, then the root cause, and finally three fixes (the first two were both verified by compilation).

## The Error

Write the configure command as `./configure --with-openssl=/usr/local/openssl` (that directory is the standard layout produced by `make install_sw`: include/lib sitting directly under it), configure runs just fine, and the make stage blows up with the real error:

![Figure 1: Error reproduction](/images/csdn/figures/openresty-openssl-csdn138672069.png)

`/bin/sh: 3: ./config: not found` — make tries to execute `./config` inside `/usr/local/openssl`, but the install directory contains no such script. Historically this misuse has also surfaced in two other forms (depending on version and flow differences):

```text
make[1]: *** /usr/local/openssl/.openssl/include/openssl/ssl.h: No such file or directory
/usr/local/openssl/lib/libssl.a: No such file or directory
```

> Note: the three forms in the error-quotes section are verbatim records from the original (nginx 1.19.9 era) scenario; Figure 1 in this article is the error as measured under 1.27.1.1, and the actual error shape depends on your environment.

Trigger condition: you ran `./configure --with-openssl=/usr/local/openssl`, and that path points to an **installed** OpenSSL (standard layout: include/lib sitting directly under it).

## Root Cause: --with-openssl Expects a Source Tree, Not an Install Directory

The wording of this option in nginx's official `configure --help` deserves a word-by-word read:

```text
--with-openssl=DIR    set path to OpenSSL library sources
```

**sources** — it wants the OpenSSL **source directory**. The build rule generated at configure time (as measured in the objs/Makefile of nginx 1.27.1 inside OpenResty 1.27.1.1) is:

![Figure 2: Root cause](/images/csdn/figures/openresty-openssl-csdn138672069-1.png)

nginx executes `cd DIR && ./config && make && make install_sw` on the directory pointed to by `--with-openssl` — treating it as an OpenSSL source tree, running the build inside it, installing the artifacts into the `DIR/.openssl` subdirectory, then taking headers and static libraries from `.openssl/include` and `.openssl/lib`.

So when you pass in an **installed** OpenSSL directory, two layers of mismatch appear:

1. The directory lacks the `config` script and Makefile needed for a source build, so the `cd DIR && ./config` step breaks;
2. Even if some environment skipped the build step, the subsequently assembled `$OPENSSL/.openssl/include` path carries one extra `.openssl` level compared to the standard layout, so the headers cannot be found.

## Fixes

### Fix 1 (recommended): Point cc-opt/ld-opt at the Installed OpenSSL

An installed OpenSSL should be wired in through "compiler/linker flags" in the first place — this is the standard channel nginx officially provides:

```bash
./configure \
  --with-cc-opt="-I/usr/local/openssl/include" \
  --with-ld-opt="-L/usr/local/openssl/lib"
```

The same applies to OpenResty (its configure passes these two flags through to the internal nginx build). No build script needs changing, and the path semantics are crystal clear: where the headers are, where the libs are. One detail from this test: with only `-L` added, compilation and linking pass, but `openresty -V` prints `built with OpenSSL 3.3.1 (running with OpenSSL 3.0.20)` — what gets loaded at runtime is actually the distro's system library, a header/runtime version mismatch and a hidden risk. After adding `-Wl,-rpath,/usr/local/openssl/lib` to `ld-opt` (or explicitly static-linking the `.a`) and recompiling and reinstalling, `-V` shows only `built with OpenSSL 3.3.1`, and `ldd` confirms `libssl.so.3 => /usr/local/openssl/lib/libssl.so.3` — that is what "actually using 3.3.1" means.

### Fix 2: Pass the OpenSSL Source Directory to --with-openssl

If your intent is "have nginx statically compile a specific OpenSSL version" (common for production builds, where version control matters), the correct usage is to download the OpenSSL **source tarball**, unpack it, and pass the source directory:

```bash
wget https://www.openssl.org/source/openssl-3.3.1.tar.gz
tar -zxf openssl-3.3.1.tar.gz
./configure --with-openssl=/path/to/openssl-3.3.1
```

nginx completes the OpenSSL build inside the source directory (artifacts land in its `.openssl` subdirectory) and then links it into nginx — this is exactly what the option was designed for. In this test, passing OpenSSL 3.3.1's source directory to `--with-openssl` on OpenResty 1.27.1.1, `make` passed in one go, generating `.openssl/lib/libssl.a` and `libcrypto.a` under the source directory.

### Fix 3 (the original article's approach): Hand-Edit the Build Script to Match the Standard Layout

Historically there was another approach: directly editing the path concatenation in nginx's build script. Open (OpenResty's nginx source lives in the build directory):

```text
openresty-1.27.1.1/build/nginx-1.27.1/auto/lib/openssl/conf
```

Original content (as measured, lines 43-46 of the nginx 1.27.1 source; in the 1.19.9 era it was lines 39-42, line numbers drift between versions, so trust the result of grepping `\.openssl`):

```conf
CORE_INCS="$CORE_INCS $OPENSSL/.openssl/include"
CORE_DEPS="$CORE_DEPS $OPENSSL/.openssl/include/openssl/ssl.h"
CORE_LIBS="$CORE_LIBS $OPENSSL/.openssl/lib/libssl.a"
CORE_LIBS="$CORE_LIBS $OPENSSL/.openssl/lib/libcrypto.a"
```

Remove `/.openssl` from the four paths so they match the standard layout:

```conf
CORE_INCS="$CORE_INCS $OPENSSL/include"
CORE_DEPS="$CORE_DEPS $OPENSSL/include/openssl/ssl.h"
CORE_LIBS="$CORE_LIBS $OPENSSL/lib/libssl.a"
CORE_LIBS="$CORE_LIBS $OPENSSL/lib/libcrypto.a"
```

These four lines, in order: add the OpenSSL header directory to the compile flags, declare the dependency on `ssl.h`, and link the two static libraries `libssl.a` and `libcrypto.a`.

But be clear about this approach's limits: it only changes "where files are taken from" and **does not eliminate the `cd DIR && ./config` step in the build rules** (in auto/lib/openssl/make, as measured at line 67 of the nginx 1.27.1 source), so it still breaks when the directory has no config script. It therefore applies only if the directory you pass in also contains a usable config script (for example a fully built OpenSSL source tree with `.openssl` flattened out), or if your OpenResty version's build flow happens to skip the config step. **Prefer Fix 1 and keep this as a fallback.**

## On 64-Bit Systems, Take One More Look

When recompiling after the edit, if the error is `/usr/local/openssl/lib/libssl.a: No such file or directory` — the headers are now found and it is stuck on the library file — chances are this machine installed the 64-bit libraries into a `lib64` directory. Take a look with `ls /usr/local/openssl`; if it is `lib64`, change every `lib` in the script/flags to `lib64`:

```conf
CORE_LIBS="$CORE_LIBS $OPENSSL/lib64/libssl.a"
CORE_LIBS="$CORE_LIBS $OPENSSL/lib64/libcrypto.a"
```

For Fix 1, the corresponding form becomes `--with-ld-opt="-L/usr/local/openssl/lib64"`.

## Verify the Fix

After rerunning configure + make + install, verify two things:

```bash
# 1. The build artifact exists
ls -lh build/nginx-1.27.1/objs/nginx     # OpenResty builds under the build directory

# 2. Confirm OpenSSL is linked in (version matches)
/usr/local/openresty/bin/openresty -V 2>&1 | grep -i openssl
ldd /usr/local/openresty/nginx/sbin/nginx | grep ssl
```

Verification points: `openresty -V` outputs `built with OpenSSL 3.3.1` (as measured this time), and `nginx -t` runs normally. If you see `built with X (running with Y)` with X and Y different, the runtime is not loading the OpenSSL copy you specified — add the rpath per Fix 1 or switch to static linking, then check `ldd` to confirm the path.

## Prevention After the Fact

- When you upgrade OpenResty and recompile, the build directory gets unpacked anew — Fix 3's hand edits are lost and must be redone; Fixes 1 and 2 live only in your build command line/script and are naturally immune. Solidify the compile command into a build script (with commented arguments) and rerun it on upgrades.
- State clearly in the build command how OpenSSL is wired in (source tree or installed path), so the next person never has to guess again.

## Notes

- The root cause is **option-semantics misuse**: `--with-openssl=DIR` wants an OpenSSL source directory, not an install directory.
- If `.openssl` paths appear in the error, it is looking for the source-build artifact directory — seeing that path means you took the wrong channel.
- When the error says a `lib` path is not found, suspect `lib64` first; one `ls $OPENSSL` makes the layout obvious (in this test, on arm64 debian:12 the libraries were still under `lib`; this issue is common on some RHEL-family layouts).
- The root cause and all three fixes in this article were verified in a debian:12 container + OpenResty 1.27.1.1 (nginx 1.27.1) + OpenSSL 3.3.1: error reproduction, the objs/Makefile rule, lines 43-46 of auto/lib/openssl/conf, and Fixes 1 and 2 compiling successfully; the two other forms in the error-quotes section are verbatim records from the 1.19.9 era (flagged with `> Note`).

> This article was restructured from the author's 2020-2024 CSDN blog posts, originally published on CSDN.
