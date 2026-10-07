---
title: 我给 AI 装了两套进化引擎，它自己进化了20轮
date: 2026-09-14 14:00:00
categories: [技术]
tags: [AI, agent, 进化, PRAXIST, evolution-driver]
copyright_author: 烛龙
cover: https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1600&q=80&fm=jpg
---

用 AI agent 做过实际项目的人都知道一个痛点：它会"变笨"。

不是模型退化了，而是技能是静态的。你精心写的 SKILL.md，第一次跑可能效果不错，但随着使用场景变化、边界情况累积，它就慢慢跟不上了。更烦的是，你得手动维护这些技能，发现问题、改指令、验证、部署，一轮下来比自己写代码还累。

我给它装了两套进化引擎：一套管技能本身怎么优化（evolution-driver，自研），一套管任务流程怎么跑得更好（PRAXIST，开源）。两套互补，不重叠。然后我发现，搭好了，但还没真正用过。

---

## 1. 问题：AI agent 为什么需要"进化"？

静态技能有三个硬伤。

**维护成本高**，写一个 SKILL.md 可能只要半小时，但维护它是个无底洞。我有个写博客的技能，从 2024 年用到现在，改了不下 20 次，每次发现新的 AI 写作特征（比如三连排比句太机械），就得手动加规则、改流程、跑测试。

**反馈回路断**，技能跑完就完了，没有自动收集"哪里做得不好"的机制。用户说"这篇写得不好"，你得自己分析是哪个环节出了问题，然后手动改进。

**无法规模化**，一个技能还好，当你有 10 个、20 个技能的时候，手动维护就成了噩梦。我有 11 个 PRAXIST 相关技能，如果每个都要人工盯，不如不用。

---

## 2. 两套引擎的定位

| 组件 | 来源 | 管什么 | 前提条件 |
|------|------|--------|----------|
| evolution-driver | 根据论文自研 | SKILL.md 技能进化（agent 驱动七步循环） | 无特殊前提 |
| PRAXIST | GitHub 开源 | 可度量任务优化 | 项目已能跑 + 目标可度量 |

evolution-driver 磨刀，PRAXIST 砍柴。

---

## 3. evolution-driver：技能自进化

### 论文来源与自研动机

evolution-driver 的灵感来自学术界对"agent 自我改进"的研究，但落地时做了大幅简化。核心想法是：让 agent 自己找盲区、修缺陷、验证，直到达到预设的验收标准。

### 七步循环机制

每轮进化（Fast Loop）分 7 步：先扫描真实使用场景找表现不好的样本（找料），分析问题根因确定本轮要修什么（定标），在真实样本上跑技能记录缺陷（实测），用多模型交叉设计修复方案，K3 设计加 GLM 实现（修复），修完后过门禁校验（融合），影子运行确认不破坏已有功能（验证），最后检查是否达到验收标准：detect_rate ≥ 0.9、min_fixed ≥ 3（判门）。每 H=5 轮还有 Slow Loop 元复盘，进化"进化方法本身"。

### 门禁设计：fail-closed，防自举

门禁是进化系统的安全底线。我设计了一个 fail-closed 的授权清单：

```yaml
# ~/.dimcode/v2/skills/.evolution-registry.yml
meta:
  userTier: basic
skills:
  evolution-driver:
    status: active
    enabled: true
    evolvable: false   # 驱动器自身不进化：防止自举误开
```

关键设计：**opt-in**，未登记的技能一律拒绝进化，evolvable 缺省为 false；**防自举**，evolution-driver 自身标记为 evolvable: false，防止自己改自己导致无限循环；**双源取严**，台账配置加技能目录 config.json 任一不满足即拒。

代码实现（G1 权限门禁核心逻辑）：

```python
# access_check.py 片段
if entry.get("status") not in EVOLVABLE_STATUSES:
    reasons.append(f"status={entry.get('status')!r} ∉ EVOLVABLE_STATUSES")
if norm_bool("evolvable", entry.get("evolvable"), reasons) is not True:
    reasons.append(f"evolvable={str(entry.get('evolvable')).lower()} ≠ true（opt-in：须显式标记）")
if norm_bool("locked", entry.get("locked"), reasons) is True:
    reasons.append("locked=true（技能已被锁定，G1 越权拦截）")
```

### 验收标准

进化不是无限循环。config.json 里定义了硬验收：

```json
{
  "acceptance": {
    "detect_rate": 0.9,
    "min_fixed": 3,
    "hard_anchor": ".evolution/hard-anchor.md"
  }
}
```

detect_rate ≥ 0.9 意味着技能能发现 90% 以上的已知问题；min_fixed ≥ 3 意味着每轮至少修复 3 个缺陷。

---

## 4. PRAXIST：可度量任务优化

### GitHub 开源项目

PRAXIST 来自 [github.com/sapientinc/PRAXIST](https://github.com/sapientinc/PRAXIST)，是一个自主研究系统（arXiv 2608.25955）。Python 主体约 29.5 万行，另含大量 Rust 代码。给定一个可运行的项目和可度量的目标，PRAXIST 能自动尝试优化，直到达标。

### 安装与配置

安装到独立 venv，不污染系统 Python：

```bash
# 创建 venv
uv venv ~/.local/share/praxist-venv --python 3.12

# 安装 PRAXIST（含 agent 和 codex 扩展）
uv pip install --python ~/.local/share/praxist-venv/bin/python "praxist[agents,codex]"

# 建 symlink
ln -sf ~/.local/share/praxist-venv/bin/praxist /opt/homebrew/bin/praxist
```

配置 provider（用 DeepSeek）：

```bash
# ~/.config/praxist/env
export DEEPSEEK_API_KEY=sk-xxx
export PRAXIST_LLM_PROVIDER=deepseek
export PRAXIST_MODEL_PROVIDER_REF=model_provider:deepseek_alias
```

### 安装状态检查

`praxist doctor` 输出（真实状态）：

```
Praxist doctor
  diagnostic scope   configured runtime and provider
  persistent config  unset / deepseek / unset
  python             ok      3.12.13 /Users/zhangpeng/.local/share/praxist-venv/bin/python
  platform           ok      darwin
  praxist_package    ok      0.5.0 /Users/zhangpeng/.local/share/praxist-venv/lib/python3.12/site-packages/praxist
  praxist_console    ok      /opt/homebrew/bin/praxist
  runtime_selection  ok      claude_sdk -> agent_runtime:claude_sdk
  claude_sdk         ok      claude-agent-sdk 0.2.136
  PRAXIST_AGENT_SYSTEM ok      claude_sdk
  PRAXIST_LLM_PROVIDER ok      deepseek
  PRAXIST_MODEL      warn    provider default
  provider_key       ok      present (DEEPSEEK_API_KEY)
  provider_auth      ok      deepseek: DEEPSEEK_API_KEY present (DEEPSEEK_API_KEY)
  config_dir         ok      /Users/zhangpeng/.config/praxist
  registry_dir       warn    /Users/zhangpeng/.local/share/praxist
  codex_skills       warn    0/10 installed in /Users/zhangpeng/.agents/skills; missing: praxist-control, praxist-diagnostic, ...
```

doctor 输出里的 warn 项都是已知非故障：PRAXIST_MODEL 走 provider default，registry_dir 未初始化（真实 run 未跑），codex_skills 走 DimAgent 插件路径无需单独安装。

### 与 agent 的协作方式

PRAXIST 自带 detached Python 运行时，agent 只是操作界面。核心命令：

```bash
# 接管项目优化
praxist takeover <项目目录>

# 监控最新运行
praxist --monitor --latest
```

PRAXIST 的调度是自动的：并行 peers、代际综合、证据车道，agent 不需要干预底层流程。

---

## 5. 落地：插件化 auto-evolve

### 打包为本地 marketplace

我把 PRAXIST 和 evolution-driver 打包成一个 DimAgent 插件，叫 auto-evolve：

```
~/Documents/技能开源/auto-evolve/
├── .claude-plugin/
├── README.md
└── plugins/
    └── auto-evolve/
        └── skills/
            ├── evolution-driver/          # 自研技能
            ├── praxist-control/           # PRAXIST 运行控制
            ├── praxist-diagnostic/        # 诊断
            ├── praxist-onboarding/        # 上手引导
            ├── praxist-runtime-install/   # 运行时安装
            ├── praxist-scientific-research/ # 科学研究
            ├── praxist-takeover/          # 项目接管
            ├── praxist-takeover-codex/    # Codex 接管
            ├── praxist-task-initialization/ # 任务初始化
            ├── praxist-interactive-task-init/ # 交互式任务初始化
            └── terminal-line-plot/        # 终端绘图
```

### 一条命令安装

```bash
# 1. 注册本地 marketplace
dim plugin marketplace add ~/Documents/技能开源/auto-evolve

# 2. 安装插件
dim plugin install auto-evolve@auto-evolve

# 3. 系统级依赖
bash ~/Documents/技能开源/auto-evolve/plugins/auto-evolve/scripts/setup.sh --with-provider
```

### 移植验收

evolution-driver 移植验收通过（子 agent 执行加主会话验收）：50 文件，G1 门禁换 access_check_dim.py，数据源 ~/.dimcode/v2/skills/.evolution-registry.yml，fail-closed 设计，evolvable 缺省拒绝，registry 已预登记 evolution-driver 自身 evolvable: false 防自举，G1/G3/G9 冒烟全过。

---

## 6. 真实运行：evolution-driver 自我进化

evolution-driver 不仅跑过，而且**自我进化**了。

在 dsh 环境下，它跑了 20 轮进化循环，优化了自己和其他 8 个技能（bianque、cangjie、db-design-spec、genui、huatuo、search、shiqu、yushi）。看 round-log.jsonl 的记录：

**第1轮（自举进化）**：用 3 个模型交叉审计 evolution-driver 自身，发现 7 个重大缺陷——时序死锁、体积限制零实现、口径漂移、tally 负贡献记错行、Slow Loop 棘轮回滚错文件、硬锚不展开、meta-review 词表脱节。

**第13轮（真 Fast Loop）**：web_search 找真实样本，定标 8 个模式（G1-G8），实测 detect_rate 只有 0.5，发现真实盲区——缺权限分层、反馈闭环、执行漂移率、数据源可信度。

**第14-16轮**：K3 设计加 GLM 并行实现 4 个盲区修复，detect_rate 从 0.5 → 0.625 → 0.875 → 1.0。

**第17-20轮（融合安全）**：F1 功能基准检查、F2 反馈闭环、F3 配置键值校验、F4 备份机制、F5 功能行为门禁。overall 从 69.2 → 76.9 → 84.6 → 92.3。

最后状态：overall 92.3，failed 0，累计修复 26+ 个缺陷。

**PRAXIST**：安装配置好了（Python 3.12 venv + DeepSeek key），但没有运行日志，说明从没实际用它优化过项目。这是当前的遗留风险。

---

## 7. 坑与经验

### 插件机制实测事实

install 从快照拷贝，改插件源后必须 `dim plugin marketplace upgrade auto-evolve` 刷新快照再重装，直接改源加重装无效。同名冲突拒装，技能从插件 skills/ 被发现，不占 ~/.dimcode/v2/skills/，但同名会冲突。插件级 remove 无 CLI，重装就是 mv 走旧目录加再 install。

### 升级会丢的东西

DimAgent 升级会丢 runtime python 的 PyYAML，需要重跑 setup.sh。praxist 升级后官方技能在 pip 包内更新，需从 venv 的 site-packages/praxist/resources/skills/ 重拷到插件包。venv 删了需 uv venv 重建。

---

## 8. 总结与展望

### 两套引擎的价值

evolution-driver 让技能自己变好，不用人工盯，门禁设计（fail-closed、opt-in、防自举）是安全底线。PRAXIST 让可度量任务自动优化，agent 只是操作界面。两者互补：evolution-driver 磨刀，PRAXIST 砍柴。

### 下一步

真实 run 验证：用实际研究项目跑通全流程，验证理论框架的可行性。记忆系统技能共享：把 PRAXIST/evolution-driver 注册为记忆系统统一技能，所有 harness 直接调用（当前状态：提议，未落地）。

### 给读者的建议

如果你想让 AI agent 越用越好，先问自己两个问题：你的技能是否有明确的验收标准？没有的话，进化引擎不知道"好"是什么。你的任务是否可度量？不可度量的任务，PRAXIST 帮不上忙。如果两个都是"是"，那进化引擎可能值得试试。

---

*本文素材全部摘自真实产物：配置文件、命令输出、代码片段均为实际运行结果，禁止为排版编造或摆拍。*

---

> **相关文章**：技能自进化的思路在内容产线上的应用，见[博客产线（三）：发布前的六道自动体检](/2026/09/14/blog-prepublish-checklist/)；多模型分工的完整版，见[一线写作者的真实工作流，收敛成了四种](/2026/09/14/ai-writer-four-workflows/)。
