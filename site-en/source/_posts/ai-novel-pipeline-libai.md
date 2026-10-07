---
title: "AI Novel Pipeline (Part 1): An Orchestrator That Doesn't Write, Only Enforces Discipline"
date: 2026-09-14 23:00:00
categories: [AI Engineering]
tags: [AI Writing, Novel, Agent, Architecture Design]
copyright_author: Ganjiang
series: ai-novel-pipeline
series_title: "AI Novel Pipeline Design"
cover: https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1600&q=80&fm=jpg
lang: en
---

Getting AI to write a novel: the demo takes ten minutes, the full-length work takes years off your life. Three ailments are the most common: **setting drift** — by chapter 30 the protagonist's eye color has changed and the dead have come back to life; **runaway word counts** — 3,000 words per chapter was the deal, and somehow it's 5,000 or 1,800; **editing it into the ground** — let the model polish its own prose and, polish by polish, the style gets polished away too.

The production line I built for novel writing rests on one idea: **those who write the content and those who enforce discipline must be separated.** The skill in charge of orchestration is called "Li Bai"; it doesn't write a single word itself. This post covers its architecture and the design decisions beaten out along the way.

## The Core Decision: The Orchestrator Holds Zero Domain Data

Li Bai covers the whole flow — "8-question book opening → outline → chapters → revision → archiving" — yet it holds no domain data locally: genre cards, style definitions, word-count standards, project state are all fetched at runtime from a separate writing service (liyu); outline and chapter generation are executed by liyu as well.

Li Bai itself does only three things: **inquiry orchestration** (walking the author through the questions one by one), **delegation and acceptance** (dispatching generation tasks to the service and review tasks to an independent reviewer), and **discipline enforcement** (rejecting anything that fails validation).

Alongside it stands an iron rule: **if the liyu service is unreachable, Li Bai stops outright.** Better to strike than to degrade — once an orchestrator's built-in fallback generation logic activates, it slowly grows into a low-grade writing engine and the boundary blurs from there.

This decision came from a very practical place: an earlier writing skill did everything itself, and eventually grew too bloated to maintain. The new design document even has a dedicated section on "the cutting line between governance principles and narrative mechanics," and it was cross-reviewed by another AI (Kimi) — one extra round of different eyes hunting for boundary holes is far more effective than one more round of self-review.

## The Flow: Opening a Book with 8 Questions

Opening a book is not "write me a xuanhuan novel"; it's an eight-question questionnaire:

1. **Story spark** — the core hook in one sentence; first ask "what makes people want to read," then talk genre;
2. **Platform × length** — where it will be published and how long it will run, which sets the filtering space for everything after;
3. **Genre** — filter the genre pool by the platform-and-length combination (genre card data is maintained on the service side), then score the match against the spark;
4. The remaining five questions are, in order: emotional core, protagonist gender, writing style, one-sentence summary, and selling-point direction — style and summary can pull from service-side options or have the AI propose candidates, while things like the emotional core are fixed choices.

Once the eight questions are answered, the book's "constitution" stands, and every later generation step has something to lean on. A discipline hides in the flow too: **every question must label its data source** — only data fetched from the service counts as domain data, and hard-coding a local copy in the orchestrator is forbidden. The order is deliberate as well: **attraction before classification** — most failed book openings pick a hot category first and then cram a dull story into it.

## The Mainline Four Steps: Outline, Chapters, Revision, Archiving

After the book opens, four mainline steps follow, and who does the work in each is nailed down.

**Outline**: confirmed answers to the 8 questions trigger book creation; outline generation happens on the server, and after Li Bai retrieves it, it only verifies completeness and checks the genre match. **Chapters**: chapter by chapter, and Li Bai passes only the chapter ID and the author's in-the-moment instructions — the constraint bundle (8-question results, genre card, platform word-count standard) is assembled by the server rather than pulled local and reassembled, avoiding two assembly logics drifting apart. **Revision**: the review returns a score; below threshold it enters a targeted-revision loop capped at three rounds, keeping the candidate version each round so the best can be rolled back at the end; if three rounds still miss the bar, take the best version, mark it substandard, and hand the verdict to the author — never force a pass, never retry forever. **Archiving**: Li Bai checks the consistency checklist item by item (word counts met, chapters complete, candidate versions cleaned up, no pending revisions) — the only substantive gatekeeping it does the entire way through — and on completion triggers export and backup.

Two details deserve their own mention. Generation and review use different models (one generates, another reviews) — a model grading its own output means nothing; only heterogeneity holds up. Generation uses a streaming interface, and if the stream breaks mid-chapter the whole chapter is discarded and regenerated — no resumable download games — because the cost of a half-written remnant slipping into inventory far exceeds one regeneration; two consecutive stream breaks is the cap, after which it errors out and escalates to a human.

## The Discipline Layer: How the Three Hard Constraints Are Implemented

This is the most valuable part of the whole pipeline, and it all lives in standalone scripts — every generation must pass through them, or it gets bounced back:

**Fact-layer validation (fact_layer.py / character_facts.py).** A character's key facts — appearance, abilities, life-or-death status, relationships — are stored as structured profiles. After each chapter is generated, sampled fact assertions are checked: the dead cannot speak again, a severed arm cannot grip a sword again. Setting drift is intercepted before it enters the library, not caught by readers in the comments section.

**Word-count and pacing constraints (rules_engine.py / word_standards.py).** Different platforms have different sensible ranges for chapter length; the standard set at book opening is a hard constraint — overage gets cut, shortfalls get filled — and pacing parameters (dialogue density, scene-switch frequency) are validated alongside.

**Book export (export_book.py).** When the full book is done it is exported in the platform's format, and archiving carries a compliance self-check — archiving is not "saving a file"; it's sealing the book's final state together with the record of every check it passed.

## Review: A Fresh Brain Reads Cold

Revision is where self-deception comes easiest: when the same model plays both athlete and referee, it will think it writes just fine. Li Bai's answer is to delegate review to an independent reviewer (review-glm) that uses a different model to do a "cold read" of the finished draft — no memory of the writing process, feedback based only on the text itself. On top of the four literary dimensions, the scoring rubric is weighted for web-novel standards: pay-off density, chapter-end hooks, and information gain.

This thinking matches my code-review practice exactly: **a reviewer's value comes from a fresh perspective; a generator's confirmation bias about its own output can only be broken by a different brain.**

One architectural question worth answering in passing: **why does the discipline layer live in the orchestrator rather than on the server?** Because the server's capability inventory doesn't include these things — the web-novel weighting of the review rubric, the high-threshold golden-three-chapters process with human-review anchors, the per-volume outline refresh for full-length works — all are gaps on the server side that only the orchestration layer can build for itself. The test for "what to delegate vs. what to build locally" is simply the cross-reference between the server's capability dossier and the orchestration needs: whatever the server has is never rebuilt; whatever it lacks stays local.

## Honest Boundaries

Three things stated plainly. First, liyu is a private dependency; this pipeline currently runs in a personal environment, and the server's capability dossier maps one-to-one to Li Bai's design docs, so outsiders reproducing it must implement the server themselves. Second, the end-to-end chain has been regression-verified (generation, validation, export all tested in full flow), but "the pipeline works" does not mean "the pipeline leads to a bestseller" — the discipline layer solves consistency, not literary quality. Third, the genre filtering pool in the 8 questions still keeps a "fallback" branch: what to do when no suitable genre can be found is still being iterated on.

## Closing Thoughts

What this pipeline set out to prove: the bottleneck in long-form AI writing isn't "not human enough"; it's that **long-range consistency has no engineered safety net**. Fact profiles, word-count discipline, cold-read review — none of it is glamorous, but together they turn "100,000 words without collapsing" from luck into process.

Keep the writers and the disciplinarians separate. That holds for AI, and for people too.

---

> **In this series**: (1) This post · Orchestrator design | (2) [Domain Data Needs a Home: The Server (Chinese)](/2026/09/14/ai-liyu-writing-service/)
