---
title: "如何编写一个自动重启Tomcat的脚本"
date: 2024-05-17 08:45:00
categories: [技术]
tags: [Tomcat]
copyright_author: 张鹏
cover: /images/csdn/covers/tomcat-csdn138898541.png
---

Apache Tomcat 是一个广泛使用的开源Java应用服务器，它为运行Java代码提供了一个"纯Java"HTTP Web服务器环境。在开发或生产环境中，我们有时需要自动重启Tomcat以解决内存泄露问题或更新部署的应用。本文将指导你如何编写一个简单的脚本，实现自动重启Tomcat服务器。

##### 1\. 环境设定

首先，确保你有足够的权限来启动和停止Tomcat服务器。通常，你需要具有对Tomcat安装目录的访问权限。在本教程中，我们假设你的Tomcat安装在/opt/tomcat目录。

##### 2\. 编写重启脚本

使用Shell脚本来控制Tomcat的停止和启动，确保在重新启动前Tomcat完全停止。以下是一个基本的脚本示例：

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

##### 3\. 脚本解释

-   **停止Tomcat**：使用Tomcat自带的shutdown.sh脚本来停止服务。
-   **等待停止**：sleep命令确保给Tomcat足够的时间来完全停止。
-   **检查并杀进程**：有时Tomcat可能没有完全停止。这时，我们通过搜索Tomcat的进程ID并强制结束它。
-   **重新启动Tomcat**：使用startup.sh脚本重新启动Tomcat。
-   **查看PID**：根据PID值判断重启操作是否成功。

##### 4\. 脚本权限和定时任务

-   **设置执行权限**：给予脚本执行权限使用命令 chmod +x restart\_tomcat.sh。
-   **定时执行**：如果需要定期重启Tomcat，可以将此脚本添加到crontab中。例如，每天凌晨2点重启Tomcat的定时任务：

```
0 2 * * * /path/to/restart_tomcat.sh
```

---

> 本文迁移自作者 CSDN 博客，2024-05-17 首发于 CSDN，内容保持原貌。
