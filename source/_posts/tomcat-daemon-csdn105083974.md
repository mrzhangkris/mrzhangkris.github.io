---
title: "Tomcat 以 daemon 模式启动（jsvc）"
date: 2020-03-25 01:04:21
updated: 2026-09-11
categories: [技术]
tags: [Tomcat]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1519086588705-c935fdedcc14?w=1600&q=80&fm=jpg
---

用 `startup.sh` 起的 Tomcat 是挂在当前 shell 下的，退出终端或用户权限一变就容易出问题。daemon 模式通过 jsvc 把 Tomcat 托管成独立的服务进程，可以用专用的 `daemon.sh` 启停。这篇记录在 CentOS 8 上把 Tomcat 9 配成 daemon 模式的全过程，包括编译 jsvc 时踩到的几个坑。

## 环境检查

先看服务器上有没有 JDK 环境：

```bash
[root@localhost ~]# java -version
-bash: /usr/bin/java: No such file or directory
```

not found 说明当前服务器没有 JDK 环境，需要安装 JDK。

> OpenJDK 默认安装路径 `/usr/lib/jvm/`

## 安装

创建不可登录的 tomcat 组和用户：

```bash
[root@localhost ~]# groupadd tomcat
[root@localhost ~]# useradd -g tomcat -s /usr/sbin/nologin tomcat
```

进入 Tomcat 的 bin 目录，解压 commons-daemon-native.tar.gz：

```bash
tar -zxvf commons-daemon-native.tar.gz
```

两个可能遇到的问题：

> - 出现 `-bash: tar: command not found`，需使用 yum 安装 tar
> - 不存在 commons-daemon-native.tar.gz 文件，可以在相同版本的 tomcat 中拷贝到当前 tomcat/bin 目录下，也可以去 [http://www.apache.org/dist/commons/daemon/source/](http://www.apache.org/dist/commons/daemon/source/) 下载

解压完毕后进入 `commons-daemon-1.2.2-native-src/unix/`：

```bash
[root@localhost bin]# cd commons-daemon-1.2.2-native-src/unix/
[root@localhost unix]# ls
configure  configure.in  INSTALL.txt  Makedefs.in  Makefile.in  man  native  support
[root@localhost unix]#
```

### 编译 jsvc：三个常见的 configure 报错

执行 `./configure`：

```bash
./configure
```

第一次执行报错：

```bash
[root@localhost unix]# ./configure
*** Current host ***
checking build system type... x86_64-pc-linux-gnu
checking host system type... x86_64-pc-linux-gnu
checking cached host system type... ok
*** C-Language compilation tools ***
checking for gcc... no
checking for cc... no
checking for cl.exe... no
configure: error: in `/root/apache-tomcat-9.0.33/bin/commons-daemon-1.2.2-native-src/unix':
configure: error: no acceptable C compiler found in $PATH
See `config.log' for more details
```

该错误说明当前环境没有 C 编译器，用 yum 安装 gcc 解决：

```bash
yum install gcc -y
```

安装 gcc 后重新执行，这次走到了 JDK 检查一步：

```bash
[root@localhost unix]# ./configure
*** Current host ***
checking build system type... x86_64-pc-linux-gnu
checking host system type... x86_64-pc-linux-gnu
checking cached host system type... ok
*** C-Language compilation tools ***
checking for gcc... gcc
checking whether the C compiler works... yes
checking for C compiler default output file name... a.out
checking for suffix of executables...
checking whether we are cross compiling... no
checking for suffix of object files... o
checking whether we are using the GNU C compiler... yes
checking whether gcc accepts -g... yes
checking for gcc option to accept ISO C89... none needed
checking for ranlib... ranlib
checking for strip... strip
*** Host support ***
checking C flags dependant on host system type... ok
*** Java compilation tools ***
checking for JDK location... configure: error: Java Home not defined. Rerun with --with-java=... parameter
```

这个报错的处理：

- 若已经安装 JDK，需要使用 `--with-java` 参数指定 JDK 路径
- 若未安装 JDK，需要先安装 JDK，再使用 `--with-java` 参数指定 JDK 路径
- OpenJDK 的安装位置可以在 `/usr/lib/jvm/` 目录下找到

加上 `--with-java` 参数再次执行：

```bash
[root@localhost unix]# ./configure --with-java=/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64
*** Current host ***
checking build system type... x86_64-pc-linux-gnu
checking host system type... x86_64-pc-linux-gnu
checking cached host system type... ok
*** C-Language compilation tools ***
checking for gcc... gcc
checking whether the C compiler works... yes
checking for C compiler default output file name... a.out
checking for suffix of executables...
checking whether we are cross compiling... no
checking for suffix of object files... o
checking whether we are using the GNU C compiler... yes
checking whether gcc accepts -g... yes
checking for gcc option to accept ISO C89... none needed
checking for ranlib... ranlib
checking for strip... strip
*** Host support ***
checking C flags dependant on host system type... ok
*** Java compilation tools ***
checking JAVA_HOME... /usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64
checking for JDK os include directory... Cannot find jni_md.h in /usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/
configure: error: You should retry --with-os-type=SUBDIR
```

`/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64` 是我的 JDK 路径，你的可能不同。这次的报错是找不到 `jni_md.h`，需要加上 `--with-os-type` 参数指定 JDK include 中的 `jni_md.h` 文件。

若 JDK 内不存在 include 文件夹或 `jni_md.h` 文件，可以用 yum 安装当前 JDK 的 devel 管理包；若存在则跳过此步骤：

```bash
[root@localhost unix]# java -version
openjdk version "11.0.5" 2019-10-15 LTS
OpenJDK Runtime Environment 18.9 (build 11.0.5+10-LTS)
OpenJDK 64-Bit Server VM 18.9 (build 11.0.5+10-LTS, mixed mode, sharing)
[root@localhost unix]# yum search *jdk*
Last metadata expiration check: 0:55:15 ago on Tue 24 Mar 2020 10:46:41 PM CST.
=============================================================================== Name & Summary Matched: *jdk* ===============================================================================
java-11-openjdk-demo.x86_64 : OpenJDK Demos 11
java-1.8.0-openjdk-demo.x86_64 : OpenJDK Demos 8
java-11-openjdk-jmods.x86_64 : JMods for OpenJDK 11
java-11-openjdk-src.x86_64 : OpenJDK Source Bundle 11
java-11-openjdk.x86_64 : OpenJDK Runtime Environment 11
java-1.8.0-openjdk-src.x86_64 : OpenJDK Source Bundle 8
java-11-openjdk.x86_64 : OpenJDK Runtime Environment 11
copy-jdk-configs.noarch : JDKs configuration files copier
copy-jdk-configs.noarch : JDKs configuration files copier
java-1.8.0-openjdk.x86_64 : OpenJDK Runtime Environment 8
java-11-openjdk-javadoc.x86_64 : OpenJDK 11 API documentation
java-1.8.0-openjdk-javadoc.noarch : OpenJDK 8 API documentation
java-11-openjdk-devel.x86_64 : OpenJDK Development Environment 11
java-1.8.0-openjdk-devel.x86_64 : OpenJDK Development Environment 8
java-11-openjdk-headless.x86_64 : OpenJDK Headless Runtime Environment 11
java-11-openjdk-headless.x86_64 : OpenJDK Headless Runtime Environment 11
java-11-openjdk-accessibility.x86_64 : OpenJDK 8 accessibility connector
java-1.8.0-openjdk-headless.x86_64 : OpenJDK Headless Runtime Environment 8
java-11-openjdk-javadoc-zip.x86_64 : OpenJDK 11 API documentation compressed in single archive
================================================================================== Summary Matched: *jdk* ===================================================================================
icedtea-web.noarch : Additional Java components for OpenJDK - Java browser plug-in and Web Start implementation
[root@localhost unix]# yum install java-11-openjdk-devel.x86_64 -y
Last metadata expiration check: 0:55:32 ago on Tue 24 Mar 2020 10:46:41 PM CST.
Dependencies resolved.
=============================================================================================================================================================================================
 Package                                             Architecture                         Version                                              Repository                               Size
=============================================================================================================================================================================================
Installing:
 java-11-openjdk-devel                               x86_64                               1:11.0.5.10-2.el8_1                                  AppStream                               3.3 M

Transaction Summary
=============================================================================================================================================================================================
Install  1 Package

Total download size: 3.3 M
Installed size: 5.3 M
Downloading Packages:
java-11-openjdk-devel-11.0.5.10-2.el8_1.x86_64.rpm                                                                                                           641 kB/s | 3.3 MB     00:05
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
Total                                                                                                                                                        558 kB/s | 3.3 MB     00:06
Running transaction check
Transaction check succeeded.
Running transaction test
Transaction test succeeded.
Running transaction
  Preparing        :                                                                                                                                                                     1/1
  Installing       : java-11-openjdk-devel-1:11.0.5.10-2.el8_1.x86_64                                                                                                                    1/1
  Running scriptlet: java-11-openjdk-devel-1:11.0.5.10-2.el8_1.x86_64                                                                                                                    1/1
  Verifying        : java-11-openjdk-devel-1:11.0.5.10-2.el8_1.x86_64                                                                                                                    1/1

Installed:
  java-11-openjdk-devel-1:11.0.5.10-2.el8_1.x86_64

Complete!
[root@localhost unix]#
```

安装 JDK devel 包后重新执行 configure：

```bash
[root@localhost unix]# ./configure --with-java=/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64
*** Current host ***
checking build system type... x86_64-pc-linux-gnu
checking host system type... x86_64-pc-linux-gnu
checking cached host system type... ok
*** C-Language compilation tools ***
checking for gcc... gcc
checking whether the C compiler works... yes
checking for C compiler default output file name... a.out
checking for suffix of executables...
checking whether we are cross compiling... no
checking for suffix of object files... o
checking whether we are using the GNU C compiler... yes
checking whether gcc accepts -g... yes
checking for gcc option to accept ISO C89... none needed
checking for ranlib... ranlib
checking for strip... strip
*** Host support ***
checking C flags dependant on host system type... ok
*** Java compilation tools ***
checking JAVA_HOME... /usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64
checking for JDK os include directory...  linux
gcc flags added
checking how to run the C preprocessor... gcc -E
checking for grep that handles long lines and -e... /usr/bin/grep
checking for egrep... /usr/bin/grep -E
checking for ANSI C header files... yes
checking for sys/types.h... yes
checking for sys/stat.h... yes
checking for stdlib.h... yes
checking for string.h... yes
checking for memory.h... yes
checking for strings.h... yes
checking for inttypes.h... yes
checking for stdint.h... yes
checking for unistd.h... yes
checking sys/capability.h usability... no
checking sys/capability.h presence... no
checking for sys/capability.h... no
configure: WARNING: cannot find headers for libcap
*** Writing output files ***
configure: creating ./config.status
config.status: creating Makefile
config.status: creating Makedefs
config.status: creating native/Makefile
*** All done ***
Now you can issue "make"
[root@localhost unix]#
```

出现 `All done` 说明 configure 通过，可以进行编译安装了。若还是报 `configure: error: You should retry --with-os-type=SUBDIR`，可以用 `find / -name "jni_md.h"` 找到路径，指定 `--with-os-type`，出现 `All done` 即可进行编译。

### make 编译

执行 make：

```bash
[root@localhost unix]# make
-bash: make: command not found
[root@localhost unix]#
```

command not found，用 yum 安装 make：

```bash
yum install make -y
```

安装 make 包后重新执行：

```bash
[root@localhost unix]# make
(cd native; make  all)
make[1]: Entering directory '/root/apache-tomcat-9.0.33/bin/commons-daemon-1.2.2-native-src/unix/native'
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c jsvc-unix.c -o jsvc-unix.o
jsvc-unix.c: In function ‘run_controller’:
jsvc-unix.c:1293:20: warning: assignment to ‘__sighandler_t’ {aka ‘void (*)(int)’} from incompatible pointer type ‘void (*)(int,  siginfo_t *, void *)’ {aka ‘void (*)(int,  struct <anonymous> *, void *)’} [-Wincompatible-pointer-types]
     act.sa_handler = controller;
                    ^
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c arguments.c -o arguments.o
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c debug.c -o debug.o
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c dso-dlfcn.c -o dso-dlfcn.o
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c dso-dyld.c -o dso-dyld.o
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c help.c -o help.o
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c home.c -o home.o
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c java.c -o java.o
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c location.c -o location.o
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c replace.c -o replace.o
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c locks.c -o locks.o
gcc -g -O2 -DOS_LINUX -DDSO_DLFCN -DCPU=\"amd64\" -Wall -Wstrict-prototypes   -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include -I/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/include/linux -c signals.c -o signals.o
ar cr libservice.a arguments.o debug.o dso-dlfcn.o dso-dyld.o help.o home.o java.o location.o replace.o locks.o signals.o
ranlib libservice.a
gcc   jsvc-unix.o libservice.a -ldl -lpthread -o ../jsvc
make[1]: Leaving directory '/root/apache-tomcat-9.0.33/bin/commons-daemon-1.2.2-native-src/unix/native'
[root@localhost unix]# ls
config.log  config.nice  config.status  configure  configure.in  INSTALL.txt  jsvc  Makedefs  Makedefs.in  Makefile  Makefile.in  man  native  support
[root@localhost unix]#
```

编译生成了一个 `jsvc` 文件，把它复制到 tomcat 的 bin 目录：

```bash
[root@localhost unix]# cp jsvc ../../
[root@localhost bin]# cd ../../
[root@localhost bin]# ls
bootstrap.jar  catalina-tasks.xml  commons-daemon-1.2.2-native-src  configtest.bat  digest.bat  makebase.bat      setclasspath.sh  startup.bat      tomcat-native.tar.gz  version.bat
catalina.bat   ciphers.bat         commons-daemon.jar               configtest.sh   digest.sh   makebase.sh       shutdown.bat     startup.sh       tool-wrapper.bat      version.sh
catalina.sh    ciphers.sh          commons-daemon-native.tar.gz     daemon.sh       jsvc        setclasspath.bat  shutdown.sh      tomcat-juli.jar  tool-wrapper.sh
[root@localhost bin]#
```

## 配置 daemon.sh

编辑 `daemon.sh` 文件，找到如下内容：

```bash
test ".$TOMCAT_USER" = . && TOMCAT_USER=tomcat
# Set JAVA_HOME to working JDK or JRE
# JAVA_HOME=/opt/jdk-1.6.0.22
```

做两处修改：`TOMCAT_USER=tomcat` 的 tomcat 改成你所需的用户；`# JAVA_HOME=/opt/jdk-1.6.0.22` 的路径改为你的 JDK 路径。修改后的结果：

```bash
test ".$TOMCAT_USER" = . && TOMCAT_USER=tomcat
# Set JAVA_HOME to working JDK or JRE
JAVA_HOME=/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64
```

tomcat 是我创建的用户，`/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64` 是我的 JDK 路径。

然后修改 tomcat 目录的所属用户和组，并给 `daemon.sh` 赋可执行权限：

```bash
[root@localhost bin]# cd
[root@localhost ~]# chown -R tomcat:tomcat apache-tomcat-9.0.33
[root@localhost ~]# chmod a+x apache-tomcat-9.0.33/bin/daemon.sh
```

到此所有配置都完成了。若 tomcat 中的项目需要读取其他文件夹，需要确认该文件夹的权限是否满足 tomcat 用户的需求。

![配图](/images/csdn/figures/tomcat-daemon-csdn105083974.png)

## 验证

使用 `apache-tomcat-9.0.33/bin/daemon.sh run` 命令启动：

```bash
[root@localhost ~]# apache-tomcat-9.0.33/bin/daemon.sh run
25-Mar-2020 00:43:13.119 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Server version name:   Apache Tomcat/9.0.33
25-Mar-2020 00:43:13.122 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Server built:          Mar 11 2020 09:31:38 UTC
25-Mar-2020 00:43:13.122 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Server version number: 9.0.33.0
25-Mar-2020 00:43:13.123 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log OS Name:               Linux
25-Mar-2020 00:43:13.123 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log OS Version:            4.18.0-147.el8.x86_64
25-Mar-2020 00:43:13.123 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Architecture:          amd64
25-Mar-2020 00:43:13.123 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Java Home:             /usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64
25-Mar-2020 00:43:13.123 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log JVM Version:           11.0.5+10-LTS
25-Mar-2020 00:43:13.123 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log JVM Vendor:            Oracle Corporation
25-Mar-2020 00:43:13.123 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log CATALINA_BASE:         /root/apache-tomcat-9.0.33
25-Mar-2020 00:43:13.123 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log CATALINA_HOME:         /root/apache-tomcat-9.0.33
25-Mar-2020 00:43:13.158 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Djava.util.logging.config.file=/root/apache-tomcat-9.0.33/conf/logging.properties
25-Mar-2020 00:43:13.158 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Djava.util.logging.manager=org.apache.juli.ClassLoaderLogManager
25-Mar-2020 00:43:13.158 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Dignore.endorsed.dirs=
25-Mar-2020 00:43:13.158 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Dcatalina.base=/root/apache-tomcat-9.0.33
25-Mar-2020 00:43:13.158 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Dcatalina.home=/root/apache-tomcat-9.0.33
25-Mar-2020 00:43:13.158 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Djava.io.tmpdir=/root/apache-tomcat-9.0.33/temp
25-Mar-2020 00:43:13.158 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Dcommons.daemon.process.id=21214
25-Mar-2020 00:43:13.159 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Dcommons.daemon.process.parent=21208
25-Mar-2020 00:43:13.159 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Dcommons.daemon.version=1.2.2
25-Mar-2020 00:43:13.159 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: abort
25-Mar-2020 00:43:13.159 INFO [main] org.apache.catalina.core.AprLifecycleListener.lifecycleEvent The APR based Apache Tomcat Native library which allows optimal performance in production environments was not found on the java.library.path: [/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/lib/server:/usr/lib/jvm/java-11-openjdk-11.0.5.10-2.el8_1.x86_64/lib:/usr/java/packages/lib:/usr/lib64:/lib64:/lib:/usr/lib]
25-Mar-2020 00:43:13.963 INFO [main] org.apache.coyote.AbstractProtocol.init Initializing ProtocolHandler ["http-nio-8080"]
25-Mar-2020 00:43:14.051 INFO [main] org.apache.catalina.startup.Catalina.load Server initialization in [1,466] milliseconds
25-Mar-2020 00:43:14.202 INFO [main] org.apache.catalina.core.StandardService.startInternal Starting service [Catalina]
25-Mar-2020 00:43:14.202 INFO [main] org.apache.catalina.core.StandardEngine.startInternal Starting Servlet engine: [Apache Tomcat/9.0.33]
25-Mar-2020 00:43:14.237 INFO [main] org.apache.catalina.startup.HostConfig.deployDirectory Deploying web application directory [/root/apache-tomcat-9.0.33/webapps/ROOT]
25-Mar-2020 00:43:14.926 INFO [main] org.apache.catalina.startup.HostConfig.deployDirectory Deployment of web application directory [/root/apache-tomcat-9.0.33/webapps/ROOT] has finished in [688] ms
25-Mar-2020 00:43:14.926 INFO [main] org.apache.catalina.startup.HostConfig.deployDirectory Deploying web application directory [/root/apache-tomcat-9.0.33/webapps/docs]
25-Mar-2020 00:43:14.979 INFO [main] org.apache.catalina.startup.HostConfig.deployDirectory Deployment of web application directory [/root/apache-tomcat-9.0.33/webapps/docs] has finished in [53] ms
25-Mar-2020 00:43:14.979 INFO [main] org.apache.catalina.startup.HostConfig.deployDirectory Deploying web application directory [/root/apache-tomcat-9.0.33/webapps/examples]
25-Mar-2020 00:43:15.624 INFO [main] org.apache.catalina.startup.HostConfig.deployDirectory Deployment of web application directory [/root/apache-tomcat-9.0.33/webapps/examples] has finished in [645] ms
25-Mar-2020 00:43:15.625 INFO [main] org.apache.catalina.startup.HostConfig.deployDirectory Deploying web application directory [/root/apache-tomcat-9.0.33/webapps/host-manager]
25-Mar-2020 00:43:15.738 INFO [main] org.apache.catalina.startup.HostConfig.deployDirectory Deployment of web application directory [/root/apache-tomcat-9.0.33/webapps/host-manager] has finished in [113] ms
25-Mar-2020 00:43:15.738 INFO [main] org.apache.catalina.startup.HostConfig.deployDirectory Deploying web application directory [/root/apache-tomcat-9.0.33/webapps/manager]
25-Mar-2020 00:43:15.806 INFO [main] org.apache.catalina.startup.HostConfig.deployDirectory Deployment of web application directory [/root/apache-tomcat-9.0.33/webapps/manager] has finished in [68] ms
25-Mar-2020 00:43:15.836 INFO [main] org.apache.coyote.AbstractProtocol.start Starting ProtocolHandler ["http-nio-8080"]
25-Mar-2020 00:43:15.939 INFO [main] org.apache.catalina.startup.Catalina.start Server startup in [1,887] milliseconds
```

启动后可以在浏览器中访问到 tomcat。若访问不到，检查防火墙中是否添加了 tomcat 端口、防火墙是否开启。

## daemon 模式的基本操作

```text
bin/daemon.sh start   启动
bin/daemon.sh stop    停止
bin/daemon.sh version 查看版本
logs/catalina-daemon.out 查看日志
```

## 注意事项

- 编译 jsvc 的三连坑都跟缺包有关：缺 gcc、缺 JDK include（装 `java-11-openjdk-devel`）、缺 make，报错信息里都有明确提示，对症安装即可。
- `--with-java` 要指向 JDK 的实际路径，OpenJDK 默认在 `/usr/lib/jvm/` 下；`jni_md.h` 找不到时用 `find / -name "jni_md.h"` 定位再配 `--with-os-type`。
- daemon.sh 里的 `TOMCAT_USER` 决定 Tomcat 以哪个用户运行，配套的 `chown -R` 别漏，否则启动后写不了日志和临时目录。
- tomcat 用户是 `/usr/sbin/nologin` 的不可登录用户，专门用于跑服务，不要图省事用 root 跑。
- 项目若要读写 tomcat 目录之外的文件夹，记得确认该文件夹对 tomcat 用户的权限，这是 daemon 模式最常见的启动后故障。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
