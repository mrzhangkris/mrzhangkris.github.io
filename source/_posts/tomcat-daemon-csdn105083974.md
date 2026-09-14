---
title: "Tomcat 以 daemon 模式启动（jsvc）：Rocky Linux 9 实测"
date: 2020-03-25 01:04:21
updated: 2026-09-14
categories: [技术]
tags: [Tomcat]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1519086588705-c935fdedcc14?w=1600&q=80&fm=jpg
---

用 `startup.sh` 起的 Tomcat 挂在当前 shell 下，退出终端、会话断开都可能把进程带死，权限管理也只能整把交给启动用户。daemon 模式通过 jsvc 把 Tomcat 托管成独立服务进程：root 侧的控制器负责拉起和信号处理，JVM 则跑在一个专用的不可登录用户下，启停用配套的 `daemon.sh start/stop`。这篇在 Rocky Linux 9 上用 Tomcat 9.0.121 + OpenJDK 11 把全过程实跑了一遍——包括编译 jsvc、配置 daemon.sh、启动验证和停止闭环。

照着做完全程，你会得到：一个编译好的 jsvc、一套以 tomcat 用户运行的 daemon 模式 Tomcat，以及一套可复用的 start/stop 操作命令。

## 前置条件

- 操作系统：Rocky Linux 9（本文实测环境为 rockylinux:9 容器，aarch64）
- 软件版本：Tomcat 9.0.121（官方 tarball），commons-daemon 1.6.1，java-11-openjdk 11.0.25
- 权限：root 或 sudo（编译和建用户需要）
- 网络：能访问 tomcat.apache.org 下载源

## 安装依赖与准备用户

jsvc 是 C 程序，编译链和 JDK 头文件一样都不能少。Rocky 9 上一条命令装齐：

```bash
dnf install -y java-11-openjdk-devel gcc make wget tar gzip
```

注意装的是 `java-11-openjdk-devel` 而不是运行时包——只有 devel 才带 include 头文件，configure 阶段要用。装完确认版本：

![配图1](/images/csdn/figures/tomcat-daemon-csdn105083974-1.png)

创建专用的不可登录用户，Tomcat 之后以这个身份运行：

```bash
groupadd tomcat
useradd -g tomcat -s /usr/sbin/nologin tomcat
```

然后下载解压 Tomcat，本文装到 /opt：

```bash
cd /opt
wget https://dlcdn.apache.org/tomcat/tomcat-9/v9.0.121/bin/apache-tomcat-9.0.121.tar.gz
tar -zxf apache-tomcat-9.0.121.tar.gz
```

一个要先说破的误区：网上不少说法（包括本文旧版）认为新版 Tomcat 的 bin 目录里带了现成的 jsvc，不用编译。**实测 9.0.121 并非如此**——bin/ 里只有 `commons-daemon-native.tar.gz` 源码包，`daemon.sh` 也在，唯独没有 jsvc 二进制。编译这一步躲不掉，好在新系统上一次就能过。

## 编译 jsvc

进入 Tomcat 的 bin 目录解开源码包，到 unix 子目录里编译：

```bash
cd /opt/apache-tomcat-9.0.121/bin
tar -zxf commons-daemon-native.tar.gz
cd commons-daemon-1.6.1-native-src/unix
```

`--with-java` 指向 JDK 的实际路径（`readlink -f /usr/lib/jvm/java-11-openjdk` 可以拿到），configure 通过后 make：

```bash
./configure --with-java=/usr/lib/jvm/java-11-openjdk-11.0.25.0.9-7.el9.aarch64
make
```

实测输出：

![配图2](/images/csdn/figures/tomcat-daemon-csdn105083974-2.png)

configure 出现 `*** All done ***` 即检查通过，make 结束后在当前目录生成 jsvc 可执行文件，把它复制到 Tomcat 的 bin 目录：

```bash
cp jsvc ../../
```

在 Rocky 9 上装齐依赖后 configure 一次通过，不会再遇到老文章里"缺 gcc、缺 JDK 头文件、缺 make"的三连报错——那些是老环境的坑，留到文末"历史版本差异"一节对照。

## 配置 daemon 模式

先把目录归属交给 tomcat 用户，并给 daemon.sh 加执行权限：

```bash
cd /opt/apache-tomcat-9.0.121
chown -R tomcat:tomcat .
chmod a+x bin/daemon.sh
```

daemon.sh 里有两处和运行身份相关的配置。`TOMCAT_USER` 的默认值就是 tomcat，建了同名用户的话这行不用动：

```bash
test ".$TOMCAT_USER" = . && TOMCAT_USER=tomcat
```

JAVA_HOME 的处理方式和几年前不同了。9.0.121 的 daemon.sh 里已经没有 `# JAVA_HOME=/opt/jdk-...` 这样的注释行可以取消注释，现在的逻辑是：没设置时从 PATH 里的 java 自动反推 JDK 路径，同时支持 `--java-home` 参数显式传入。**建议显式指定**——我在最小化容器里实测过，环境里没有 which 命令时自动探测会失效，jsvc 拿到空的 -java-home 参数；显式指定就不会有这种环境依赖：

```bash
bin/daemon.sh --java-home /usr/lib/jvm/java-11-openjdk-11.0.25.0.9-7.el9.aarch64 start
```

## 启动与验证

start 之后等十秒左右让 Tomcat 完成初始化，然后做两层验证：

![配图3](/images/csdn/figures/tomcat-daemon-csdn105083974-3.png)

功能层：`curl http://localhost:8080/` 返回 200，浏览器能打开 Tomcat 欢迎页（远程机器访问不到时，先检查防火墙是否放行了 8080）。日志层：`logs/catalina-daemon.out` 里出现 `Server startup in [N] milliseconds` 和 `Starting ProtocolHandler ["http-nio-8080"]` 即成功。

## 日常操作

```text
bin/daemon.sh start   启动
bin/daemon.sh stop    停止
bin/daemon.sh version 查看版本
logs/catalina-daemon.out 查看日志
```

daemon 模式的进程结构值得看一眼，这也是它和 startup.sh 的本质区别：

![配图4](/images/csdn/figures/tomcat-daemon-csdn105083974-4.png)

root 名下的 jsvc 是控制进程（pid 文件在 `logs/catalina-daemon.pid`），它 fork 出的子进程切到 tomcat 用户运行 JVM。stop 之后用 curl 再探一次 8080，连接被拒即停止完成；退出时 jsvc 会顺手删掉 pid 文件，这个细节也可以当停止成功的旁证。从实测的进程参数还能看到两个贴心默认值：`-wait 10` 让 start 命令等 Tomcat 真正初始化完成才返回（而不是发完信号就走人），`-umask 0027` 把新文件的默认权限收紧到组内可读。

除了 start，还有一个 `run` 子命令——前台模式，日志直接打在当前终端：

![配图5](/images/csdn/figures/tomcat-daemon-csdn105083974-5.png)

与 start 有一个容易想当然的差异：run 模式不做身份切换——实测前台运行时两个 jsvc 进程都以 root 跑，tomcat 用户的身份隔离只在 start 模式生效。进程挂在前台，终端断开或手动 kill，Tomcat 跟着停。调配置、看启动报错时用它最顺手，生产上常驻还是用 start/stop。

## 启动失败时先看哪里

start 之后 curl 不通，按这个顺序排：

- **看日志**：`logs/catalina-daemon.out` 收着启动期的全部输出，`Server startup in [N] milliseconds` 之前最后一行通常就是失败原因；访问日志则按天写在 `logs/catalina.YYYY-MM-DD.log` 里。
- **看进程参数**：`ps -ef | grep jsvc` 检查 `-java-home` 是否为空——空了说明 daemon.sh 的自动探测没生效，改用 `--java-home` 显式指定（本文实测踩过的坑）。
- **看端口**：8080 被其他进程占着时启动会失败，`ss -ltnp | grep 8080` 看占用；远程机器访问不到但本机 curl 通，则是防火墙没放行（firewalld 下 `firewall-cmd --permanent --add-port=8080/tcp && firewall-cmd --reload`）。

> 注：firewalld 两条命令未在容器内执行（容器无 systemd），为 firewalld 常规用法；其余排查项均为本次实测内容。

## 历史版本差异（CentOS 8，2020 年记录）

原文在 CentOS 8 + Tomcat 9.0.33 上首次配置时踩过三个 configure 报错，报错特征保留如下，便于老环境读者对号入座：

1. `configure: error: no acceptable C compiler found in $PATH`——没装编译器，`dnf install gcc`。
2. `configure: error: Java Home not defined. Rerun with --with-java=... parameter`——没装 JDK 或没指路径，装 `java-11-openjdk-devel` 后加 `--with-java=<JDK路径>`。
3. `Cannot find jni_md.h ... You should retry --with-os-type=SUBDIR`——JDK 头文件不全。这是老版本 JDK 布局特有的坑，实测 Rocky 9 的 java-11-openjdk-devel 装好后不需要任何 --with-os-type 参数，configure 直接通过。

另外老文章里"编辑 daemon.sh、把 `# JAVA_HOME=/opt/jdk-...` 取消注释"的做法只适用于旧版脚本，9.0.x 新版按上文用 `--java-home` 参数或环境变量即可。

## 注意事项

- `chown -R tomcat:tomcat` 别漏。daemon 模式下 Tomcat 以 tomcat 用户写 logs、temp、work，目录归属不对是最常见的"启动后写不了日志"故障。
- JAVA_HOME 显式指定最稳。自动探测依赖 PATH 里的 java 和 which 命令，精简系统上可能失灵。
- tomcat 用户是 `/usr/sbin/nologin` 的不可登录用户，专门跑服务用，不要图省事用 root 跑 JVM。
- 项目若要读写 Tomcat 目录之外的文件夹，记得单独给 tomcat 用户授权，daemon 模式下没有 root 权限兜底。
- 回退方案：`bin/daemon.sh stop` 停止后直接删除 Tomcat 目录即可（tarball 解压式安装，不涉及包管理），不再需要时可用 `userdel tomcat` 清理用户。

daemon 模式换来的是两件实在的事：会话退出带不死进程，JVM 不再跑在 root 身份下。代价只是编译一次 jsvc、多一个专用用户——在 Rocky 9 上这两步都已实测顺畅，照着做即可。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
