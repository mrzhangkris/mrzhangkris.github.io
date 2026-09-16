---
title: "Jianshi's App Store Launch Diary (Part 2): Full-Pipeline Automation from Project Kickoff to the Store"
date: 2026-09-14 23:30:00
categories: [Indie Development]
tags: [iOS, indie development, automation, App Store, CI]
copyright_author: 干将
series: jianshi-launch
series_title: "The Complete Jianshi Launch Diary"
cover: https://images.unsplash.com/photo-1551434678-e076c223a692?w=1600&q=80&fm=jpg
lang: en
---

Jianshi's review is still in the queue, so in this gap I'm writing the whole process up. This post isn't about the product — that was [the previous post](/2026/09/14/jianshi-appstore-review-journey/)'s job — it's about the infrastructure: how a solo developer (plus a few AI assistants) turned every step "from project kickoff to the App Store" into a documented, script-executed pipeline — and why, in the end, **the output of every step is a document**.

## Kickoff: The PRD Isn't for Humans, It's for the Production Line

The kickoff-phase deliverables are a PRD and a feature list. Ordinary as that sounds, the key is their form: the PRD is written "three-side aligned" (what iOS, backend, and product design each must do, and what the contracts are), the feature list uses numbered entries with status markers (F1 through F21, ✅ done, ⚠️ gap present), and the UI prototype is directly a clickable HTML interaction draft.

This form isn't for reporting to people — it's for downstream consumption: the feature list's status markers become the acceptance line for development tasks; the three-side aligned plan becomes the interface contract tests for each side. **If the readers of kickoff documents are "future executors" (AI or not), the documents must be structured and checkable** — that's a different genre from a grand vision written for humans.

## Development and Testing: Leave a "Re-Reviewable Piece of Evidence" at Every Step

Development-phase discipline is two rules: the CHANGELOG records everything down to commit numbers, and every significant fix runs a round of independent audit (security audit and cross-model audit were both done, with Blocker and Major issues itemized separately).

Testing phase sedimented four things: a backend pytest suite all green (account lifecycle and crisis intervention each have their own dedicated test reports), an iOS dual-build smoke report, a continuously maintained manual test checklist, and a versioned screenshots directory (every store screenshot remake is archived by date, so successive rounds reveal the iteration trajectory).

The point here isn't "lots of testing" but that **every conclusion has a report on disk**. As the next section shows, all of these reports got consumed during release.

## Release: Turning "Every Pre-Submission Check" into Two Tools

The release phase is automation's main event, distilled into two artifacts.

**First, a four-section release checklist**: Section A is what's already ready in code (build settings, privacy declarations, ATS, debug paths disabled — all script-verifiable); Section B is what must be done manually (key rotation, server deployment, ASC web forms); Section C is the reviewer-notes template; Section D is the rollback plan (backend switches back to the previous version directory, the app requests expedited review, data backed up daily, emergency stop via "remove from sale").

The form of Sections A and C matters: every Section A item is machine-verifiable (e.g., "Release build disables the subscription dev-activation path" maps to a `#if DEBUG` compile check), and Section C can be pasted straight into the ASC console. **The checklist must not contain non-executable entries like "check XX".**

**Second, a packaging-and-upload pipeline**, which froze the build-to-submission chain into standard steps: pre-flight checks (Xcode version, signing identity confirmed by SHA-1 rather than name, provisioning-profile/certificate pairing verification, upload key in place, encryption exemption declaration) → bump build number → Archive → package IPA → altool upload → verify status in ASC → submit for review. Every step has an error-mapping table — signature mismatch, build number conflict, missing compliance — and when an error appears you check the table before touching anything.

The most counterintuitive pre-flight check: **there can be several certificates with the same name; the name is unreliable — only the SHA-1 hash is unique**. That single item eliminates the majority of provisioning-profile errors.

## The Review Turn Loop: A Rejection Isn't an Accident, It's an Iteration

The round-1 rejection's fix was pure metadata (adding the EULA links); round 2's three items (IAP promo image, third-party AI disclosure, account deletion entry) each had their response actions. By round 3, fix, build, upload, and resubmit were fully scripted end to end — the submission completed itself in the small hours, and a human only checked the result.

Backing the turn loop is a set of infrastructure: tiered ASC API keys (uploading builds and changing account-level settings require different capabilities — verify the capability matrix before automating); knowledge of the API's boundaries (while "waiting for review", even deleting a promotional image gets refused with 409 — some operations are web-only); and **writing every rejection response into the iteration log**, so the next similar problem is a table lookup.

The tools' tempers went into the mapping table too: the upload tool's "duplicate build number" error has a race-condition false positive, and the correct posture is to check the build list first when it errors — if the list says VALID, don't re-upload.

## The Skill Layer: Packaging the Process into Nameable Capabilities

Wrap the checklist and pipeline one more layer up and you get skills. This machine currently maintains 60+ skills, spanning engineering methods (code review, debugging methodology), toolchains (iOS packaging, per-discipline game-engine topics), and intelligence tools (multi-engine retrieval, competitor monitoring), plus several for the writing production line (article research and writing, batch rewriting, the publish pipeline). They are the most-reused assets in this whole automation.

A skill's standard structure is a three-piece set: **SKILL.md** (trigger conditions plus execution steps — the packaging skill's description, for instance, says it should trigger even when the user only says "package it" or "submit for review"), **references** (thick references like error-mapping tables and per-topic checklists), and **scripts** (the directly executable part). The problem it solves is very concrete: without skill packaging, the packaging pipeline in the previous section requires someone to remember "check the build list before trusting the tool output" every time; once packaged as a skill, triggering means executing, pitfall table included.

Skills also change how cross-project reuse works. The iOS packaging skill was honed on the Jianshi project, and the next iOS project reuses it directly; the blog production line skills grew out of the CSDN migration project and now serve daily publishing in return. **Projects end; skills remain** — the only part of this automation that gets thicker with use.

## What's Really Automated Is "Taking Over", Not Just "Executing"

Looking back, scripts are only half of this pipeline. The other half is the document web: the PRD and feature list define "what to do", test reports prove "it was done right", the release checklist guarantees "nothing is missed", the iteration log records "what pitfalls were hit", and the project status document lets any brand-new session pick up the project after one read — its opening even says "after reading this document you can take over the project, no archaeology needed".

This system's real value got validated once last week: responding to a review rejection touched four different areas, and from locating the problems to resubmitting there was no human threading anything together — because every step's "what comes next" was written in the documents, and the executor (whether me or another assistant session) simply followed them.

So the complete answer has three layers: **turn repeated actions into scripts, turn tacit knowledge into documents, and package both into nameable skills**. Scripts save time, documents preserve handover, and skills give any new session a veteran's touch on day one. Automate only the first layer, and every release still needs someone watching — because the knowledge of "which script to run and what to watch out for" lives in someone's head.

Once the launch result is out I'll write a closing post: the data, the retrospective, and which automations go further in the next version.

---

> **This series**: (1) [The Three-Round Review Gauntlet](/2026/09/14/jianshi-appstore-review-journey/) | (2) this post · Full-Pipeline Automation
> **Related**: For the same production-line thinking on the blog side, see [The Blog Production Line (Part 2): 10 Parallel Agents Renovate 93 Old Posts in One Day (Chinese)](/2026/09/14/ai-blog-v4-renovation/).
