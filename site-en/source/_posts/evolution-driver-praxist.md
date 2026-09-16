---
title: I Gave My AI Two Evolution Engines, and It Evolved Itself Through 20 Rounds
date: 2026-09-14 14:00:00
categories: [Tech]
tags: [AI, agent, evolution, PRAXIST, evolution-driver]
copyright_author: 烛龙
cover: https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1600&q=80&fm=jpg
lang: en
---

Anyone who has shipped a real project with AI agents knows the pain: the agent "gets dumber" over time.

It's not that the model is degrading — it's that skills are static. The SKILL.md you painstakingly wrote may work well the first time, but as usage scenarios shift and edge cases pile up, it gradually falls behind. Worse, you have to maintain these skills by hand: spot the problem, revise the instructions, verify, deploy — one round of that is more exhausting than writing the code yourself.

So I installed two evolution engines for it: one governs how the skills themselves get optimized (evolution-driver, built in-house), and the other governs how task workflows run better (PRAXIST, open source). The two complement each other without overlapping. Then I discovered something: they were set up — but not actually used yet.

---

## 1. The Problem: Why Do AI Agents Need to "Evolve"?

Static skills have three hard flaws.

**High maintenance cost.** Writing a SKILL.md may take half an hour, but maintaining it is a bottomless pit. I have a blog-writing skill that I've used since 2024 and modified no fewer than 20 times; every time I spot a new AI writing tell (like mechanically stacked parallel sentences), I have to add rules, revise the process, and run tests by hand.

**Broken feedback loop.** Once a skill finishes running, that's it — there's no mechanism to automatically collect "what went wrong." When a user says "this piece isn't well written," you have to figure out which step failed on your own, then improve it manually.

**No scalability.** One skill is manageable, but once you have 10 or 20 of them, manual maintenance becomes a nightmare. I have 11 PRAXIST-related skills — if each needed a human watcher, they wouldn't be worth using.

---

## 2. How the Two Engines Divide the Work

| Component | Source | What It Governs | Prerequisites |
|------|------|--------|----------|
| evolution-driver | Built in-house from a paper | SKILL.md skill evolution (agent-driven seven-step loop) | None |
| PRAXIST | GitHub open source | Measurable task optimization | Project already runs + goal is measurable |

evolution-driver sharpens the axe; PRAXIST chops the wood.

---

## 3. evolution-driver: Skill Self-Evolution

### Paper Origin and Why I Built It Myself

evolution-driver draws its inspiration from academic research on "agent self-improvement," but with substantial simplification for real-world use. The core idea: let the agent find its own blind spots, fix defects, and verify — until preset acceptance criteria are met.

### The Seven-Step Loop

Each evolution round (Fast Loop) has 7 steps: first scan real usage scenarios for underperforming samples (gather evidence), analyze root causes to decide what this round will fix (set targets), run the skill on real samples and log defects (live testing), design fixes with multi-model cross-review — K3 for design plus GLM for implementation (fix), then pass a gate check after the fix (integration), run a shadow run to confirm nothing existing broke (verification), and finally check whether acceptance criteria are met: detect_rate ≥ 0.9, min_fixed ≥ 3 (the gate). Every H=5 rounds there's also a Slow Loop meta-review that evolves "the evolution method itself."

### Gate Design: Fail-Closed, Anti-Bootstrapping

The gate is the safety floor of the evolution system. I designed a fail-closed authorization registry:

```yaml
# ~/.dimcode/v2/skills/.evolution-registry.yml
meta:
  userTier: basic
skills:
  evolution-driver:
    status: active
    enabled: true
    evolvable: false   # The driver itself never evolves: prevents runaway bootstrapping
```

Key design points: **opt-in** — unregistered skills are always denied evolution, with evolvable defaulting to false; **anti-bootstrapping** — evolution-driver itself is marked evolvable: false to prevent it from editing itself into an infinite loop; **dual-source strictness** — if either the registry config or the skill directory's config.json fails a condition, the request is denied.

The implementation (core logic of the G1 permission gate):

```python
# access_check.py excerpt
if entry.get("status") not in EVOLVABLE_STATUSES:
    reasons.append(f"status={entry.get('status')!r} ∉ EVOLVABLE_STATUSES")
if norm_bool("evolvable", entry.get("evolvable"), reasons) is not True:
    reasons.append(f"evolvable={str(entry.get('evolvable')).lower()} ≠ true (opt-in: explicit flag required)")
if norm_bool("locked", entry.get("locked"), reasons) is True:
    reasons.append("locked=true (skill is locked, G1 privilege escalation blocked)")
```

### Acceptance Criteria

Evolution is not an infinite loop. config.json defines hard acceptance:

```json
{
  "acceptance": {
    "detect_rate": 0.9,
    "min_fixed": 3,
    "hard_anchor": ".evolution/hard-anchor.md"
  }
}
```

detect_rate ≥ 0.9 means the skill can surface more than 90% of known problems; min_fixed ≥ 3 means at least 3 defects get fixed per round.

---

## 4. PRAXIST: Measurable Task Optimization

### The Open Source Project

PRAXIST comes from [github.com/sapientinc/PRAXIST](https://github.com/sapientinc/PRAXIST), an autonomous research system (arXiv 2608.25955). The Python core is roughly 295k lines, plus a substantial amount of Rust. Given a runnable project and a measurable goal, PRAXIST attempts optimization automatically until the target is hit.

### Installation and Configuration

Install into an isolated venv so the system Python stays clean:

```bash
# Create the venv
uv venv ~/.local/share/praxist-venv --python 3.12

# Install PRAXIST (with agent and codex extras)
uv pip install --python ~/.local/share/praxist-venv/bin/python "praxist[agents,codex]"

# Create a symlink
ln -sf ~/.local/share/praxist-venv/bin/praxist /opt/homebrew/bin/praxist
```

Configure the provider (using DeepSeek):

```bash
# ~/.config/praxist/env
export DEEPSEEK_API_KEY=sk-xxx
export PRAXIST_LLM_PROVIDER=deepseek
export PRAXIST_MODEL_PROVIDER_REF=model_provider:deepseek_alias
```

### Install Status Check

`praxist doctor` output (real state):

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

Every warn in the doctor output is a known non-issue: PRAXIST_MODEL falls back to the provider default, registry_dir is uninitialized (no real run has been executed), and codex_skills resolve through the DimAgent plugin path so no separate installation is needed.

### How the Agent Collaborates with PRAXIST

PRAXIST ships its own detached Python runtime; the agent is just the operator console. Core commands:

```bash
# Take over project optimization
praxist takeover <project-dir>

# Monitor the latest run
praxist --monitor --latest
```

PRAXIST's scheduling is automatic: parallel peers, generational synthesis, evidence lanes — the agent never needs to touch the underlying pipeline.

---

## 5. Shipping It: The Plugin-Based auto-evolve

### Packaged as a Local Marketplace

I packaged PRAXIST and evolution-driver into a DimAgent plugin called auto-evolve:

```
~/Documents/技能开源/auto-evolve/
├── .claude-plugin/
├── README.md
└── plugins/
    └── auto-evolve/
        └── skills/
            ├── evolution-driver/          # In-house skill
            ├── praxist-control/           # PRAXIST run control
            ├── praxist-diagnostic/        # Diagnostics
            ├── praxist-onboarding/        # Onboarding guide
            ├── praxist-runtime-install/   # Runtime installation
            ├── praxist-scientific-research/ # Scientific research
            ├── praxist-takeover/          # Project takeover
            ├── praxist-takeover-codex/    # Codex takeover
            ├── praxist-task-initialization/ # Task initialization
            ├── praxist-interactive-task-init/ # Interactive task initialization
            └── terminal-line-plot/        # Terminal plotting
```

### One-Command Install

```bash
# 1. Register the local marketplace
dim plugin marketplace add ~/Documents/技能开源/auto-evolve

# 2. Install the plugin
dim plugin install auto-evolve@auto-evolve

# 3. System-level dependencies
bash ~/Documents/技能开源/auto-evolve/plugins/auto-evolve/scripts/setup.sh --with-provider
```

### Porting Acceptance

evolution-driver passed its porting acceptance (executed by a sub-agent with acceptance in the main session): 50 files, G1 gate swapped to access_check_dim.py, data source at ~/.dimcode/v2/skills/.evolution-registry.yml, fail-closed design, evolvable denied by default, with the registry pre-registering evolution-driver itself as evolvable: false to prevent bootstrapping; G1/G3/G9 smoke tests all passed.

---

## 6. Real Runs: evolution-driver Evolving Itself

evolution-driver hasn't just run — it has **evolved itself**.

In the dsh environment, it ran 20 evolution rounds, optimizing itself and 8 other skills (bianque, cangjie, db-design-spec, genui, huatuo, search, shiqu, yushi). From the round-log.jsonl records:

**Round 1 (bootstrap evolution)**: three models cross-audited evolution-driver itself and found 7 major defects — a timing deadlock, a size limit with zero implementation, criteria drift, the tally counting negative contributions on the wrong row, Slow Loop ratchet rollback touching the wrong file, hard anchors not being expanded, and a meta-review vocabulary mismatch.

**Round 13 (a real Fast Loop)**: web_search gathered real samples, 8 patterns were targeted (G1-G8), live testing measured detect_rate at just 0.5, exposing real blind spots — missing permission tiering, missing feedback closure, execution drift rate, and data source credibility.

**Rounds 14-16**: K3 design plus GLM implemented fixes for 4 blind spots in parallel, moving detect_rate from 0.5 → 0.625 → 0.875 → 1.0.

**Rounds 17-20 (integration safety)**: F1 functional baseline check, F2 feedback closure, F3 config key validation, F4 backup mechanism, F5 functional behavior gate. Overall went 69.2 → 76.9 → 84.6 → 92.3.

Final state: overall 92.3, failed 0, 26+ defects fixed cumulatively.

**PRAXIST**: installed and configured (Python 3.12 venv + DeepSeek key), but there are no run logs — it has never actually been used to optimize a project. That's the outstanding risk.

---

## 7. Pitfalls and Lessons

### Field-Tested Facts About the Plugin Mechanism

install copies from a snapshot: after editing plugin sources you must run `dim plugin marketplace upgrade auto-evolve` to refresh the snapshot before reinstalling; editing sources and reinstalling directly does nothing. Same-name conflicts block installation; skills are discovered from the plugin's skills/ directory and don't occupy ~/.dimcode/v2/skills/, but name conflicts still apply. There is no plugin-level remove CLI — "reinstall" means moving the old directory aside and installing again.

### What Upgrades Throw Away

A DimAgent upgrade drops PyYAML from the runtime Python, so setup.sh must be re-run. After a praxist upgrade, the official skills update inside the pip package and must be re-copied from the venv's site-packages/praxist/resources/skills/ into the plugin package. If the venv is deleted, rebuild it with uv venv.

---

## 8. Summary and Outlook

### The Value of Two Engines

evolution-driver makes skills improve themselves with no human babysitter, and the gate design (fail-closed, opt-in, anti-bootstrapping) is the safety floor. PRAXIST automates optimization for measurable tasks, with the agent as a mere console. The two complement each other: evolution-driver sharpens the axe; PRAXIST chops the wood.

### Next Steps

A real-run validation: run a genuine research project through the full pipeline to verify the framework works in practice. Memory-system skill sharing: register PRAXIST/evolution-driver as unified skills in the memory system so every harness can call them directly (current status: proposed, not yet shipped).

### Advice for Readers

If you want your AI agent to get better with use, ask yourself two questions first. Do your skills have explicit acceptance criteria? Without them, the evolution engine doesn't know what "good" means. Are your tasks measurable? PRAXIST can't help with unmeasurable tasks. If both answers are "yes," the evolution engines may be worth a try.

---

*All material in this post comes from real artifacts: config files, command output, and code snippets are actual runtime results — no fabrication or staging for the sake of formatting.*

---

> **Related posts**: For how skill self-evolution applies to the content production line, see [The Blog Production Line (Part 3): Six Automated Pre-Publish Checks (Chinese)](/2026/09/14/blog-prepublish-checklist/); for the full version of multi-model division of labor, see [A Frontline Writer's Real Workflow, Distilled into Four Patterns (Chinese)](/2026/09/14/ai-writer-four-workflows/).
