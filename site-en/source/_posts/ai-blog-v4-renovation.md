---
title: "The Blog Production Line (Part 2): 10 Parallel Agents Renovated 93 Old Articles in One Day"
date: 2026-09-14 20:00:00
categories: [AI Engineering]
tags: [AI Agent, Multi-Agent, Docker, Blog Pipeline, Batch Jobs]
copyright_author: 干将
series: blog-pipeline-line
series_title: "Building the Blog Production Line"
cover: https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=1600&q=80&fm=jpg
lang: en
---

The backbone of my blog is 93 ops articles migrated from the CSDN era, with the main environment stuck on CentOS 7 — a system that lost maintenance in June 2024. Two rounds of automated rewriting had run on those articles before, but when I asked the auditor to re-check this time, it still dug up hard defects: one article had two Markdown headings glued to the end of the previous line, leaving entire sections unrendered; some articles had been compressed down to sixty percent of the original; and some "tested environments" didn't match what had actually been run.

This postmortem records how the second renovation was done: 10 parallel agents, all 93 articles re-run inside containers, all 264 figures re-rendered, shipped the same day. It focuses on three things — how to keep batch output from lying, how to schedule the concurrency, and the pitfalls hit along the full path from audit to release.

## Lesson One: Quantify the Audit with Scripts First, Not with the Naked Eye

Before touching anything I wrote two scan scripts: one compared each rewritten article against its CSDN original for code-block retention and body-word ratio; the other scanned the whole site for damaged Markdown structure. Ten minutes of runtime, and the problem distribution was plain to see:

| Signal | Finding | Verdict |
|---|---|---|
| Glued headings (heading jammed at the end of the previous line without a break) | 1 article, 2 spots | line-joining bug during generation |
| Body/original word ratio < 0.7 | several articles, the worst squeezed to 0.64 | over-compression; hands-on details lost |
| Code-block retention < 30% | a batch of short articles had their examples wholesale replaced | partly justified (expansion), partly replacement distortion |
| Image references vs. files on disk | 0 missing | image pipeline healthy |

This list directly dictated what went into the renovation spec: structural self-checks added to acceptance, over-compressed articles named for restoration, environment claims required to match actual runs. **The value of an audit lies not in listing flaws but in turning "where things tend to go wrong" into hard clauses in the spec.**

## Lesson Two: The Only Way to Prevent Fabrication Is Making the Agent Actually Run

The biggest risk in batch-rewriting technical articles is the model fabricating command output "convincingly." This round's spec had one hard constraint: **for articles that can be containerized, get it running in a container first, then start writing; anything that can't be made to run must not go into the article**.

The results beat expectations. A few examples:

- **The DHCP article**: the agent started dhcpd and dhclient in the same container and genuinely walked through all four steps of DISCOVER→OFFER→REQUEST→ACK negotiation, and along the way discovered that the old version's address pool overlapped with its MAC-bound address (the range started at .150 and the fixed-address was also .150) — a real bug that neither of the previous two rewrite rounds had caught
- **The ZooKeeper article**: the previous two rounds were both marked "cannot be verified in a container"; this time a custom network spun up three containers and genuinely formed a ZK 3.8.6 cluster, with election, cross-node reads/writes, and failure reconnection all measured — the old conclusions were overturned
- **The nginx hot-upgrade article**: no longer content with "same-version binary copy," it compiled 1.30.4 from source and performed a real USR2 hot upgrade plus rollback against the running 1.28.3

For non-containerizable topics (Oracle, hardware RAID, Windows, GUI) the spec explicitly forbids forcing a run, keeping the "not tested live; source: official documentation" annotation. **The line of honest boundaries matters more than a few extra articles that "look more complete."**

A by-product was correcting a set of factual errors in the old versions: the TLS hardening checklist still contained 3DES suites — the very body of the SWEET32 vulnerability; `dnf reposync --metadata` is not a valid option (prefix matching accidentally hits `--metadata-path`; the correct form is `--download-metadata`); ES 7.6.1 claimed to have been tested on ARM — that version has no ARM build at all, confirmed by a live 404.

## The Execution Architecture: Trial Run, Batches, Progress Markers

The orchestration of 10 batches is the usual trio, but each piece has this round's reason behind it:

**Trial-run 2 articles before scaling up.** The trial articles were chosen to be representative (install-and-deploy type, ones with old figures to replace), walking the full chain: container run → rewrite → figure re-render → validator PASS. The trial run also surfaced one crucial piece of environment intel: the mirrorlist bundled with the rockylinux:9 image 404s on this machine's network, so the baseurl must be switched to dl.rockylinux.org. That went into the prompts of all subsequent batches, and none of the nine batches stepped on it again.

**Concurrency capped at 5–6.** A previous round taught this lesson the hard way: 10 agents starting simultaneously overloaded the provider outright and every agent exhausted its retries. This time, two waves of 5 batches each, with each finished batch immediately backfilled by the next one — the pipeline never idled.

**Progress markers persisted to disk.** After finishing each article, the agent appended a line with the file name to `v4-progress/<batch>.done`. This design paid off twice: when the trial articles sat inside some batch's list, that batch read the markers and skipped them automatically, with no redo; and interruption recovery also looked only at the marker files, not at digging through chat logs.

Wrap-up was a single unified script: signature adjustments, site-wide image-reference collection, a full re-render of every referenced figure from its sidecar (eliminating an inconsistency left by one batch accidentally triggering whole-directory rendering), and cleanup of 75 old images that had lost their references. **When batches write into the same repo concurrently, "everyone writes their own files" guarantees no conflicts, but cross-file consistency must be left to a single-threaded wrap-up step.**

## The Numbers

| Item | Value |
|---|---|
| Articles | 93/93, validator all PASS |
| Figures | all 264 re-rendered from real output; 75 old images cleaned up |
| Agent usage | ~150M tokens across 10 batches; 30–80 minutes per batch |
| Wall-clock time | roughly one working day from writing the spec to push-and-live |
| Containers | rockylinux:9 / debian:12 / ubuntu:24.04 / nginx:alpine, experiment containers deleted after use |

## Three Pitfalls in the Environment Layer

All three relate to "the world inside the container isn't the one the documentation describes":

1. **Mirror sources**: beyond rockylinux:9's mirrorlist 404, nginx:alpine pulling from TLS-based sources also failed; switching to the Alibaba Cloud mirror solved it. Base images' default sources are essentially undependable on restricted networks.
2. **DNS pollution**: the local VPN's fake-ip mode poisoned Docker's embedded DNS, and container names resolved to 198.18.x.x. A custom network plus `--add-host` routed around it.
3. **Log symlinks**: inside the nginx:alpine container, `/var/log/nginx/error.log` is a symlink pointing to stderr, and reading it via `docker exec` hangs outright; all evidence must be fetched through `docker logs`.

All three now live in the "environment intel" section of the batch prompts — **the first step of the next batch job should always include feeding the previous run's environment intel to the executors**.

## Errors the Live Testing Rooted Out (Excerpt)

The most valuable category of output from the renovation was using live container runs to falsify old-version claims that "looked right." Six representative picks:

| Article | Old-version claim | Live-test verdict |
|---|---|---|
| reposync | `--metadata` syncs metadata | Not a valid option at all — prefix matching collides with `--metadata-path` and errors on a missing argument; the correct form is `--download-metadata` |
| TLS hardening | the fix checklist kept 3DES suites | That is precisely the body of the SWEET32 vulnerability; removed and replaced with 34 secure suites |
| Elasticsearch | 7.6.1 tested and passing on ARM | No ARM build exists for that version (only from 7.8 on); installation test hit a 404 |
| parted | `-s` with interactive args works for scripting | In the new version it silently fails and returns 1; scripting requires dropping `-s` and using explicit arguments |
| DHCP | dynamic pool and MAC-bound addresses may overlap | Live test showed the bound address gets grabbed by the dynamic pool; the pool must reserve room for bindings |
| Rate limiting | in delay mode the 10th request waits nearly 3 seconds | Measured: each request waits only 0.33 seconds extra; the old version's math doesn't hold |

Not one of these six is a "style problem" — all are factual errors that would cause incidents if copied as-is. That is the value density of live-run verification.

The batch economics are worth recording too: about 150M tokens across 10 batches, 30–80 minutes per batch, and every interruption within a batch was recovered via the progress marker files — one batch died during its wrap-up phase, but all 10 articles were already on disk; a single replacement session was dispatched, read the marker files, and finished the wrap-up with zero articles redone.

## Closing Notes

The deepest takeaway from this renovation: **in batch agent engineering, "verification" must be part of the product, not a check before delivery**. Every line of output the agent produces in a container, every figure it renders, is both the article's content and the article's testimony. The line in the spec — "anything that can't be made to run must not go into the article" — guarantees quality better than any style requirement.

The next post tightens the screw on what these live runs sedimented: the CentOS 7 → Rocky 9 difference list excavated by re-testing the 93 old articles, ops-oriented — follow the list and you'll skip the pitfalls we hit — [CentOS 7 End-of-Life Migration: The el7→el9 Difference List Excavated by Re-testing 93 Old Articles](/2026/09/14/centos7-to-rocky9-migration/) (Chinese).

---

> **Other posts in this series**: (1) [I Built an AI Production Line for Blogging, Then the First Article Taught Me a Lesson](/2026/09/11/ai-blog-pipeline/) (Chinese) | (2) this post · Batch Renovation in Practice | (3) [Six Automated Pre-Publish Checks](/2026/09/14/blog-prepublish-checklist/) (Chinese)
