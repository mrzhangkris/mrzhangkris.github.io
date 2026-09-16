---
title: "AI Novel Pipeline (Part 2): A Server Home for Domain Data"
date: 2026-09-14 23:15:00
categories: [AI Engineering]
tags: [AI Writing, Architecture Design, Agent, Server]
copyright_author: 干将
series: ai-novel-pipeline
series_title: "AI Novel Pipeline Design"
cover: https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=1600&q=80&fm=jpg
lang: en
---

The previous post covered the novel pipeline's orchestrator "[Li Bai](/2026/09/14/ai-novel-pipeline-libai/)": it writes not a single word itself, handling only inquiry, delegation, and discipline. It left one question unexplored — the orchestrator claims "zero local domain data," so where does that data actually live?

The answer: in a standalone writing server. Genre cards, style libraries, platform word-count standards, project state, constraint-package assembly — all belong to the server; outline and body generation execute on the server too. From the orchestrator's point of view, this post explains how that service contract is designed, along with three trade-offs that cost real pain to learn.

## The Core of the Contract: the Orchestrator Passes "Pointers," Not "Content"

For the body-generation step, what the orchestrator sends the server is startlingly little: **a chapter ID plus one line of instruction the author typed on the spot**. That's it.

Why isn't the constraint package (the 8-question results, genre card, word-count standard — the generation context) assembled by the orchestrator and shipped over? That was exactly the first design, and it was rejected. Two reasons: one is round-trip redundancy — the server already holds all the data, so the orchestrator pulling it back just to send it again is pure routing tax; the other, subtler, is **drift between two copies of assembly logic** — once assembly code exists locally in the orchestrator and also on the server, the two sides' understanding of "what generation context should look like" slowly forks, with no error anywhere, only generation quality quietly going strange.

So the contract is fixed as: **where the data lives is where assembly happens**. What the orchestrator receives is the result, not the middleware of the process.

## Capability Table: What to Delegate, What to Build Yourself

The server is not omnipotent, and the orchestration layer is not an empty shell. The tool for judging the boundary between them is a capability table — list "what the server has" row by row, then check it against orchestration needs:

| The server already has | The server lacks (built in the orchestration layer) |
|---|---|
| Outline/body generation, genre cards, style libraries | Web-novel weighting of the review rubric (thrill-point density, chapter-end hooks) |
| Project state, export, backup | The high-threshold process for the golden first three chapters |
| Constraint-package assembly, word-count standards | Automatic per-volume outline refresh for long-form novels |

Everything in the right column is an orchestration-layer need with no corresponding server capability — so those stay honestly local in the orchestrator, built as validation scripts and process control. The table's value also runs in reverse: **whenever you want to add a feature to the orchestrator, check the left column first, and never rebuild anything the server already has**. That discipline is the orchestrator's lifeline against bloat.

The table is also alive. When the server schedules a new capability (say, routing by the match between a genre and a story spark), the day it ships, the corresponding hand-rolled logic in the orchestration layer should "go home" — self-building is a stopgap for the gap period, not permanent territory. Every server upgrade, re-align the table and see what should move house.

## Concurrency and Consistency: One Brain per Book

The server faces an awkward reality: multiple sessions may operate on the same book simultaneously. The solution is the standard web toolkit plus one domain rule — optimistic locking (version-number comparison; conflict means rejection) plus a TTL-heartbeat lock mechanism against deadlocks, on top of the orchestrator's pre-flight "one active session per book" check: at any moment, only one orchestration session works a given book.

The domain rule matters more than the technical means. Locks solve "don't corrupt the writing"; one-session-per-book solves "don't scramble the writing" — two outline mindsets alternating their injections into one book produce a schizophrenic result even when every write succeeds.

## The Streaming Trade-off: A Broken Stream Voids the Chapter

Body generation runs through a streaming interface; words come out one after another and the stream may break mid-chapter. What to do on a break? Resume-from-breakpoint sounds engineering-correct, but we chose the opposite: **void the whole chapter and regenerate; two consecutive broken streams escalate to a human.**

We counted a different ledger: once a half-finished chapter sneaks into the chapter inventory, it looks complete — formatting intact, sentences fluent — right up until some planted foreshadowing turns out to be entirely absent from the "second half." The cost of finding and cleaning up such contaminated chapters far exceeds the cost of regenerating one chapter. **Remediating data pollution always costs more than rebuilding the data** — a ledger that server-side design must consciously compute.

Model ownership also shows how clean this contract is: **which model generates is the server's business** — the orchestrator sends instructions and collects finished chapters, with no need to know or care which vendor sits behind the server; while which model reviews is the orchestration layer's business, because it defines the acceptance standard. Production rights to the server, acceptance rights to the orchestrator — the principle of heterogeneous review lands in the architecture itself, not on anyone's self-discipline.

## An Easily Missed Discipline: Data-Source Labeling

In the orchestrator's 8-question book-opening flow, every question must label its data source: the emotional core is a fixed option, the genre list comes from the server API, and the story synopsis can call AI to generate candidates. Labeling is not the point; the point is that "the server has this capability" versus "the orchestrator has a copy hardcoded locally" stays queryable at all times — **anything hardcoded locally will sooner or later fight the server's version**.

With the labels in place, upgrading the server becomes a grep away: search the source labels and you know which orchestration logic needs to change with it.

## Closing Note

When the service is unreachable, the orchestrator stops outright — restating this design because it is the most counterintuitive and the most important. An orchestrator that "can muddle through writing even when the service is down" has quietly copied the domain data locally, and every contract, capability table, and labeling discipline above will be slowly corroded by that hoarded copy.

The server is not the orchestrator's "backend"; it is the sole residence of the domain data. The orchestrator comes to keep the gate, not to take the data in.

## Appendix: Service Contract Quick Reference

For readers who want to see what this contract concretely looks like, here are the interfaces and mechanisms the orchestrator actually touches, condensed into tables.

**Interface surface** (the orchestrator's entire dependency set):

| Action | Server API | Notes |
|---|---|---|
| Create book | `POST /api/novels` | Carries the premise/outline/entity triple |
| Generate outline | `POST /api/novels/:id/outline/generate` | The orchestrator only runs an integrity check after retrieval |
| Chapter generation | `POST /api/chapters/:id/generate` | SSE streaming; the constraint package is assembled server-side |
| Chapter state write-back | `PUT /api/chapters/:id` | Where optimistic-lock version numbers apply |
| Export & archive | `GET /api/novels/:id/export` | Preceded by Li Bai's consistency checklist |
| 8-question data sources | `/api/genres`, `/api/styles`, `/api/picks`, `/api/ai/premise` | Genre filtering / styles / monthly picks / synopsis candidates |

**The precise rules of the revision loop** (the part polished over the most rounds): a review score below threshold enters targeted revision — thresholds split by length into two tiers (one for short stories, one for long-form; no single threshold across platforms); each round rewrites the chapter only along its low-scoring dimensions, never a full regeneration; each round's output is kept as a candidate version, with the best rolled back at the end of the loop; **3 rounds without meeting the bar: take the best candidate, mark it as below-bar, and hand it to the author** — no forced pass, no infinite retry. Turning "below the bar" into a legitimate exit is the key design that keeps the loop from spinning idle.

**Two engineering details**: the first is the SSE broken-stream policy — a stream interruption voids the whole chapter and regenerates, no breakpoint resume; two consecutive breaks cap it and escalate to a human. The cost of hunting half-chapters out of the inventory far exceeds one regeneration. The second is one active session per book — the server adds optimistic locking and a TTL-heartbeat lock, and the orchestrator verifies before starting that no other session is writing this book; two outline mindsets alternating their injections are harder to repair than data corrupted by concurrent writes.

---

> **In this series**: (1) [An Orchestrator That Doesn't Write, Only Enforces Discipline](/2026/09/14/ai-novel-pipeline-libai/) (Chinese) | (2) This post · Server Contract Design
