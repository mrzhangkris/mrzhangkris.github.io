---
title: "Blog Pipeline, Part 2: Every Day at 09:07, the Agent Picks the Topic, Writes, and Publishes"
date: 2026-11-24 09:07:00
tags: [AI, Agent, workflow, automation]
copyright_author: Ganjiang
series: blog-pipeline-line
series_title: "The Blog Pipeline Diary"
cover: https://images.unsplash.com/photo-1600132806370-bf17e65e942f?w=1600&q=80&fm=jpg
lang: en
---

On September 11 I published "Blog Pipeline, Part 1": a skill-orchestrated pipeline covering research, writing, polishing, and publishing. The real numbers for the two months since: 2 posts in October, 0 so far in November. The pipeline never lacked capacity — it lacked orders. The trigger stayed in my hands, and whenever I got busy, the pipeline stopped. Today (2026-11-24) Part 2 goes live: the trigger moves to a scheduler, which runs the full chain every day at 09:07. If verification fails, nothing gets published. The post you are reading is the first product of that chain's trial run.

## Where Part 1 Got Stuck

First, pin the problem down with data. The day Part 1 launched, September saw a bulk backfill of 19 commits from a CSDN migration; October added 2 new posts; November has added 0 so far. These numbers come from the repository's git history (`--diff-filter=A -- source/_posts/`) and can be independently checked.

The writing stage was never the problem — polishing, cover images, and bilingual publishing all had tooling in place. The break was one step earlier: nothing owned the question "what do we write today?" Skill orchestration answers "how to write"; scheduled triggering answers "when to start writing." Part 2 adds exactly that missing piece.

## The Part 2 Architecture: Five Layers Plus a Ledger

A single scheduled job drives the whole chain. Every day at 09:07 it starts an independent session that runs five layers in a fixed order, plus one state ledger:

| Layer | Job | Pass criteria |
|---|---|---|
| Topic | Ledger dedup + three material sources | No collision with ledger or existing site titles |
| Writing | Bilingual drafts per the writing baseline | Type declaration + length budget + no machine-voice |
| Verification | Local build + bilingual reconciliation | Build exit code 0, zero ERROR lines |
| Publishing | Targeted add, standard commit, push | 19-item live regression after push |
| Ledger | Append one row | Traceable; cover images never reused |

Why 09:07? Scheduled jobs pile up on round hours and crowd each other out — a previous scheduled pipeline had a job at the same minute get squeezed out by serial tasks and silently skipped to the next day, measured first-hand. So the pipeline picks an off-round minute. One post per day is the cadence; the exact time is a tunable parameter.

## Topic Selection: One Ledger, Three Sources

Dedup runs on the ledger. The pipeline keeps a state file (`选题台账.md`) that must be read before writing: titles and slugs in the published table must not repeat, and topics in the failure/skip table are off limits too. It also greps existing post titles to prevent collisions — a title determines the post's permalink, and a collision breaks links, so this check comes first.

Material sources come in three priority tiers:

1. **Agent self-evolution experiment directories**: date-archived experiments (selforg, memrecall, skill-erosion, and others), each with pre-registration, run records, and conclusions — ready-made retrospective material.
2. **Recent changes in plugin and skill workspaces**: pitfalls and fixes from gate plugins, the web-novel pipeline, and various skills.
3. **Memory retrieval**: focus areas, fix records, and decisions from long-term memory, useful for the "why it was built this way" background.

Priority tracks material density: one complete experiment — pre-registration, data, conclusion — usually provides the whole skeleton of a retrospective post.

## Writing: Baseline, Bilingual, Cover Pool

Writing is not free-form. Three constraints are hard requirements.

**The writing baseline.** Before drafting, declare the post's type — one type per post — and write within that type's length budget (project retrospectives 2000-4000 Chinese characters, opinion pieces 800-2000), following all six general disciplines: technical fidelity (commands, configs, and versions verbatim), honest boundaries (say so when something wasn't run), conclusion first, topic sentence per paragraph, active voice, and no machine voice ("in summary", "it is worth noting that" — these openers get killed on sight).

**Two languages, two files.** The site's own regression asserts it: the Chinese and English post counts must match one-to-one, and a missing post turns the regression red. So every pipeline post is naturally two files — `source/_posts/<slug>.md` and `site-en/source/_posts/<same-slug>.md`, same name and date, with the English frontmatter adding `lang: en`.

**The cover pool.** Each post picks its cover from a category-organized image pool; used ids are recorded in the ledger and never reused. Before picking, a grep across the site confirms the id is not referenced anywhere else.

## Verification and Publishing: No Verification, No Publish

The publishing gate has one rule: **if verification fails, do not push**. Two concrete checks: a local `hexo generate` exits 0 with zero ERROR lines, and the Chinese and English post counts match with the new post present in both. Only when both pass does publishing begin.

Publishing has its own discipline. `git add` takes only the two new files by explicit path — no `git add -A`, so unrelated local state files cannot sneak into the repo. Commit messages follow a fixed format, `post: <Chinese title>`. The push command is `git -c http.sslVerify=false push origin main` — not laziness, but a workaround for a known SSL verification failure between this machine and GitHub, solidified into the process by earlier work. About 90 seconds after push, a 19-item live regression runs (key-path 200s, bilingual reconciliation, sitemap, bot API); any red item means fix and re-push.

What if verification gets stuck: retry at most twice, then write the failure reason into the ledger's failure/skip table and skip the day. Better to miss an issue than publish a broken post.

## Trial Run Record: This Post

This post is the trial product, and honesty first: it was not written by the scheduled job itself, but by a manual trial run before launch — a session started by explicit decision, running exactly the same five-layer chain a scheduled run uses. The trial verified three things:

1. **The chain works end to end**: ledger bootstrap, cover-pool selection (this post's cover, photo-1600132806370-bf17e65e942f, cloud category, grep-confirmed unused), bilingual reconciliation, local build, push — all passed.
2. **Dedup does its job**: topic selection surfaced the existing "Blog Pipeline, Part 1", and the right response was not avoidance but joining the same series (`series: blog-pipeline-line`) as a sequel — that is exactly what the dedup check is for.
3. **The date trap is defused**: the site's permalinks fall on UTC dates, so publishing in the early morning Beijing time lands the post on the previous day. This post's date is 09:07:00, cleanly avoiding the trap. A September post once hit this and needed a dedicated fix commit; the rule is now baked into the pipeline spec.

The scheduled job starts running daily at 09:07 from tomorrow (11-25). From then on, every day the pipeline runs, the ledger gains a row.

## What Hasn't Been Tested Yet

Three questions left to time:

- **Whether machine voice stays suppressed**: the baseline and scripts govern format and facts, not style. Whether each post reads well will show up in reader feedback and spot checks.
- **Material pool endurance**: 7 experiment directories, several plugin workspaces, a constantly-updated memory — how long they last at one post per day, we'll see in a month.
- **The failure ledger is still empty**: the failure/skip table has no samples yet. Only a real failure will show which link is the most fragile.

Part 3 is scheduled for a month from now: publish success rate, material consumption rate, and quality spot-check results — with data.
