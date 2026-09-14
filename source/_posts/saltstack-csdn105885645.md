---
title: "SaltStack 安装、配置与 Minion 认证（Rocky Linux 9）"
date: 2020-05-02 01:11:40
updated: 2026-09-14
categories: [技术]
tags: [SaltStack]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1509803874385-db7c23652552?w=1600&q=80&fm=jpg
---

要在一批机器上统一执行命令、下发配置，一台台 SSH 上去敲显然不现实。SaltStack 就是为这个场景准备的：Master/Minion 架构下，控制端可以秒级触达成百上千台机器。本文在两台 Rocky Linux 9 容器上从零搭一套 SaltStack——装 Master 和 Minion、写最小配置、完成密钥认证、用 `salt` 命令验证通信——每一步都带验证点，照着走即可复现。

## SaltStack 是什么

Salt 是用 Python 开发的基础设施管理工具，部署轻松，几分钟内就能跑起来；扩展性好，很容易管理上万台服务器。核心能力三项：远程执行、配置管理、云管理。运行方式有四种：local、Minion/Master、Syndic、Salt SSH——本文主走 Minion/Master：每个受管机器装 Minion，控制端装 Master，Minion 主动连 Master 建立加密通道。

## 前置条件

- 两个节点：node1 当 Master（顺带装 Minion，让它自己也被管理），node2 只装 Minion；系统 Rocky Linux 9（RHEL 9 同源）
- 内网互通，且 node2 能解析/访问 node1 的 4505、4506 端口
- root 权限；EPEL 仓库可达（Salt 包来自 EPEL）

本次实测节点（Docker 双容器，主机名即 Minion ID）：

| 节点 | 主机名 | 角色 | Salt 版本 |
| --- | --- | --- | --- |
| node1 | master-node1 | master + minion | 3005.4 |
| node2 | minion-node2 | minion | 3005.4 |

## 安装步骤

### 第 1 步：启用 EPEL 并安装 Salt（两台都执行）

Rocky 9 的 EPEL 仓库直接提供 Salt 3005.x，Python 3 运行时，无需再操心旧版 Python 2 依赖：

```bash
dnf -y install epel-release
dnf -y install salt-master salt-minion   # node2 只装 salt-minion
```

验证点：`rpm -q salt` 输出 `salt-3005.4-1.el9.noarch`（版本号随 EPEL 更新会前进，3005.x 以上即可）。

![配图1](/images/csdn/figures/saltstack-csdn105885645-1.png)

### 第 2 步：master 配置（node1）

配置文件在 `/etc/salt` 下，按组件命名：`/etc/salt/master` 和 `/etc/salt/minion`，也支持 `/etc/salt/minion.d/*.conf` 片段式配置。默认 Master 监听所有接口（0.0.0.0）的 4505/4506，要绑定特定 IP 就在 `/etc/salt/master` 里改：

```diff
- #interface: 0.0.0.0
+ interface: 192.168.3.100
```

两个端口的分工：4505（publish_port）是消息发布端口，4506（ret_port）是 Minion 与 Master 通信返回的端口。防火墙放行这两个端口（命令见文末注意事项），容器环境无 firewalld，实测时跳过。

### 第 3 步：minion 配置（两台的 Minion 都要）

Minion 默认尝试连接 DNS 名 `salt`；解析不到就在 Minion 配置里指向 Master：

```diff
- #master: salt
+ master: 192.168.3.100
```

本次实测写的是 `/etc/salt/minion.d/m.conf`，内容一行 `master: saltm`（master 容器名）。内网有 DNS 的话，master 值配成主机名比裸 IP 更好维护。

### 第 4 步：Minion ID

每个 Minion 需要唯一标识，默认第一次启动时取 FQDN，存进 `/etc/salt/minion_id`。两条经验：

- id 定好就不要随意改——认证密钥是按 id 生成的，id 变了 Master 要像对待新机器一样重新接受认证。
- 真要改，先删 `/etc/salt/minion_id` 再改，否则 minion 启动时读旧文件，怎么改配置都不生效。

本次实测不改 id，直接用主机名：master-node1、minion-node2。

### 第 5 步：启动服务

物理机/虚拟机上有 systemd：

```bash
systemctl enable --now salt-master salt-minion   # node1
systemctl enable --now salt-minion               # node2
```

容器里没有 systemd，直接用守护模式启动（本次实测方式）：`salt-master -d`、`salt-minion -d`。

验证点：node1 上 `salt-key -L` 应在 Unaccepted Keys 里看到 master-node1 和 minion-node2——看到即说明 Minion 已主动连上 Master、公钥已送达。

## 完成认证

### 认证原理与指纹核对

流程两步：Minion 把自己的公钥发给 Master；Master 接受后把自己的公钥发给 Minion。此后双方通信全程 AES 加密。

正式接受前建议核对指纹，防连错 Master 或被 MiTM：Master 上 `salt-key -F master` 列出本地及各 Minion 指纹，Minion 上 `salt-call --local key.finger` 打印自己的指纹，两边一致才继续。

### 接受密钥

![配图2](/images/csdn/figures/saltstack-csdn105885645-2.png)

`salt-key -y -A` 接受全部待认证密钥（交互式逐台确认用 `salt-key -a 主机名`）。常用参数：`-L` 查看状态、`-a` 认证指定、`-A` 接受全部、`-d`/`-D` 删除指定/全部、`-r` 注销指定。

认证完成后，公钥在 PKI 目录里各就各位（默认 `/etc/salt/pki/`，首次启动自动生成）：

![配图3](/images/csdn/figures/saltstack-csdn105885645-3.png)

Master 侧两个 Minion 的公钥从 `minions_pre` 移入 `minions`；Minion 侧多出 `minion_master.pub`——Master 的公钥到了 Minion 手里，双向信任建立完成。

### 验证通信

![配图4](/images/csdn/figures/saltstack-csdn105885645-4.png)

`test.ping` 全部返回 True、`grains.get osfinger` 报出系统版本，Master 与 Minion 的加密通道即告打通。之后 `salt "*" cmd.run "hostname"` 这类远程执行可以随意组合 target（`*` 全部、`minion*` 通配、精确主机名）。

## 装坏了怎么办（回退）

```bash
dnf remove -y salt-master salt-minion
rm -rf /etc/salt        # 配置与 PKI 全部清掉，回到未安装状态
```

只想重做认证不清配置：Master 上 `salt-key -D` 删除全部密钥，Minion 上删 `/etc/salt/minion_id` 与 `/etc/salt/pki/minion/` 后重启 salt-minion，重新走认证。

## 常见报错

- **`salt '*' test.ping` 返回 `Minion did not return. [No response]`**：本次实测首连阶段就出现过一次——Minion 刚完成认证还没重连上发布通道。等几秒重试即可；仍无响应则重启 salt-minion 再试。
- **Minion 一直躺在 Unaccepted**：多半是 4505/4506 没放行，或 master 指向写错（解析不到/端口不通）。
- **改了 id 不生效**：删 `/etc/salt/minion_id` 再重启 salt-minion。
- **firewalld 拒绝放行**：确认命令带了 `--permanent` 且之后执行了 `firewall-cmd --reload`，否则规则重启即失效。

## 注意事项

- **Minion ID 一旦认证就不要随意更改**：密钥按 id 生成，id 变了要重新认证；要改先删 minion_id 文件。
- **指纹核对不是可选项**：机器多时逐一 `salt-key -a` 并核对指纹，`-A` 一口气全收容易把陌生机器收进来。
- **记住端口分工**：4505 发布、4506 返回，防火墙只放行这两个 TCP 端口。
- **认证后 salt-key -L 里不该再有 Unaccepted**：出现了就是新机器接入或 id 变更，先核对再决定收不收。

## 历史版本差异（CentOS 7）

原文流程基于 CentOS 7.7 双机实战：安装走 `yum install https://repo.saltstack.com/yum/redhat/salt-repo-latest.el7.noarch.rpm`，运行时是 Python 2.7.5。Rocky 9 的差异只有两处——安装源换成 EPEL（`dnf install epel-release` 后直接装包），运行时换成 Python 3；配置文件位置、4505/4506 端口、`salt-key` 认证流程与命令完全一致，老环境可按对照表平移。

> 本文由作者 2020-2024 年间的 CSDN 博客文章重构而来，原发布于 CSDN。
