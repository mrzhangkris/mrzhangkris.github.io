---
title: "用 Bash 脚本 + expdp 实现 Oracle 定时备份与异地传输"
date: 2024-06-01 09:15:00
updated: 2026-09-11
categories: [技术]
tags: [Oracle]
copyright_author: 司南
cover: https://images.unsplash.com/photo-1561233835-f937539b95b9?w=1600&q=80&fm=jpg
---

Oracle 数据库的备份要能兜底，光在数据库服务器上留一份还不够：本地盘挂了、机器没了，备份也就没了。这篇文章记录一套完整的做法——用 expdp 定时导出数据库，脚本负责压缩打包，再通过 OpenResty 搭的接收接口把备份传到另一台服务器上。

## 准备工作

1. **数据库连接信息**：能连上要备份的 Oracle 库，且账号有足够的权限执行备份。
2. **备份目录**：选一个空间足够的目录存备份文件。
3. **压缩工具**：备份完成后要压缩，确认装了 gzip 或 zip 之类工具。

## 创建 Oracle 目录对象

expdp 的导出位置由 Oracle 的 DIRECTORY 对象决定，先在数据库里建一个指向备份目录的对象：

```plsql
CREATE DIRECTORY dumpdir AS '/path/to/backup/directory';
```

目录路径要真实存在，且 Oracle 用户有写权限。

## 备份脚本

新建 `backup_script.sh`，内容如下：

![配图](/images/csdn/figures/bash-expdp-csdn139348362.png)

```bash
#!/bin/sh
##########################################################################################
####                             ORACLE    EXPD                                       ####
##########################################################################################

# 设置 Oracle 环境变量
export ORACLE_HOME=/data/oracle/product/11.2.0
export PATH=$ORACLE_HOME/bin:$PATH

# 设置数据库连接信息
db_user="username"
db_password="password"
ORACLE_SID="orcl"
IP="192.168.0.1"
PORT="1521"

# 设置备份目录
ORACLE_DIRECTORY="dumpdir"

# 压缩目录
ZIP_DIR="/data/oracle_bak/"

# 导出目录
EXPD_DIR="/path/to/backup/directory"

# 备份时间
BAKUP_TIME=`date +%Y%m%d%H%M%S`

# 删除备份时间
DEL_TIME=`date -d "90 days ago" +%Y%m%d`

# 导出日志名称
LOGFILE=${ORACLE_SID}_${BAKUP_TIME}.log

# 导出备份名称
DUMPFILE=${ORACLE_SID}_${BAKUP_TIME}.dmp

# 执行备份
$ORACLE_HOME/bin/expdp ${db_user}/${db_password}@${IP}:${PORT}/${ORACLE_SID} DIRECTORY=${ORACLE_DIRECTORY} DUMPFILE=${DUMPFILE} LOGFILE=${LOGFILE} SCHEMAS=${db_user}

# 删除备份
rm -rf $EXPD_DIR${ORACLE_SID}_${BAKUP_TIME}*

# 压缩备份
zip -r ${ZIP_DIR}${db_user}_${BAKUP_TIME}.zip ${EXPD_DIR}${DUMPFILE} ${EXPD_DIR}${LOGFILE}

# 异地备份
curl -X POST http://172.16.194.5:8082/oraclebak -F "file=@${ZIP_DIR}${db_user}_${BAKUP_TIME}.zip"
```

> 注：脚本保留了原文写法，但有两处值得存疑：一是 `rm -rf $EXPD_DIR${ORACLE_SID}_${BAKUP_TIME}*` 位于压缩之前，会先删掉刚导出的 `.dmp`/`.log`，后面的 zip 将拿不到文件，推测原意是清理过期备份；二是变量 `DEL_TIME`（90 天前）定义后从未被使用。落地前这两处需要按自己的清理策略改写并验证。

脚本各段在做什么：

- **环境变量**：`ORACLE_HOME` 指向 Oracle 安装目录并加进 `PATH`，保证脚本在 cron 环境里也能找到 expdp。
- **连接信息**：用户名、密码、SID、IP、端口拼成 expdp 的连接串；`SCHEMAS=${db_user}` 表示按 schema 导出。
- **时间戳**：`BAKUP_TIME` 让每个备份文件名都带上 `%Y%m%d%H%M%S`，互不覆盖。
- **expdp**：`DIRECTORY=dumpdir` 对应前面创建的 Oracle 目录对象，导出的 `.dmp` 和 `.log` 都落在 `/path/to/backup/directory`。
- **zip**：把当次的 `.dmp` 和 `.log` 打成一个 zip，移到压缩目录，避免导出目录被历史文件撑爆。
- **curl**：`-F "file=@..."` 以 multipart 形式把 zip POST 到远端的 `/oraclebak` 接口，完成异地备份。

## 设置定时任务

`crontab -e` 编辑定时任务，每天凌晨 3 点执行：

```cron
0 3 * * * /bin/bash /path/to/backup_script.sh
```

## 异地备份：OpenResty 接收端

远端机器用 OpenResty 搭一个上传接口。`upload.lua` 基于 resty.upload 处理 multipart 上传，把文件写到本地目录：

```lua
-- upload.lua
--==========================================
-- 文件上传
--==========================================
local upload = require "resty.upload"
local cjson = require "cjson"
local chunk_size = 4096
local form, err = upload:new(chunk_size)
if not form then
    ngx.log(ngx.ERR, "failed to new upload: ", err)
    ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
end
form:set_timeout(1000)
-- 字符串 split 分割
string.split = function(s, p)
    local rt= {}
    string.gsub(s, '[^'..p..']+', function(w) table.insert(rt, w) end )
    return rt
end
-- 支持字符串前后 trim
string.trim = function(s)
    return (s:gsub("^%s*(.-)%s*$", "%1"))
end
-- 文件保存的根路径
local saveRootPath = ngx.var.store_dir
-- 保存的文件对象
local fileToSave
--文件是否成功保存
local ret_save = false
while true do
    local typ, res, err = form:read()
    if not typ then
        ngx.say("failed to read: ", err)
        return
    end
    if typ == "header" then
        -- 开始读取 http header
        -- 解析出本次上传的文件名
        local key = res[1]
        local value = res[2]
        if key == "Content-Disposition" then
            -- 解析出本次上传的文件名
            -- form-data; name="testFileName"; filename="testfile.txt"
            local kvlist = string.split(value, ';')
            for _, kv in ipairs(kvlist) do
                local seg = string.trim(kv)
                if seg:find("filename") then
                    local kvfile = string.split(seg, "=")
                    local filename = string.sub(kvfile[2], 2, -2)
                    if filename then
                        fileToSave = io.open(saveRootPath .. filename, "w+")
                        if not fileToSave then
                            ngx.say("saveRootPath: ", saveRootPath)
                            ngx.say("failed to open file ", filename)
                            return
                        end
                        break
                    end
                end
            end
        end
    elseif typ == "body" then
        -- 开始读取 http body
        if fileToSave then
            fileToSave:write(res)
        end
    elseif typ == "part_end" then
        -- 文件写结束，关闭文件
        if fileToSave then
            fileToSave:close()
            fileToSave = nil
        end

        ret_save = true
    elseif typ == "eof" then
        -- 文件读取结束
        break
    else
        ngx.log(ngx.INFO, "do other things")
    end
end
if ret_save then
    ngx.say("save file ok")
end
```

接收逻辑的核心是循环调用 `form:read()`：读到 header 就解析出文件名并创建目标文件，读到 body 就写入，`part_end` 关闭文件，`eof` 结束。

在 OpenResty 配置文件里挂上接口：

```nginx
set $store_dir "/data/oraclebak/";
# 数据库备份文件上传接口
location /oraclebak {
    client_max_body_size 2048M;
    allow 172.10.0.0/16;
    deny all;
    content_by_lua_file conf/lua/upload.lua; # 实现文件上传的逻辑
}
location /oracledownload {
    autoindex on;
    allow 172.10.0.0/16;
    deny all;
    alias /data/oraclebak;
}
```

两个 location 各管一头：`/oraclebak` 只收上传（`client_max_body_size 2048M` 允许大文件），`/oracledownload` 开了 autoindex，供人工下载核验备份。

这条接收链路可以在 OpenResty 容器里完整实测（openresty/openresty:alpine，`conf/lua/upload.lua` 与上面的配置原样载入）：上传后接口返回 `save file ok`，文件按原名落地，`cat` 校验内容一致。

![配图1](/images/csdn/figures/bash-expdp-csdn139348362-1.png)

## 注意事项

- 脚本里的连接串把密码明文写在命令行和变量里，落地时注意文件权限，最好换成 Oracle 钱包或受控的凭证文件。
- 原文中备份端 curl 的目标 `172.16.194.5` 与接收端 `allow 172.10.0.0/16` 网段不一致，实际部署时两边的 IP 与网段要对齐，否则 `deny all` 会直接把上传拒掉。
- 清理过期备份的策略要自己补上（原文的 `DEL_TIME` 没有用起来），否则备份目录和远端磁盘迟早被写满。
- 定时任务的时间要避开业务高峰，备份期间的 IO 占用不可忽视。
- expdp 备份脚本整体未实跑（Oracle 环境无法容器化），落地前先在测试库演练一遍；接收端链路已在 OpenResty 容器实测通过。

回到开头的担忧：这套方案的价值就在"备份不在本机"——数据库服务器连同本地盘一起消失时，异地的 zip 和下载接口还在。部署完用上面的实测方法传一个测试包，确认能落地、能下载，这套备份才算真的能兜底。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
