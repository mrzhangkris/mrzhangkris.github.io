---
title: "Multi-AI Collaboration (Part 2): Keeping Multiple AI Sessions on One Mac from Stepping on Each Other"
date: 2026-09-14 22:30:00
categories: [AI Engineering]
tags: [AI Agent, Multi-Agent, Engineering Governance, Workflow]
copyright_author: 干将
series: multi-agent-collab
series_title: "Multi-AI Collaboration in Practice"
cover: https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1600&q=80&fm=jpg
lang: en
---

First, three true stories, all from the past week, all on the same machine.

**Incident one: build numbers collided.** Two sessions worked on the same iOS app in parallel. Session A uploaded build 17; session B, unaware, built a build 17 of its own and sent it up too — with the upload tool adding fuel to the fire by reporting a "duplicate build number" error. The postmortem found both 17s had identical content, so it was a false alarm — but what if the content hadn't matched?

**Incident two: tests wiped the dev database.** One session ran a test suite whose test config pointed at the same file as the development database; when the tests started, they rebuilt the database, erasing several hundred megabytes of development data down to 0 bytes. By great fortune, that was deprecated test data. By great fortune it was.

**Incident three: signatures overwritten.** On my side I was batch-updating the signatures of 93 articles, while another session was simultaneously optimizing the site's signature display — both sides were touching the concept of "signature," and only the fact that their file sets didn't intersect kept them from trampling each other's commits.

What the three incidents share: **multiple AI sessions share the same repository, the same services, the same build-number watermark, while every session defaults to believing "the world contains only itself."** Human teams spent decades solving multi-person collaboration; now those rules have to be handed to AI ahead of time — AI colleagues are far faster and far cheaper than humans, and far more willful too.

A positive example first, to set the tone: the day before writing this post, two sessions were simultaneously active on my blog — one publishing the plugin series, one reworking the site's signature display — plus my side finishing a round of batch renovation across 93 articles. Three parties, zero conflicts. That wasn't luck; it was the rules below.

## Rule One: Read the State Before Taking Over

The highest return-on-effort rule of all governance rules: **before acting, read the current state of the domain you're about to touch**.

In concrete actions: taking over a repository starts with `git log`, to see whether another session just committed; touching a release starts with checking the build list, to see where the build-number watermark stands; taking over a batch job starts with reading the progress marker files, to see which items are already done. The rule costs a few minutes; the payoff is avoiding an entire round of rework.

Progress markers deserve special praise. In the batch renovation round, the two articles finished first during the trial phase happened to also sit in some batch's list — the batch agent read the marker files before starting and skipped them once it found them done, no redo. **Marker files are the handoff artifacts between sessions**; in the same family are the project's iteration logs and todo pools: I once rebuilt an entire project's App Store submission timeline from a single iteration log, without asking any of the "people involved." Sessions will vanish; the handoff artifacts must remain.

Incident one's complete lesson is exactly this: had session B pulled the build list once before uploading, the collision would never have happened. And when the tool reports DUPLICATE, don't rush to re-upload — **on error, check the list before trusting the tool's output**; behind that "error," the package was already lying in VALID state in the cloud.

## Rule Two: Partition the File Sets

Parallel sessions (or parallel subagents) must each own disjoint file sets. My blog renovation ran 10 batches, each batch assigned a non-overlapping list of articles, writing bodies, figures, and annotation data — zero file-level intersection, therefore naturally conflict-free.

But file partitioning has a hidden boundary: **it guarantees only "writes don't collide," not "results are consistent."** Ten batches each write their own articles — who guarantees the site-wide image references are complete, dead old images get cleaned up, signatures are uniform? The answer is that wrap-up must be single-threaded: one wrap-up script runs after all batches finish, doing the set differences, the full re-renders, the uniform replacements. **Concurrency produces throughput; serial closure produces consistency.**

## Rule Three: Shared Resources Get Exactly One Writer

Files can be partitioned; some things can't: site configuration, global signatures, the build-number watermark, database schemas. The rule for this class of global state is **only one writer at any moment** — either schedule them apart or assign explicit ownership.

In incident three the two sides didn't collide purely by luck (one touched only article files, the other only theme configuration). But the moment two sessions both need to edit the same config file, the later commit will mindlessly overwrite the earlier one — git does not do semantic merges for you; it only sees lines. **The cost of a configuration conflict is not a rollback; it is silent loss.**

## Rule Four: Physically Isolate Test and Development Data

Incident two's fix is worth copying: the application's startup supports overriding the database path via an environment variable, and the test framework forcibly points the test database at an independent file. From then on, no matter how the tests thrash around, the development data survives.

The insidious thing about this class of problem is that it doesn't flare up in ordinary times — sharing one file goes fine for months, until one day the test logic becomes "rebuild the database." **The risk of a shared resource is not a constant; it can mutate at any time**; isolation costs one configuration and pays off forever — there is no reason not to make that trade.

## Rule Five: Clean Up When You Leave

Parallel sessions leave behind a third kind of problem: garbage. While auditing my blog, I found two package-manager placeholder files in the repository root, left by some session — their content was still the template's default "set this to true or false," committed by no one, deleted by no one, just lying there waiting for some unsuspecting successor to accidentally commit them.

A batch session's exit etiquette should include: delete the temp files, clean out the experiment containers, keep the progress markers (those exist for others to read — they are not garbage). **The test is simple: after your session ends, how long would a completely clueless colleague need to take over this directory and understand its state?** The lower the comprehension cost, the cleaner the sweep.

## Closing Notes

None of these five rules is new — all of them were carried over from human team collaboration: sync state first, partition responsibility boundaries, lock global resources, isolate environments, document the handoff. AI sessions haven't changed the essence of the collaboration problem; they've only raised collaboration frequency by an order of magnitude: a human colleague commits once a day; AI sessions can collide three times a minute.

The higher the frequency, the more governance must come first. The sessions on this Mac will keep multiplying — the rules need to be in place before they do.

## The Full Postmortem of the Three Incidents

The three stories from the opening deserve unpacking, because each one's handling contains a general procedure.

**The build-number collision** had this timeline: session A uploaded build 17 successfully (its state in App Store Connect was already VALID), session B, unaware, built a 17 locally and sent it up too — the upload tool then reported a "duplicate build number," and adding insult to injury, the error itself was a race-condition false positive. In the end both sides compared packages, found the content identical, deferred to the cloud, and did not re-upload. Two procedures were distilled: **when an upload errors, check the build list before trusting the tool's output**; and when taking over any release-type task, check the "watermark" once first (latest build number, latest commit).

**The database wipe** had a root-cause chain worth examining closely: the test framework's initialization config and the application's development database pointed to the same database file, and the moment the tests started they rebuilt the database per that config — development data reduced to 0 bytes. The fix had three layers: the application supports overriding the database path with an environment variable; the test configuration forcibly points to an independent test database; and any "tests sharing resources with real data" arrangement must henceforth be treated as an incident at review. By great fortune the wiped data was deprecated test accounts, but **that stroke of luck cannot be counted into the process**.

**The signature coexistence** was the positive case: on a single day, one session published plugin articles, one session edited site configuration, and my side finished the 93-article batch renovation — three parties, zero conflicts. Disjoint file sets were the precondition, progress marker files were the handoff artifacts, and a single-threaded wrap-up script handled site-wide consistency at the end.

The standard for handoff artifacts can borrow from the Jianshi (渐识) project's practice: a "project status" document whose very first sentence is "after reading this document you can take over the project without re-doing any archaeology." **The measure of a session's handoff quality is simply how long a completely clueless new session needs to get up to speed.**

---

> **Other posts in this series**: (1) [I Gave Seven AI Assistants Their Names](/2026/09/14/ai-seven-harness-names/) (Chinese) | (2) this post · Session Governance
> **Related**: for the unattended-system postmortem, see [Three Push Pipelines Went Silent Together: A Postmortem on Troubleshooting a Cron Briefing System](/2026/09/14/cron-brief-system-troubleshooting/) (Chinese).
