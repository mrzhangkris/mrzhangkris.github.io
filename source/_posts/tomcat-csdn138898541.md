---
title: "编写自动重启 Tomcat 的 Shell 脚本"
date: 2024-05-17 08:45:00
updated: 2026-09-11
categories: [技术]
tags: [Tomcat]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1570993492881-25240ce854f4?w=1600&q=80&fm=jpg
---

Tomcat 跑久了难免遇到内存泄露或者需要更新部署应用的情况，这时候一次干净的自动重启比手动登录服务器操作省心得多。这篇给出一个简单可用的重启脚本：先停、再确认停干净、防残留进程，最后拉起来并验证重启结果。

## 环境设定

确保你有足够的权限来启动和停止 Tomcat 服务器——通常需要具有对 Tomcat 安装目录的访问权限。本文假设 Tomcat 安装在 `/opt/tomcat` 目录。

## 编写重启脚本

使用 Shell 脚本控制 Tomcat 的停止和启动，确保在重新启动前 Tomcat 完全停止。以下是一个基本的脚本示例：

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


> 注：脚本中两处 `grep "${process_keyword}"` 用到的 `process_keyword` 变量在脚本里没有定义，应是模板残留。`${process_keyword}` 为空时 `grep ""` 会匹配所有行，等效于去掉这层过滤，脚本仍能工作；如果你确实需要按关键词过滤进程，记得先定义该变量。

## 脚本解释

- **停止 Tomcat**：使用 Tomcat 自带的 `shutdown.sh` 脚本停止服务，输出重定向到 `/dev/null` 保持画面干净。
- **等待停止**：`sleep 10` 给 Tomcat 足够的时间完全停止。
- **检查并杀进程**：有时 Tomcat 可能没有完全停止，这时通过 `ps` 搜出 Tomcat 的进程 ID 并强制结束。
- **重新启动 Tomcat**：使用 `startup.sh` 重新启动 Tomcat。
- **查看 PID**：对比重启前后的 PID 判断重启操作是否成功——PID 相同说明旧进程根本没被换掉，重启失败；不同则说明新进程已经起来了。

## 脚本权限和定时任务

设置执行权限：

```bash
chmod +x restart_tomcat.sh
```

如果需要定期重启 Tomcat，可以把脚本加进 crontab。例如每天凌晨 2 点重启 Tomcat：

```text
0 2 * * * /path/to/restart_tomcat.sh
```

## 注意事项

- 脚本里 `${process_keyword}` 未定义，见上文注释——要么补上定义，要么把这层 grep 去掉，别让它成为隐患。
- 用"PID 是否变化"判断重启成败有个边界情况：如果 `startup.sh` 没能拉起新进程（`NEWPID` 为空），空值和旧 PID 不相等，会被误报为成功。生产环境使用建议给 `NEWPID` 加判空。
- `kill -9` 是强杀，进程没有优雅收尾的机会；对一致性敏感的应用，优先排查为什么 `shutdown.sh` 后进程还活着。
- 定时重启选业务低峰期（如凌晨 2 点），并在 crontab 里用绝对路径，cron 环境的 PATH 和你登录 shell 的不一样。
- 脚本日志建议落盘（crontab 里加重定向），否则半夜重启失败了没人知道。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
