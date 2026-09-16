---
title: "Scheduled Oracle Backups with Bash Scripts and expdp, Shipped Off-Site"
date: 2024-06-01 09:15:00
updated: 2026-09-14
categories: [Tech, Oracle]
tags: [Oracle]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1561233835-f937539b95b9?w=1600&q=80&fm=jpg
lang: en
---

An Oracle backup isn't a real safety net if it only lives on the database server itself: if the local disk dies or the machine disappears, the backup disappears with it. This post records a complete working setup — expdp exports the database on a schedule, a script handles compressing and packaging, and the backup is then uploaded to another server through a receiving endpoint built with OpenResty.

## Prerequisites

1. **Database connection details**: you can connect to the Oracle database you want to back up, and the account has enough privileges to run the export.
2. **Backup directory**: pick a directory with enough free space to store the backup files.
3. **Compression tools**: the backup gets compressed after export, so make sure gzip, zip, or something similar is installed.

## Create the Oracle Directory Object

Where expdp writes its output is controlled by an Oracle DIRECTORY object, so first create one in the database pointing at the backup directory:

```plsql
CREATE DIRECTORY dumpdir AS '/path/to/backup/directory';
```

The path must actually exist, and the Oracle user must have write access to it.

## The Backup Script

Create `backup_script.sh` with the following content:

```bash
#!/bin/sh
##########################################################################################
####                             ORACLE    EXPD                                       ####
##########################################################################################

# Set Oracle environment variables
export ORACLE_HOME=/data/oracle/product/11.2.0
export PATH=$ORACLE_HOME/bin:$PATH

# Set database connection details
db_user="username"
db_password="password"
ORACLE_SID="orcl"
IP="192.168.0.1"
PORT="1521"

# Set the backup directory
ORACLE_DIRECTORY="dumpdir"

# Compression directory
ZIP_DIR="/data/oracle_bak/"

# Export directory
EXPD_DIR="/path/to/backup/directory"

# Backup timestamp
BAKUP_TIME=`date +%Y%m%d%H%M%S`

# Deletion timestamp
DEL_TIME=`date -d "90 days ago" +%Y%m%d`

# Export log file name
LOGFILE=${ORACLE_SID}_${BAKUP_TIME}.log

# Export dump file name
DUMPFILE=${ORACLE_SID}_${BAKUP_TIME}.dmp

# Run the backup
$ORACLE_HOME/bin/expdp ${db_user}/${db_password}@${IP}:${PORT}/${ORACLE_SID} DIRECTORY=${ORACLE_DIRECTORY} DUMPFILE=${DUMPFILE} LOGFILE=${LOGFILE} SCHEMAS=${db_user}

# Remove the backup
rm -rf $EXPD_DIR${ORACLE_SID}_${BAKUP_TIME}*

# Compress the backup
zip -r ${ZIP_DIR}${db_user}_${BAKUP_TIME}.zip ${EXPD_DIR}${DUMPFILE} ${EXPD_DIR}${LOGFILE}

# Off-site backup
curl -X POST http://172.16.194.5:8082/oraclebak -F "file=@${ZIP_DIR}${db_user}_${BAKUP_TIME}.zip"
```

> Note: the script keeps the original source as-is, but two things are worth questioning. First, `rm -rf $EXPD_DIR${ORACLE_SID}_${BAKUP_TIME}*` runs before the compression step, so it deletes the freshly exported `.dmp`/`.log` before the zip that follows can pick them up — the original intent was presumably to clean up expired backups. Second, the `DEL_TIME` variable (90 days ago) is defined but never used. Adapt and verify both spots against your own retention policy before putting this into production.

What each part of the script does:

- **Environment variables**: `ORACLE_HOME` points at the Oracle installation and is added to `PATH`, so the script can find expdp even when run from cron.
- **Connection details**: username, password, SID, IP, and port are assembled into the expdp connection string; `SCHEMAS=${db_user}` means export by schema.
- **Timestamps**: `BAKUP_TIME` stamps every backup file name with `%Y%m%d%H%M%S`, so runs never overwrite each other.
- **expdp**: `DIRECTORY=dumpdir` corresponds to the Oracle directory object created earlier; both the exported `.dmp` and `.log` land in `/path/to/backup/directory`.
- **zip**: packs the current `.dmp` and `.log` into a single zip and moves it to the compression directory, so the export directory doesn't fill up with history.
- **curl**: `-F "file=@..."` POSTs the zip to the remote `/oraclebak` endpoint as multipart form data, completing the off-site backup.

## Schedule It with Cron

Edit the crontab with `crontab -e` and run the job at 3 a.m. every day:

```cron
0 3 * * * /bin/bash /path/to/backup_script.sh
```

## Off-Site Backup: The OpenResty Receiver

The remote machine runs an upload endpoint built on OpenResty. `upload.lua` handles the multipart upload with resty.upload and writes the file to a local directory:

```lua
-- upload.lua
--==========================================
-- File upload
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
-- String split helper
string.split = function(s, p)
    local rt= {}
    string.gsub(s, '[^'..p..']+', function(w) table.insert(rt, w) end )
    return rt
end
-- Trim leading/trailing whitespace of strings
string.trim = function(s)
    return (s:gsub("^%s*(.-)%s*$", "%1"))
end
-- Root path where uploaded files are saved
local saveRootPath = ngx.var.store_dir
-- The file object being saved
local fileToSave
-- Whether the file was saved successfully
local ret_save = false
while true do
    local typ, res, err = form:read()
    if not typ then
        ngx.say("failed to read: ", err)
        return
    end
    if typ == "header" then
        -- Start reading the http header
        -- Parse out the uploaded file name
        local key = res[1]
        local value = res[2]
        if key == "Content-Disposition" then
            -- Parse out the uploaded file name
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
        -- Start reading the http body
        if fileToSave then
            fileToSave:write(res)
        end
    elseif typ == "part_end" then
        -- File writing finished, close the file
        if fileToSave then
            fileToSave:close()
            fileToSave = nil
        end

        ret_save = true
    elseif typ == "eof" then
        -- Reading finished
        break
    else
        ngx.log(ngx.INFO, "do other things")
    end
end
if ret_save then
    ngx.say("save file ok")
end
```

The core of the receiving logic is a loop around `form:read()`: a header chunk triggers parsing the file name and creating the target file, body chunks get written out, `part_end` closes the file, and `eof` ends the loop.

Wire the endpoint into the OpenResty config:

```nginx
set $store_dir "/data/oraclebak/";
# Database backup file upload endpoint
location /oraclebak {
    client_max_body_size 2048M;
    allow 172.10.0.0/16;
    deny all;
    content_by_lua_file conf/lua/upload.lua; # implements the file upload logic
}
location /oracledownload {
    autoindex on;
    allow 172.10.0.0/16;
    deny all;
    alias /data/oraclebak;
}
```

The two locations each handle one end: `/oraclebak` only accepts uploads (`client_max_body_size 2048M` allows large files), while `/oracledownload` turns on autoindex so backups can be downloaded and verified manually.

This receiving path was fully tested in an OpenResty container (openresty/openresty:alpine, with `upload.lua` loaded as-is; a container-local curl needs to get through, so `allow 127.0.0.1;` was added to the whitelist): after upload the endpoint returned `save file ok`, the file landed under its original name, `cat` confirmed identical content, and the autoindex at `/oracledownload` listed the package.

![Upload test at the receiving end](/images/csdn/figures/bash-expdp-csdn139348362-1.png)

## Notes and Caveats

- The script puts the password in plain text on the command line and in variables; watch file permissions when deploying, and ideally switch to an Oracle wallet or a controlled credentials file.
- In the original article, the backup side's curl target `172.16.194.5` doesn't match the receiver's `allow 172.10.0.0/16` network. In a real deployment the IPs and subnets on both sides must line up, or `deny all` will simply reject the upload.
- The expired-backup cleanup policy is left to you (the original's `DEL_TIME` was never wired up), otherwise the backup directory and the remote disk will fill up sooner or later.
- Schedule the job outside business peak hours — the I/O load during a backup is not negligible.
- The expdp backup script was never executed end-to-end (an Oracle environment can't be containerized here), so rehearse it once against a test database before production; the receiving path, however, was tested and passed in an OpenResty container.

Back to the worry at the top: this setup earns its keep precisely because "the backup is not on this machine" — when the database server vanishes along with its local disk, the off-site zip and the download endpoint are still there. After deploying, push one test package using the verified method above and confirm it lands and can be downloaded; only then does the backup actually hold the line.

> This post was rewritten from the author's CSDN blog articles originally published between 2020 and 2024 on CSDN.
