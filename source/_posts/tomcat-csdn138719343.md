---
title: "Tomcat 启动闪退排查与解决"
date: 2024-05-11 16:00:13
updated: 2026-09-14
categories: [技术]
tags: [Tomcat]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1515965885361-f1e0095517ea?w=1600&q=80&fm=jpg
---

Tomcat 启动后进程直接退出，连日志都来不及看——这是典型的"闪退"。最迷惑人的地方在于 `startup.sh` 永远报告 `Tomcat started.`，而真相全在 `logs/catalina.out` 里。本文在 Rocky Linux 9 容器（Tomcat 10.1.59、OpenJDK 17）上把三类最常见的闪退现场逐一复现：环境变量缺失、端口被占、内存超限，并给出每类的解法与验证方法。

## 报错现象

闪退的统一表象是"脚本说启动了，进程却没了"：

```text
$ /opt/tomcat/bin/startup.sh
Tomcat started.
$ ps -ef | grep catalina.home | grep -v grep
（无输出，进程已消失）
```

另一类更直接：脚本当场拒绝执行，打印 `Neither the JAVA_HOME nor the JRE_HOME environment variable is defined` 后退出。无论哪种，判断标准只有一条——`ps` 里找不到 java 进程、8080 无响应。

## 原因分析（按出现概率排序）

1. **环境变量问题**：`JAVA_HOME` 未设置、指错目录，或机器上压根没有 java。startup.sh 找不到 java 时直接拒绝启动，这是新手闪退的第一大来源。
2. **端口被占**：8080 已有进程监听（多半是上一个没死干净的 Tomcat）。JVM 先被拉起、绑定失败再退出——所以脚本仍报 `Tomcat started.`，最有欺骗性。
3. **JVM 内存超限**：`-Xms`/`-Xmx` 设得比机器（或容器）可用内存还大，JVM 初始化阶段申请内存失败，进程当场退出。
4. **Web 应用配置错误**：`webapps` 下某个应用的配置把类加载或上下文初始化搞挂，连带整个实例退出——先移走应用再观察。

## 逐类解决

### 现场一：JAVA_HOME / java 不存在

![配图1](/images/csdn/figures/tomcat-csdn138719343-1.png)

解法：设置 `JAVA_HOME` 指向 JDK 根目录（Rocky 9 上 `dnf install java-17-openjdk-headless` 后在 `/usr/lib/jvm/java-17`），并确认 `java -version` 可用。验证：重新执行 `startup.sh`，`echo $?` 返回 0 且 `ps` 能看到 java 进程。

### 现场二：8080 端口被占

![配图2](/images/csdn/figures/tomcat-csdn138719343-2.png)

`catalina.out` 里的关键行是 `SEVERE: Failed to initialize component [Connector["http-nio-8080"]]`，根因 `java.net.BindException: Address already in use`。解法二选一：

- 找出占用者处理掉：`ss -lntp | grep :8080` 直接给出 PID；
- 给 Tomcat 换端口，改 `conf/server.xml` 的 Connector：

```xml
<Connector port="8081" protocol="HTTP/1.1"
           connectionTimeout="20000"
           redirectPort="8443" />
```

注意 shutdown 端口 8005 同理，多实例并存时每个实例的 8005/8080 都要错开。验证：换端口或清理占用者后重启，`curl http://127.0.0.1:8081/` 返回 200。

### 现场三：JVM 内存超限

![配图3](/images/csdn/figures/tomcat-csdn138719343-3.png)

解法：在 `bin/setenv.sh`（没有就新建）里把参数调到机器承受范围内：

```bash
export CATALINA_OPTS="$CATALINA_OPTS -Xms512M -Xmx2048M"
```

验证：重启后 `ps -ef | grep java` 里能看到 `-Xmx2048M` 生效，且进程持续存活、8080 返回 200。

### 现场四：Web 应用引发

解法：用"移走-重启-观察"二分定位——把 `webapps` 下可疑的应用目录或 war 包移出，重启看是否恢复；恢复则二分放回找出元凶。验证：移除后进程稳定存活。

### 修复后的统一验证口径

![配图4](/images/csdn/figures/tomcat-csdn138719343-4.png)

每次处理后按三步确认才算闭环：进程在（`ps -ef | grep catalina.home` 有输出）、端口通（`curl -s -o /dev/null -w '%{http_code}'` 返回 200）、首页内容对（title 里的版本号符合预期）。

## 事后预防

- **排查顺序固定**：先看 `catalina.out` 拿报错原文，再按环境变量、端口、内存、应用的顺序逐项排除，比乱试快得多。
- **别信 `Tomcat started.`**：它只代表脚本执行完，存活与否永远以 `ps` + `curl` 为准。
- **内存参数写进 setenv.sh 并留余量**：`-Xmx` 不超过机器可用内存的七成；容器部署时叠加 `-XX:MaxRAMPercentage` 让 JVM 感知 cgroup 限制。
- **多实例规划端口**：8005/8080/8443 三件套每个实例一组，上线前用 `ss -lntp` 预检。
- **环境变量进 systemd 单元或 profile**：手工 `export` 的变量在换人换机后就丢，JAVA_HOME 写进 `tomcat.service` 的 `Environment=` 才可靠。

闪退排查的本质是"先取证再动手"：catalina.out 给方向、ps 给生死、curl 给结论。把三类现场的处理肌肉记忆化，大多数 Tomcat 起不来的问题都能在十分钟内闭环。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
