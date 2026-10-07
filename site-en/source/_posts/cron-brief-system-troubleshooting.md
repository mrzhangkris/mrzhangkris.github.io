---
title: "Three Push Pipelines Went Silent Together: A Postmortem on Troubleshooting a Cron Briefing System"
date: 2026-09-14 10:30:00
updated: 2026-09-14
categories: [Tech]
tags: [Automation, Troubleshooting, cron, AI Agent]
copyright_author: Sinan
cover: https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=1600&q=80&fm=jpg
lang: en
---

At home I run an automated intelligence system: every morning, a Hermes agent daemon on my Mac pulls fresh items from arXiv, GitHub releases, and a few tech blogs, organizes them into two or three Chinese-language briefings, and pushes them to my QQ account a bit after eight. Cron scheduling, scripted scraping, LLM translation, QQ delivery — no human touches any step of the chain.

It ran fine for three days. On the fourth morning I opened QQ and found only the nine-o'clock memory briefing; the 8:20 ecosystem morning report and the 8:45 intelligence briefing never arrived.

This postmortem starts from "why didn't they arrive." The investigation turned up five bugs. None of them is hard on its own, but they share one trait: **all of them were invisible to monitoring**. The scariest thing about anything running in the background isn't failure — it's breaking without your knowledge.

## Start with Monitoring: Every Signal Says Everything Is Fine

The first step in any troubleshooting is to look at monitoring. Cron's execution state lives in `~/.hermes/cron/jobs.json`, and this is what I saw:

```text
== AI生态晨报
  last_run_at: 2026-09-14T08:20:58
  last_status: ok
  last_delivery_error: None
== AI进化情报简报
  last_run_at: 2026-09-14T08:46:13
  last_status: ok
  last_delivery_error: None
```

Both jobs had executed within one minute of their scheduled time, status `ok`, no delivery errors. If monitoring could talk, it would say "I ran on time, nothing unusual."

Yet the pushes never arrived. When monitoring says good and reality says bad, there is only one possible explanation: **the scripts really did run, but they decided there was nothing worth sending**.

Digging into cron's archived run records, the truth began to surface. Every run drops a Markdown record, and the one from that morning looked like this:

```markdown
# Cron Job: AI生态晨报

**Run Time:** 2026-09-14 08:20:58
**Mode:** no_agent (script)
**Status:** silent (empty output)
```

`silent (empty output)` — the script finished, produced nothing, and the scheduler interpreted empty output as "no news today, staying silent is by design."

That is the first trap: **"no message" and "the messaging system is broken" are the same value in the monitoring metrics**. Two jobs had been silent for two consecutive days, while projects like claude-code and codex ship releases almost daily. Either the entire AI world had collectively gone on vacation for two days, or something was wrong with the scraping pipeline. Obviously the latter.

## Bug One: Scrape Failures Masquerading as No News

Following the scraping chain, I tested each link manually. The morning-report script uses curl to pull GitHub's releases.atom — fine:

```text
$ curl -s https://github.com/openai/codex/releases.atom | grep '<updated>'
<updated>2026-09-11T15:56:17Z</updated>
<title>0.155.0-alpha.3.10</title>
```

Next I tested the intelligence briefing's arXiv API. Empty response. Retried, changed parameters — still empty responses every time. arXiv's export API was down at the time.

Looking back at the script's handling logic, the problem became obvious. The fetch function looked like this:

```bash
fetch() {
  curl -s --max-time 25 "https://export.arxiv.org/api/query?..." | python3 -c '
import sys, xml.etree.ElementTree as ET, json
try:
    root = ET.parse(sys.stdin).getroot()
except Exception:
    print("[]"); sys.exit(0)   # ← the problem is here
...
'
}
```

curl failure, an empty response body, an HTML error page — all three cases make the XML parser throw, and execution falls through to `print("[]")`. To everything downstream, "API failure" and "query returned nothing" are the same output: an empty array. The empty array propagates all the way down; the rendering stage sees no new items, outputs an empty string, and the job goes `silent`.

The fix has two layers. The fetch function first distinguishes network-level failures:

```bash
fetch() {
  local body
  body=$(curl -s --max-time 25 "https://export.arxiv.org/api/query?...")
  local rc=$?
  if [ $rc -ne 0 ] || [ -z "$body" ]; then
    echo "FETCHFAIL:$rc"    # network failure: emit a marker, not an empty result
    return
  fi
  printf '%s' "$body" | python3 -c '...'   # parse failure gets a PARSEFAIL marker the same way
}
```

The rendering stage, on receiving a marker, distinguishes the two kinds of silence. If there is genuinely no news, stay silent (nobody wants an empty briefing pushed every day); if both query groups failed, push an alert:

```text
⚠️ 情报简报抓取异常 09-14：arXiv 两组查询均失败（非无新论文，明日重试）
```

The verbatim Chinese push message means: "Intelligence briefing scrape failure 09-14: both arXiv query groups failed (not a lack of new papers — retrying tomorrow)."

arXiv was still down that day, so the alert path got exercised in a live test immediately. The next day it recovered and papers flowed normally again. One outage made the "make failures visible" design pay off on the spot.

The principle is plain when you say it out loud: **any collection script built on "empty output = silence" must split "collection failed" and "no new data" into two distinguishable states**. The more elegant your silence policy, the deeper a failure can hide. Of the two days of silent records, one was genuinely newsless and one was an API outage; from the monitoring's point of view they looked identical, until someone went digging through the records because a push hadn't arrived.

## Bug Two: A Three-Line Dedup Defect That Made Every Push a Potential Duplicate

Troubleshooting one thing usually surfaces others. While inspecting the seen file (the dedup record of already-pushed items), I noticed a detail:

```text
$ wc -l ~/.hermes/cache/ecosystem_release_seen.txt
1
```

Only 1 record left in the dedup file. This file tracks "which items have already been pushed." After several days of running and a dozen-plus versions pushed, how was only one record left?

Looking at the Python code that writes it back — three lines:

```python
def dedupe_write(path, new_ids, existing):
    seen, out = set(existing), []
    for i in new_ids + existing:
        if i and i not in seen:
            seen.add(i); out.append(i)
    ...
```

`set(existing)` pre-fills the seen set with every old item, then the loop iterates over `new_ids + existing`. Every old item hits the "already in seen" branch inside the loop, gets skipped, and the out list eventually written back to disk contains only the new items from this run. In other words, **every run wipes the historical dedup record clean**. Once today's new items go stale too, the same GitHub release will be treated as new the next time it's scraped, and pushed again as a duplicate.

The most infuriating part of this bug: its immediate symptom is not "broken" but **no symptom at all**. Pushes went out as usual, content was correct, no errors anywhere — dedup was just dead in everything but name. Had this troubleshooting session not dug up the seen file, it would probably have kept lurking until the day a duplicate push got caught red-handed.

The fix is simple: start the seen set from empty:

```python
seen, out = set(), []   # old bug: set(existing) pre-filled, so all old items were skipped
```

Verification is straightforward: run the script twice. The first run pushes 2 new blog entries and writes them into seen; the second run keeps the 5 entries in seen (3 old + 2 new) intact, outputs nothing, dedup works, and the silence is legitimate.

## Bug Three: One Alert's Timeout Wiped Out All the Credit

The first two bugs were on the briefing pipeline. While troubleshooting, I took a look at the other jobs and found the weekly maintenance task had also failed that day — but it failed in an odd way: the weekly report was written to the database normally, the 19.7MB data export completed, yet the job status was `error`.

The cause was the script's final step: triggering an LLM reflection session. This call goes over HTTP POST, but the server side is an SSE long stream — the agent needs several minutes of reflecting before it finishes. The script's curl had only a 20-second timeout:

```bash
curl -s --max-time 20 -X POST ".../sessions/$SID/prompt" ...
```

After 20 seconds curl timed out and exited, and the non-zero exit code marked the entire cron job as failed. **All five previous steps succeeded; the last step simply waited the wrong way, and wiped the whole run's credit into an error**.

The fix is to turn this call into "fire and forget," without waiting for the result:

```bash
( curl -s --max-time 1800 -X POST ".../sessions/$SID/prompt" \
    -o /dev/null >/dev/null 2>&1 & )
echo "Reflection session triggered async: $SID"   # Reflect session triggered async: $SID
```

A long-timeout curl hangs in the background inside a subshell, and the main script moves on immediately. The server-side session's execution does not depend on whether the client connection is still there — which is also the correct way to use an SSE streaming endpoint: **client disconnect does not mean task cancellation**. Once triggered asynchronously, you can let go completely.

After the change I reran the whole script: exit 0, and the reflection session duly produced an improvement suggestion in the background. This step also verified something more important: the entire unattended reflection pipeline — "cron trigger → agent session → full-tool execution → conclusions stored" — was working end to end.

## Bug Four: The Agent Turned One Failure into "Massive Repeated Failures"

After the reflection session ran through, I went to read its output. The report contained this line: 「feed 显示近两天大量后台任务反复失败，需进一步核查」("The feed shows massive repeated background task failures over the past two days; further investigation needed").

Had that sentence been accepted without verification, the whole direction would have skewed. Checking in reality: the feed had no significant failure events in the past two days; the only failed record was one internal Mem `insight_detection`, once, two hours ago. Calling "one isolated incident" "massive repeated failures" is not a data error — it is **overstatement in the summarization step**: the agent, while summarizing, tends to inflate a lone example into a pattern.

The remedy is not to scold it but to add constraints to its instructions. The reflection prompt now carries one rule — "write only new reflection conclusions; do not restate historical decisions" — and a further rule is planned: **any conclusion involving failures or anomalies must attach an actually measured count**. "Failed 1 time" and "failed 15 times" are two entirely different problems, and the wording must make them distinguishable.

This is a rather forward-looking lesson: the LLM stage in an automated pipeline doesn't just get things wrong — it can also **state the right things wrongly**. What it hands you is its generalization, not the data itself. Anywhere you make decisions based on an agent's report, count the key numbers with your own hands.

## Bug Five: My Own Brain Cache

One question remained after the retrospective: why had I already bumped into the arXiv outage once, the previous evening?

Going through my work log — yes, I had. The previous night, while adding a Chinese translation channel to the briefings, I had tested KIMI_API_KEY in passing, got a 401, and concluded "the key is dead." Retesting today: the key was fine; the mistake was that I had called the wrong API endpoint with it. The key belongs to Kimi's coding gateway, but I had called the Moonshot open platform's API. Both endpoints use the same key format, so a 401 was inevitable.

This bug had nothing to do with code — it was the troubleshooter's own: **when you hit an anomalous result, check your own operation before suspecting the system**. Endpoints, parameters, environment variables, hidden characters — pseudo-failures caused by this kind of "hand slip" account for a bigger share of troubleshooting than you'd think. I later added strip handling to the `.env` reading in both briefing scripts, because the real file's key genuinely carried quotes and whitespace, and a direct `source` would smuggle dirty characters into the header.

Five bugs, complete. The first four lived in the code; the fifth lived in front of the keyboard.

## Four Design Principles Distilled from This Postmortem

Story over. Not one of these five bugs was "hard." What was hard is that all of them passed the trial of "the system has been running for three days and everything is fine." Compressing the lessons yields four principles.

### Principle One: Silence Must Be Distinguishable

"Empty output = no news today" is elegant design for collection-type systems, but only under one precondition: **"no data" and "can't get the data" must exit through different doors**. The test is simple: when a failure happens, the user should receive a push that says "I'm broken," not silence.

```text
No news            → silence (by design)
API outage         → ⚠️ push an alert ("not newsless; retry tomorrow")
Partial source down→ push what was collected (don't stall on one source)
```

### Principle Two: Monitor What Was Done, Not Whether It Ran

`status: ok` only tells you the script's exit code was 0. It does not tell you the script did any work. This time the real alarm signal hid in the run archive's `silent (empty output)`; it was consecutive silences colliding with the common sense that "upstream is clearly shipping" that deserved to set off the alarm.

From now on, when judging a collection system's health, I'll look at a combination of three values: run status, output volume, upstream activity. **Sustained zero output with an active upstream is equivalent to failure**, no matter how clean the exit code is.

### Principle Three: For Async-Triggers, Wait the Right Way

SSE, long polling, agent execution — for these "request returns in a second, result comes out in minutes" interfaces, synchronous waiting on the client is the easiest trap to fall into: killed by timeout, exit code poisoning the whole task, while the server is still working away quite happily. The rule is **return on trigger; fetch the result from storage**. A cron script judges success only by its own code's exit code — never bill an external long task's duration against itself.

### Principle Four: An Agent's Report Is a Generalization, Not the Data

The value of the LLM stage in an automated pipeline lies in generalizing and spotting patterns — and the risk lies exactly there: **generalization amplifies isolated cases and smooths over edge conditions**. The division of labor between human and machine is: the agent produces directions and leads; key numbers and facts get double-checked by a human (or a piece of dumb code). Had this "massive repeated failures" claim been accepted directly, troubleshooting attention would have been pulled off "briefing silence" onto "background task failures," burning an hour for nothing.

## Closing Notes

The system's current state: three briefings push on schedule every day, scrape failures now surface as alerts in the same push channel, dedup records are no longer wiped, and the reflection agent's conclusions must pass a numbers check before landing.

The question this retrospective leaves me is worth more than the bugs it fixed: **how many more missed pushes would I need before I notice the next failure?** The answer is zero, because failures now speak for themselves. The hallmark of a mature unattended system is not the absence of bugs — it's that when a bug happens, the system at least shouts once.

If you're building something similar — cron scraping, agent duty shifts, message pushes — I suggest running your own scripts through the four principles above. Especially the first: dig out your scrape-failure path and check whether it shares an exit with "no data."

---

> **Related reading**: [Keeping Multiple AI Sessions on One Mac from Stepping on Each Other](/2026/09/14/ai-multi-session-conflicts/) (session governance), and [An AI Assistant Writes the Session-Pruner Plugin](/2026/09/14/dsh-session-pruner-ai-assistant/) (the plugin-flavored version of the same "monitoring finds the problem → fix it" narrative).
