---
title: "Cobbler 自动装机：从部署到 PXE 批量装系统（Rocky Linux 9，附 CentOS 7 差异）"
date: 2020-04-06 20:59:23
categories: [技术]
tags: [Linux]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1587831990711-23ca6441447b?w=1600&q=80&fm=jpg
updated: 2026-09-14
---

机房里十几台新机器等着装系统，一台台插 U 盘不现实。Cobbler 把 PXE 引导、DHCP、应答文件串成一整套，机器开机选网络启动就能自动装完。这篇按部署顺序完整走一遍，从装服务到按 MAC 定制装机。主环境为 Rocky Linux 9 + Cobbler 3.3.7（EPEL），服务端部署、DHCP 接管、distro/profile/system 建档与 PXE 制品生成均在 Rocky 9 容器实测（容器内核与网络条件所限，真实客户机 PXE 引导那一跳未实测）；Cobbler 3.x 相对 CentOS 7 时代的 2.x 变化很大，文末附老版本差异对照。

官方文档：[cobbler](https://cobbler.readthedocs.io/en/latest/)

## 先看这个：Cobbler 2.x → 3.x 高频变化

CentOS 7 老教程（包括本文历史版本）在 3.x 上直接照搬会四处碰壁，先把最常撞上的差异列全：

| 2.x（CentOS 7）写法 | 3.x（Rocky 9）写法 | 实测结果 |
|---------------------|---------------------|----------|
| 配置文件 `/etc/cobbler/settings` | `/etc/cobbler/settings.yaml` | 格式改 YAML |
| `manage_dhcp: 1` | `manage_dhcp_v4: true` | 只改旧键**不生效**，sync 不渲染 DHCP |
| `--kickstart=/path/xx.ks` | `--autoinstall=xx.ks` | 路径相对 `/var/lib/cobbler/templates/` |
| `system add --subnet=` | `system add --netmask=` | 旧选项直接报错 no such option |
| `sample_end.ks` | `default.ks` | 模板目录迁到 `/var/lib/cobbler/templates/` |
| `cobbler get-loaders` | `cobbler mkloaders` | 命令已更名 |
| syslinux（pxelinux.0） | el9 仓库**没有** syslinux | BIOS PXE 的 pxelinux.0 需自行放置 |
| `cobbler-web` 包 | EPEL9 无此包（实测 dnf 无匹配） | Web 界面按官方文档另行安装 |

## 前置条件

- Rocky Linux 9 服务器一台（root 权限），客户机与它**同网段**；
- `/var` 分区剩余空间 ≥ 10GB（每导入一个发行版占 5-10GB）；
- 关闭 SELinux（PXE/TFTP 会受它干扰），防火墙放行 dhcp(67/68)/http(80)/tftp(69) 端口；
- 网络里没有其他 DHCP 服务抢答（两个 DHCP 会随机响应，装机时灵时不灵）。

关 SELinux：改配置文件重启后彻底生效，当前会话用 `setenforce 0` 过渡：

```bash
sed -i s#SELINUX=enforcing#SELINUX=disabled#g /etc/selinux/config
grep "SELINUX=" /etc/selinux/config
setenforce 0 && getenforce
```

## 一、安装与启动

EPEL 源就绪后一次装齐，启动 cobblerd，然后跑 `cobbler check`——它列出当前环境的问题清单，是整个部署过程的导航（每步做完回来复查）：

```bash
dnf install -y epel-release
dnf install -y cobbler dhcp-server tftp-server pykickstart httpd
systemctl start cobblerd
cobbler check
```

![配图1](/images/csdn/figures/linux-cobbler-csdn105320427-1.png)

首查 9 条。它给的是建议，不必每条都执行：本文处理 1（server）、2（next_server_v4）、8（默认密码）这三条必改项，加上 DHCP 接管和 tftp 相关配置；3（next_server_v6，不做 IPv6 PXE 可跳过）、4（boot-loaders，见下文 loaders 一节）、5-7/9（reposync、debmirror、fencing 等可选功能）视需要处理。

## 二、按 check 建议修配置

**1+2. server 与 next_server_v4：改成本机真实 IP**。编辑 `/etc/cobbler/settings.yaml`：server 是新装机下载应答文件用的地址，next_server_v4 是 PXE 客户机下载启动文件的 TFTP 地址，两者都配成 cobbler 服务器的真实 IP（示例容器环境是 172.17.0.6，实机换成你的）。注意 YAML 对缩进和冒号后空格敏感，改动前先备份。

**8. 换掉默认 root 密码**。`default_password_crypted` 是新装系统 root 的密码哈希，默认值是公开的 `cobbler`，必须换。用 check 建议的 openssl 命令生成，把输出替换进 settings.yaml：

![配图2](/images/csdn/figures/linux-cobbler-csdn105320427-2.png)

**3. 接管 DHCP**。这里埋着 3.x 最大的坑：settings.yaml 里同时有 `manage_dhcp` 和 `manage_dhcp_v4`/`manage_dhcp_v6` 两个时代的开关，实测只把旧键 `manage_dhcp` 改成 true 时，`cobbler sync` 走完流程却**不渲染任何 DHCP 配置**——必须写 `manage_dhcp_v4: true`。

DHCP 模板在 `/etc/cobbler/dhcp.template`，通常只改子网几行：subnet 的网段、掩码要和服务器网卡真实所在网段一致，`routers` 填真实网关。实测中把掩码写成与网卡不符（网卡 /16、模板 /24），`dhcpd -t` 语法检查能过，但 `systemctl restart dhcpd` 会失败（dhcpd 找不到匹配接口的子网声明直接退出）——sync 的报错只有一句 "Restarting service dhcpd failed"，真相在 `journalctl -u dhcpd` 里。

配置完成，重启 cobblerd 并 sync：

![配图3](/images/csdn/figures/linux-cobbler-csdn105320427-3.png)

sync 做三件事：用模板渲染 `/etc/dhcp/dhcpd.conf`（grep 能看到子网和 `next-server`）、跑 `dhcpd -t` 语法自检、重启 dhcpd。三步全绿（`*** TASK COMPLETE ***`、dhcpd 变 active），DHCP 就归 cobbler 管了。

**4. 引导装载程序（loaders）**。2.x 的 `cobbler get-loaders` 在 3.x 已更名为 `cobbler mkloaders`。实测在 el9 上它会如实报告缺什么：ipxe 目录缺失时装不了 iPXE，**syslinux 在 el9 仓库已消失**，pxelinux.0 无法生成；装上 `grub2-tools-minimal`、`ipxe-bootimgs`、`shim-*` 后能产出 grub/undionly 部分制品。x86_64 实机的完整路径：UEFI 机器走 grub/shim（mkloaders 可生成），老 BIOS 机器的 pxelinux.0 需要从 syslinux 项目自行下载放到 `/var/lib/cobbler/loaders/`——check 第 4 条官方也明说"只做 x86/x86_64 网络启动可忽略"。

**5. 启用 TFTP**。el9 的 tftp 由 `tftp-server` 提供 socket 激活：`systemctl enable --now tftp.socket` 即可，不再需要 2.x 时代改 xinetd 配置那一套。

## 三、建档：distro、profile、system

Cobbler 的对象模型是三层：distro（内核+initrd）→ profile（发行版+应答文件）→ system（机器绑定 profile）。导入发行版有两条路：

**经典路径 `cobbler import`**：把发行版 ISO 挂载后导入，自动识别签名创建 distro 和 profile：

```bash
mount rocky-9.4-x86_64-dvd.iso /mnt/
cobbler import --path=/mnt/ --name=rocky9-x86_64 --arch=x86_64
cobbler profile report --name=rocky9-x86_64
```

**轻量路径 `distro add`**：手头只有内核和 initrd 文件时直接建档。容器里实测用了已装 `kernel-core` 的 `/boot` 文件（实机同样适用——升级过的服务器 `/boot` 下就有现成的内核对）：

```bash
dnf install -y kernel-core
KV=$(ls /boot/vmlinuz-* | head -1 | sed 's|/boot/vmlinuz-||')
cobbler distro add --name=rocky9-demo --kernel=/boot/vmlinuz-$KV \
  --initrd=/boot/initramfs-$KV.img --breed=redhat
cobbler profile add --name=rocky9-demo --distro=rocky9-demo --autoinstall=default.ks
```

两个 3.x 细节：应答文件选项叫 `--autoinstall`（不叫 `--kickstart`），且路径必须写成相对 `/var/lib/cobbler/templates/` 的文件名，写绝对路径会报 "Invalid automatic installation template file location"（实测踩中）。生产上把自己的模板放进 templates 目录再引用。

建好 profile 后 report 看关键字段：

![配图4](/images/csdn/figures/linux-cobbler-csdn105320427-4.png)

注意字段名：2.x 的 `Kickstart` 在 3.x 叫 `Automatic Installation Template`。`cobbler status` 此刻是张空表（还没有机器来装过），客户机开始装机后这里会出现 IP、进度和状态，是批量装机时最有用的观察窗口。

## 四、按 MAC 定制装机

给指定机器预分配 IP、主机名。规划：MAC `52:54:00:11:22:33`，IP 172.17.0.123/24，网关 172.17.0.1，主机名 node1：

```bash
cobbler system add --name=node1 --profile=rocky9-demo \
  --mac=52:54:00:11:22:33 --ip-address=172.17.0.123 \
  --netmask=255.255.255.0 --gateway=172.17.0.1 \
  --hostname=node1 --interface=eth0 --static=1
cobbler sync
```

- `--mac` 是关键开关：只有 MAC 匹配的机器才按此配置自动装，未登记的机器停在 PXE 菜单等人工选择；
- `--netmask` 取代了 2.x 的 `--subnet`，写旧名直接报 no such option；
- `--interface` 填的是客户端记录的网卡名（如 eth0），不是 cobbler 服务器的网卡。

sync 之后验证：`/var/lib/tftpboot/pxelinux.cfg/` 下出现以 MAC 命名的配置（`01-52-54-00-11-22-33`），`images/` 下是对应 distro 的内核链接——PXE 菜单和引导文件全部就位：

![配图5](/images/csdn/figures/linux-cobbler-csdn105320427-5.png)

到这里装机环境就绪：客户机与 cobbler 同网段、第一启动项为 PXE，加电即自动安装。

## 五、已装机器在线重装（koan）

在需要重装的机器上用 koan 发起重装：`koan --server=<cobbler IP> --list=profiles` 看 profile，`koan --replace-self --server=<IP> --profile=<名>` 把安装内核写进本地引导项，重启即自动重装，全程不碰 PXE 菜单。**注意这是破坏性操作**，`--replace-self` 后重启即格式化重装。

> 注：koan 在 EPEL9 有包（实测 `dnf list koan` 可见 3.0.1），但在线重装未在 Rocky 9 复测，操作流程来自原文与官方文档；重装生产机器前先用测试机演练。

## 六、自定义 yum 源（可选）

让新装机器直接用私网源：

```bash
cobbler repo add --name=my_repo --mirror=http://192.168.3.50/centos9 --breed=yum
cobbler reposync
cobbler profile edit --name=rocky9-demo --repos="my_repo"
```

装系统时会在 yum.repos.d 下自动生成 repo 文件。repo 需要定期同步，crontab 定时跑 `cobbler reposync` 即可。

## 历史版本差异（CentOS 7 + Cobbler 2.8）

老机器还在跑 CentOS 7 的话，流程骨架相同，细节按下面来。CentOS 7 已于 2024-06 EOL，安装前先把 repo 的 `baseurl` 切到 `http://vault.centos.org`（注释掉 `mirrorlist` 后 `yum clean all`）：

```bash
yum install -y epel-release cobbler cobbler-web dhcp xinetd tftp pykickstart
# /etc/cobbler/settings（非 YAML）：server 与 next_server 两行改本机 IP
openssl passwd -1 -salt 'random-phrase-here' 'your-password'
# 哈希填入 default_password_crypted
cobbler get-loaders                     # 2.x 专有命令
sed -i 's/disable = yes/disable = no/' /etc/xinetd.d/tftp   # xinetd 管 tftp
# manage_dhcp: 1 → cobbler sync         # 2.x 单一开关即可生效
```

2.8 的 import/koan/MAC 绑定流程与上文同构，选项用 `--kickstart`、`--subnet`。新装机一律建议直接按 Rocky 9 流程部署。

## 失败出口

- **改坏了 settings.yaml**：恢复备份后 `systemctl restart cobblerd && cobbler sync`；每次改配置都必须重启+sync 才生效。
- **sync 报 "Restarting service dhcpd failed"**：八成是模板子网与服务器网卡网段不符，`journalctl -u dhcpd` 看真实原因，改 `/etc/cobbler/dhcp.template` 后重新 sync。
- **sync 走完但 dhcpd.conf 没变化**：检查 `manage_dhcp_v4` 是否为 true——旧键 `manage_dhcp` 在 3.x 不触发渲染（实测踩中）。
- **DHCP 不想要 cobbler 管了**：`manage_dhcp_v4` 改回 false，sync 后手工维护 dhcpd.conf；开着管理时手工改会被覆盖。
- **删掉某个 MAC 绑定**：`cobbler system remove --name=node1 && cobbler sync`。
- **整个卸掉**：`dnf remove cobbler dhcp-server`，残留的 /var/lib/cobbler、/var/www/cobbler 手动清理。

## 常用命令速查

| 命令 | 作用 |
|------|------|
| `cobbler check` | 检查配置问题，给建议清单 |
| `cobbler mkloaders` | 生成引导装载程序（3.x，替代 get-loaders） |
| `cobbler import` | 导入镜像，新增 distro+profile |
| `cobbler distro/profile/system add` | 手工建档三层对象 |
| `cobbler list` / `report` | 列出条目 / 详细信息 |
| `cobbler sync` | 改配置后同步，重新生成 PXE/DHCP 配置 |
| `cobbler status` | 查看装机任务进度 |
| `cobbler reposync` | 同步 repo 源 |
| `cobbler profile edit` | 改 profile（换应答文件、挂 repo） |
| `cobbler system add/remove` | 管理 MAC 绑定 |

## 注意事项

- 每个导入的发行版占 5-10GB，规划好 /var 空间再导镜像。
- default_password_crypted 必须改掉，否则装出来的机器 root 密码是公开默认值。
- **老教程在 3.x 上不可照搬**：配置文件、开关名、子命令名都变了，动手前先跑 `cobbler check` 对照官方文档。
- **el9 没有 syslinux**：BIOS 老机器批量装前，确认 pxelinux.0 已经就位或全部走 UEFI。

---

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
