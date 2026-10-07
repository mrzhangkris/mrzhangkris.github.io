---
title: "Jianshi's App Store Launch Diary (Part 1): An AI Companion App's Three-Round Review Gauntlet"
date: 2026-09-14 23:00:00
categories: [Indie Development]
tags: [iOS, App Store, indie development, AI companion, compliance]
copyright_author: Ganjiang
series: jianshi-launch
series_title: "The Complete Jianshi Launch Diary"
cover: https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1600&q=80&fm=jpg
lang: en
---

Jianshi is my iOS app — AI emotional companionship, defined as a mirror for your moods: three tabs (Tonight/Letters/Me), a "Tonight Letter" generated every night at nine, a memory panel you can view and delete, hotline referral in crisis scenarios, powered by MiniMax's models underneath. I submitted to App Store review for the first time on September 9 and have been through three rounds since; as I write this, the third submission is waiting for review.

One product detail first, which matters later: the Tonight Letter is hardcoded to be generated only after 21:00 — a "bedtime letter" shouldn't appear in your mailbox in the morning. Designs carrying product judgment like this are exactly what fueled the disputes in the review conversations that followed: **the reviewer sees a feature checklist; you see usage scenarios. The gap between the two has to be filled with evidence and explanation.**

This is not a "how to pass review fast" guide. Looking back, every rejection pointed at the same theme: **the gap between what you believe you've finished and what the reviewer actually sees must be filled with evidence**.

Here is the sketch of all three rounds; details unfold gate by gate below:

| Round | Rejection Reason (Guideline) | Nature | Key Fix |
|---|---|---|---|
| Round 1 | 3.1.2 missing subscription terms link | Pure metadata | Added full EULA in ASC, appended terms and privacy links to the version description |
| Round 2 | 2.3.2 IAP promotional image + 5.1.1(i)/5.1.2(i) third-party AI disclosure + 5.1.1(v) account deletion entry | Features and compliance | Deleted the promo image; added an AI consent dialog with named providers; elevated the account-deletion entry with a screen-recording proof |
| Round 3 | 5.1.x / 2.3.2 re-review feedback | Residual fixes | Responded point by point, then resubmitted fully automatically (currently waiting for review) |

## Gate 1: 3.1.2, One Page of EULA

The first rejection was the mildest: a subscription app's product page lacked a working Terms of Use link. A pure metadata problem — the build itself was fine as-is; fill in the license agreement field in ASC, append the terms and privacy links to the end of the version description, and resubmit.

It was so light it's barely worth mentioning, but it deserves a spot on the lessons list: **before submitting a subscription app, "the license agreement field" and "terms links in the description" are two mandatory checks — missing either costs you one full review round**. Pure form-field items like this never appear on any development task list; they only enter the process after you've been rejected once.

## Gate 2: Three Strikes at Once, All Signature Tests for "AI Companionship"

The second rejection came with three reasons; spread out, they're all specific to this category:

**2.3.2 accurate metadata: the IAP promotional image.** The subscription product's promotional image had been mistakenly uploaded as the app icon — two identical images. We never intended to promote the in-app purchase anyway, and Apple explicitly says it can be deleted in this situation — but we stepped on a trap: while the app was "waiting for review", ASC's API rejected the delete request outright with 409, so it had to be deleted manually through the web UI. **"The API can do it" and "the API can do it in this state" are two different things.**

**5.1.1(i)/5.1.2(i): third-party AI disclosure.** Users' chat content gets sent to a third-party model service, and Apple requires you to spell out "what is sent, to whom, for what purpose, and what control the user has". Our response was a first-send consent dialog with all five elements complete: to whom (the provider named), what is sent, not used for training, deletable at any time, and the consequence of declining is simply not sending. In the same pass, the privacy policy and user agreement were updated to name the third-party service and deployed.

I consider this item a required course for the AI companionship category rather than a burden — users have the right to know who is on the other end before they speak for the first time. Making the disclosure a dignified consent interaction beats burying it in paragraph umpteen of a privacy policy by a wide margin.

**5.1.1(v): account deletion.** The most interesting one: the feature had long been finished — the reviewer just couldn't find it. Account deletion was hidden on a second-level page under "Data & Privacy"; the reviewer, on an iPad, never dug that deep and judged it missing. The fix was direct — promote it to a first-level card on the settings page, marked in red, visible at a glance; per Apple's requirement, we also supplied a screen recording of the operation on a real device as evidence.

The lesson here is worth every developer copying down: **feature exists ≠ reviewer can find it. The reviewer spends an average of a few minutes in your app, possibly on an iPad — your deep second-level page simply doesn't exist on their device.** The standard response to this kind of rejection is a three-piece set: change the entry's hierarchy, record a screen-capture proof, and spell out the operation path in your reply — skip any one and another round may follow.

One prerequisite for automation, recorded in passing: ASC API keys are permission-scoped by role, and the capability matrix for uploading builds differs completely from that for changing account-level settings. Before scripting your release pipeline, confirm what your key "can and cannot do" — it saves the midnight riddles spent staring at a wall of 403s.

## Three Pitfalls on the Engineering Side

Beyond the review itself, the release pipeline contributed a few pitfalls worth recording.

**altool's DUPLICATE race false positive.** After build 17's first upload, the tool reported "duplicate build number", while in ASC the status was actually VALID and the binary sat intact in the list — the post-upload re-validation had collided with a sync delay. The rule since: **when a tool errors, check the build list before trusting the tool's output** — if the list says VALID, don't re-upload.

**Tap posture for on-device automation.** The smoke-test script tapped dialog buttons by coordinates, working intermittently; switching to AX-label taps (tapping by accessibility label name) made every scenario stable. Coordinates are for pixels, labels are for controls — automated tests should always choose the latter.

**Keeping icon, screenshots, and build in step.** Only after swapping in the new icon and redoing the full screenshot set (1290×2796) did it become clear that the build, icon, and screenshots must share the same version's character; piecemeal replacement produces a jarring "store page doesn't match the app" disconnect. Treat such assets as one whole and update them in one pass.

## The Age-Rating Questionnaire's Self-Interrogation

Age rating is an unavoidable conversation with yourself: answer the questionnaire mechanically and you can get a lower rating; but this app has AI conversation, emotional content, and crisis-intervention scenarios, and the honest answers point to a higher rating.

The final choice was honesty. The reasons are practical: a low-balled rating discovered by spot checks is a takedown risk, and the AI companionship category gets spot-checked at a nontrivial rate; more fundamentally, the product definition itself includes a heavy scenario like "crisis hotline referral", and an honest rating is the first line of defense for user expectation management. **Every minute saved on a compliance item will be paid back double in a takedown notice.**

## Now: Waiting for Review

The most recent submission ran the fully automated pipeline — build upload, screenshot replacement, and the submission action all scripted; build 22 with six new screenshots, submitted in the small hours, status "Waiting for Review". The value of full automation isn't the few saved minutes — it's that **in the turn-based rhythm of responding to rejections, the machine is immune to emotion and jet lag**: fix, build, resubmit in one breath, saving human energy for the web forms that genuinely need a human — subscription product pricing and localization, store screenshots, privacy labels — all ten-minute-scale operations.

What three rounds of this gauntlet yielded is worth more than "passing" itself: the EULA two-piece set entered the submission checklist, the consent dialog became a formal part of the product, account deletion moved from a second-level page to a first-level entry, and the release pipeline became fully scripted. **Review isn't out to give you a hard time — it collects, in one pass, every compliance debt you owe. Paying early is cheaper than paying late.**

When the verdict lands, pass or not, this post will get a sequel. The sequel is already out: [Part 2: Full-Pipeline Automation from Project Kickoff to the App Store](/2026/09/14/jianshi-full-pipeline-automation/), covering the infrastructure that carried these three rounds.

---

> **This series**: (1) this post · the three-round review gauntlet | (2) [Full-Pipeline Automation from Project Kickoff to the App Store](/2026/09/14/jianshi-full-pipeline-automation/)
