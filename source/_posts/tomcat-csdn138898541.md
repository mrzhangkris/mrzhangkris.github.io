---
title: "编写自动重启 Tomcat 的 Shell 脚本"
date: 2024-05-17 08:45:00
updated: 2026-09-14
categories: [技术]
tags: [Tomcat]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1570993492881-25240ce854f4?w=1600&q=80&fm=jpg
---

Tomcat 跑久了难免遇到内存泄露或者需要更新部署应用的情况，一次干净的自动重启比手动登录服务器省心得多。但"重启脚本"最容易犯的错是**只管拉起、不管验证**——本文沿用原文的经典脚本作为起点，在 Rocky Linux 9 容器（Tomcat 10.1.59）上实测出它的一处误报缺陷，再给出修正版：优雅等待、判空、进程对比、HTTP 探活四步闭环。

## 环境设定

对 Tomcat 安装目录有读写执行权限（本文假设安装在 `/opt/tomcat`），`JAVA_HOME` 可用，`curl` 在 PATH 里（探活用）。

## 原版脚本

先停、等 10 秒、防残留强杀、拉起、对比前后 PID 判断成败：

```bash
#!/bin/bash
##########################################################################################
####                             Restart tomcat                                       ####
##########################################################################################

# Tomcat 安装路径
TOMCAT_PATH="/opt/tomcat"

# 停止Tomcat
echo -e "\033[33mStopping Tomcat...\033[0m"
$TOMCAT_PATH/bin/shutdown.sh > /dev/null

# 等待Tomcat完全停止
sleep 10

# 检查Tomcat进程是否还存在，如果存在则杀掉
PID=$(ps -ef | grep $TOMCAT_PATH | grep "${process_keyword}" | grep -v grep | awk '{print $2}')
if [[ -n $PID ]]; then
  echo -e "\033[33mKilling Tomcat process ID $PID\033[0m"
  kill -9 $PID
fi

# 启动Tomcat
echo -e "\033[33mStarting Tomcat...\033[0m"
$TOMCAT_PATH/bin/startup.sh > /dev/null

# 获取重启后PID
NEWPID=$(ps -ef | grep $TOMCAT_PATH | grep "${process_keyword}" | grep -v grep | awk '{print $2}')

# PID相同说明重启失败
if [ "$PID" == "$NEWPID" ]
then
   echo -e "\033[31mTomcat restarted failed!\033[0m"
fi

# PID不同说明重启成功
if [ "$PID" != "$NEWPID" ]
then
   echo -e "\033[32mTomcat restarted successfully\033[0m"
fi
```

> 注：两处 `grep "${process_keyword}"` 的变量在脚本里没有定义，是模板残留。`${process_keyword}` 为空时 `grep ""` 匹配所有行，等效于去掉这层过滤，脚本仍能工作；需要按关键词过滤时记得先定义。

正常场景实测——Tomcat 在跑，执行脚本，进程换新、8 秒后 8080 恢复 200：

![配图1](/images/csdn/figures/tomcat-csdn138898541-1.png)

注意 `curl` 前的 `sleep 8`：startup.sh 返回只代表 JVM 进程起来了，Spring 一类的应用初始化还要几秒到几十秒，立即探测只会拿到 000。

## 实测出的误报缺陷

把 java 二进制临时挪走（模拟线上 java 升级/路径变更的事故），再执行原版脚本：

![配图2](/images/csdn/figures/tomcat-csdn138898541-2.png)

脚本报告 `successfully`，实际 java 进程数为 0——什么都没起来。链路是：shutdown.sh 因缺 java 静默失败（输出被重定向吞了）→ 旧进程被 `kill -9` → startup 静默失败 → `NEWPID` 为空。空字符串不等于旧 PID，于是落入"PID 不同=成功"的判定。

这就是原文脚本的核心缺陷：**用"PID 是否变化"单条件判定，且新进程没有判空**。此外 `kill -9` 是强杀，进程没有优雅收尾的机会；`sleep 10` 则是拍脑袋的固定等待，停得慢就误杀。

## 修正版脚本

四处修正：优雅停止改轮询等待（最多 15 秒）、新进程判空、加 HTTP 探活、失败统一非零退出：

```bash
#!/bin/bash
TOMCAT_PATH="/opt/tomcat"
PAT="catalina.home=$TOMCAT_PATH"

echo "[1/4] stopping..."
"$TOMCAT_PATH/bin/shutdown.sh" >/dev/null 2>&1
for i in $(seq 1 15); do
  pgrep -f "$PAT" >/dev/null || break
  sleep 1
done
OLDPID=$(pgrep -f "$PAT")
if [[ -n $OLDPID ]]; then
  echo "      force killing $OLDPID"
  kill -9 $OLDPID; sleep 1
fi

echo "[2/4] starting..."
"$TOMCAT_PATH/bin/startup.sh" >/dev/null 2>&1
sleep 3
NEWPID=$(pgrep -f "$PAT")

echo "[3/4] checking process..."
if [[ -z $NEWPID ]]; then
  echo "      FAIL: no new process, check catalina.out"; exit 1
fi
if [[ "$OLDPID" == "$NEWPID" ]]; then
  echo "      FAIL: pid unchanged"; exit 1
fi

echo "[4/4] health check (up to 20s)..."
CODE=000
for i in $(seq 1 10); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:8080/ || true)
  [[ $CODE == 200 ]] && break
  sleep 2
done
if [[ $CODE == 200 ]]; then
  echo "OK: restarted successfully (pid $NEWPID, http $CODE)"
else
  echo "FAIL: process up but http $CODE"; exit 1
fi
```

实测两条路径——同样的 java 缺失场景，修正版报 `FAIL` 并以退出码 1 结束；恢复正常后一条龙跑通：

![配图3](/images/csdn/figures/tomcat-csdn138898541-3.png)

`pgrep -f "catalina.home=/opt/tomcat"` 比原文的 `ps | grep | grep -v grep | awk` 链更短也更准：catalina.home 只会出现在 Tomcat 自己的进程命令行里，不会误匹配到 grep 自身。

## 脚本权限和定时任务

```bash
chmod +x restart_tomcat_v2.sh
```

定期重启（如每天凌晨 2 点）加入 crontab，务必重定向日志，否则半夜失败了没人知道：

```text
0 2 * * * /path/to/restart_tomcat_v2.sh >> /var/log/tomcat-restart.log 2>&1
```

## 注意事项

- **判定要三道闸**：新进程判空、PID 对比、HTTP 探活缺一不可，原文的单条件 PID 对比在 startup 静默失败时必误报（实测复现）。
- **启动后探活要留初始化时间**：Tomcat 进程起来到 8080 可用有数秒到数十秒延迟，轮询重试比一次判定可靠。
- **优雅优先，强杀兜底**：先 shutdown 再轮询等待，把 `kill -9` 留给确实停不下来的进程，对一致性敏感的应用尤其如此。
- **crontab 里用绝对路径并落盘日志**：cron 的 PATH 和登录 shell 不一样，`java`、`curl` 都可能找不到；日志不落盘等于盲飞。
- **低峰执行**：重启即秒级不可用，选业务低峰期，并确保监控把这次重启的告警静音掉。

一个重启脚本的含金量不在"能重启"，而在"重启失败时敢说失败"。三道验证闸加上非零退出码，让脚本接进监控和告警链路才算真正可靠。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
