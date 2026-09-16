---
title: "AI Detection and De-AI-ifying: A Full-Picture Comparison of a Niche"
date: 2026-09-15 23:18:00
lang: en
categories: [AI Engineering]
tags: [AI Writing, Detection, humanizer, Tool Comparison]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?w=1600&q=80&fm=jpg
---

One business's customer-acquisition pitch is to use another business as its target. Detectors claim to protect "human writing"; humanizers claim to help you "pass detection"; both charge by subscription, and each feeds on the other: detectors point to the existence of humanizers as proof the threat is real, humanizers point to detectors' false positives as proof detection cannot be trusted. We recently ran one round of internal research on each side of this niche, and this article lays out the full picture: what technology each side lives on, whose evidence stands on shakier ground, where the Chinese-language scene differs, and finally why I believe the arms race has no winners.

> Note: markers like (Phase 1 #03) in this article refer to numbered items in our internal research reports (Phase 1 covers the track-and-technology group reports, Phase 2 the first-hand-corpus group reports). Every number cited has a first-hand source-verification record in the reports; anything the reports marked "not found / not verified" is not cited here.

## Conclusions First

Let me put the conclusions on the table — readers in a hurry can leave after this table.

| Dimension | Detector side | Humanizer side |
|---|---|---|
| What it sells | A verdict on "AI content" | "Passing detection" |
| Technical foundation | Statistical classifiers, zero-shot metrics, watermarking, retrieval comparison | Rule-based rewriting, style-transfer rewriting |
| Reliability | All 14 tools failed in one benchmark; false positives skew by ethnicity | Effective against statistical detection, useless against watermarks |
| Commercial performance | GPTZero claims 17 million users; Pangram's annual revenue ×35 | Undetectable AI claims 24 million users |
| Main risk | False-positive lawsuits have materialized | Inducing rule violations, false advertising |
| Endgame | Pivoting to "proof of writing process" | Cleared out by model-native watermarking |

Readers arriving with specific questions can continue below, where the body expands by dimension.

## How Detectors Judge, and Why They Are Collapsing

Detectors judge statistical features, not "understanding". GPTZero's official FAQ has published three things it looks at: perplexity (how easily the text is predicted), burstiness (the variation in sentence length and structure), and style (whether the tone is too generic and repetitive). Human text naturally has high variance in sentence length and many branch points in word choice; post-RLHF model output is exactly the opposite — flat, steady, predictable. Industrial implementations fall into four classes: classifiers fine-tuned on labeled corpora (the commercial mainstream), zero-shot methods that use the model's own probability measures without training (the DetectGPT family), watermarks that embed statistical signals at generation time (Google's SynthID is already deployed in Gemini), and retrieval-style defenses where the vendor keeps its own fingerprint database for comparison (Phase 1 #01).

None of this holds up against the chain of academic evidence. In 2023 the Weber-Wulff team benchmarked 12 public tools plus Turnitin and concluded they are "neither accurate nor reliable" — all 14 below 80% accuracy. That same year a Stanford team measured an average false-positive rate of 61.3% against non-native English writers across seven detectors, with TOEFL essays mass-flagged as AI; the 2024 Common Sense Media data looks even worse: 20% false positives for Black students, 10% for Latino, 7% for white. The most dignified footnote comes from OpenAI itself: its official AI text classifier lasted half a year before being shut down in July 2023 for "low accuracy" (Phase 1 #03).

Theoretically this is not failed engineering; it is a mathematical ceiling. Sadasivan et al. proved that an optimal detector's accuracy bound is set by the divergence between human-written and machine-written text distributions — the more humanlike the model, the closer detection gets to a coin flip; and low-cost attacks like recursive paraphrasing can drive down the detection rates of every kind of detector, even forging watermarks (Phase 1 #01). Education's vote with its feet is already in: Vanderbilt University ran the numbers — Turnitin claims a 1% false-positive rate, the school submits 75,000 papers a year, so on that ratio about 750 would be mislabeled — and its official conclusion was that "AI detection software is not an effective tool that should be used"; Cambridge pulled out in 2023, WSU terminated its contract in February 2026, and the FT reported in July 2026 on the wave of universities worldwide abandoning these tools (Phase 1 #03).

The collateral damage has moved from data to lawsuits. At Adelphi University a falsely flagged student sued and won; a Palo Alto high-school family filed a civil-rights suit; a Minnesota PhD student says he was expelled over a false verdict (Phase 1 #03). Running parallel to this reliability collapse is commercial boom: even Pangram, the best-regarded in research circles, gets bypassed by 86% of adversarial samples, yet its monthly active users grew from 2,700 to 120,000 in a year and annual revenue ×35, and Substack and Quora have already integrated its detection (Phase 1 #03). Technical failure and commercial success holding at the same time is the key to understanding this niche.

## The Humanizer's Two Routes

The humanizers' shared premise is a single sentence: whatever statistical features the detector depends on, attack exactly those (Phase 1 #01). The disagreement is in the attack technique, and the public ecosystem has converged on two routes.

The first is rule-based rewriting. Its flagship is the open-source project blader/humanizer at 45.6k stars, which sorts machine flavor into five categories: performative openings and one-sentence closings, forced three-part structures, packaging ordinary facts as major insights, formatting OCD where everything is bolded, and chat-residue filler. Three repair principles: every sentence you keep must deliver new information the reader did not have; vary sentence length; state, don't perform. The Wikipedia community's "Signs of AI writing" page sorts dozens of traits into four layers — content, language, formatting, citations — and is the public ammunition depot for this route (Phase 1 #01). This route never touches semantics, only patterns; its cost is one prompt, and its risk is the smallest.

The second is style transfer. Its academic origin is the Delete-Retrieve-Generate generation of style-transfer research, simplified in the LLM era into instruction-driven rewriting: "rewrite in the voice of X, keep the facts" (Phase 1 #01). Commercial products are almost all wrappers around this route: Undetectable AI charges $9.99 to $42.50 a month and claims 24 million users; StealthWriter spans a free tier up to a $400 monthly fee, and its pitch has already retreated from "guaranteed bypass" to "reads naturally, like a human"; HIX Bypass claims to "humanize" 1.82 billion words a month and its feature page plainly says "avoid Google penalties" — direct evidence of its SEO customer base; StarWriter starts at $4.99 a month, and the same page carries both "guaranteed to bypass all detectors" and "academic integrity guaranteed" (Phase 1 #03). Pricing that spans 80× across one feature category tells you users are not buying a function — they are buying the psychological pricing of "trust and effectiveness" (Phase 1 #03).

Effectiveness has to be stated in layers — this is the place in the whole piece where honesty matters most. Against statistical classifiers, humanizers work: two independent academic studies show Undetectable AI genuinely breaks detectors; the DIPPER paraphrasing model disabled every detection method tested, watermarks included; recursive paraphrasing significantly lowers detection rates with only slight loss of text quality (Phase 1 #01, Phase 1 #03). Against watermarks, they do not work: the watermark signal is embedded at generation time and cannot be rewritten away; once the API layer turns watermarks on by default, the output-side disguise business fails as a whole (Phase 1 #01). One more often-overlooked piece of evidence: research shows purely surface-level lexical rewriting moves a detector's F1 by only 1.6 points. The surface lexical fingerprint is decaying naturally; the truly stubborn machine fingerprints live at the discourse-structure and narrative-rhythm layers, which prompt-level rewriting cannot reach (Phase 1 #08).

## Three Asymmetries in the Chinese-Language Scene

The first asymmetry is the two-track detection system. On the academic track — CNKI, Wanfang, VIP, Gezida — detection principles and accuracy are entirely undisclosed; purchasing is institution-led, and individuals cannot even find official pricing. The only free public option is Tencent's Zhuque, and Zhuque has become the de facto gate for WeChat-official-account content distribution, with a whole ecosystem of "tested and effective" adversarial advertorials growing around it (Phase 1 #08). The English-speaking world at least has "vendor-claimed accuracy" to challenge; the Chinese scene doesn't even have that target.

The second asymmetry is the maturity of the gray industry. AI-rate-reduction services have a clear market price anchor: 3 yuan per thousand characters. Customer acquisition runs entirely on WeChat-official-account advertorials, with homophone-mangled names (知W, W普, 万F, 格子D) used to dodge legal risk when naming which detector a service targets. One product has spun "novel de-AI-ification" into its own product line on the homepage, which tells you AI detection on web-fiction platforms has become a new growth point (Phase 1 #08).

The third asymmetry is the open-source ecosystem's objective function. Chinese-circle humanizer projects are almost all Claude-skill shapes that appeared between 2025 and 2026, openly taking "CNKI 3.0" as their reverse-engineering target — a blunter posture than the English circle: the leading English projects wear the coat of "writing quality", while the Chinese projects plainly label themselves "lower AIGC detection rates". The methodology is entirely same-origin, though: Chinese projects explicitly cite blader/humanizer and the Wikipedia list, while adding one constraint specific to the Chinese scene: "reducing duplication scores is not the same as colloquializing — past the machine review there is still human review; keeping the academic written register is a hard floor" (Phase 1 #08).

Chinese detection has an even more fundamental absence: dedicated Chinese academic work exists (several Chinese detection benchmarks), but the English circle's systematic reliability critique of "detectors are unreliable" has no counterpart in the Chinese scene (Phase 1 #01). In other words, large numbers of students are being graded by tools whose accuracy has never been independently tested. On the reader side there is a plain consensus: a purely AI-written piece can be spotted at a glance. Nothing wrong to point at, but no surprise either — you cannot feel a real person sitting across from you (Phase 2 #29, C8).

## Our In-House Setup: How We Use humanizer-zh

Before describing our in-house setup, let me draw the goal difference. A commercial humanizer's KPI is pass rate; ours is readability. The polish stage of this blog's production line is handled by two existing skills: write specializes in removing AI flavor, and humanizer-zh evolved from the Wikipedia "signs of AI writing" list, targeting machine cadences like forced parallel triads and grandiose metaphors. After it runs, there is no "AI rate" metric at all — we never measure our own drafts with detector scores; the draft answers to the reader only.

The second difference is process: flagging and rewriting must be two separate steps. A writer in the overseas community put this meta-judgment best: ask AI to check whether a draft has AI flavor, and it will always say it's clean. Not because the draft is clean, but because those machine-flavored sentences are exactly the "good writing" in the model's training objective: tidy closing sentences, "not X but Y" constructions, three-point parallelism, opening paragraphs that restate the question. To the model, those are virtues (Phase 2 #29, E1). Athlete and referee share the same weights, so self-inspection is bound to fail. That is why a human sets the self-inspection checklist, and the process is fixed into three steps: AI only flags and never rewrites; a human vetoes flagged items; AI rewrites only the flagged sentences that survive, outputting a diff.

The third difference is the boundary: de-AI-ifying only touches the expression layer, never the fact layer. Rewriting inherently introduces factual-drift risk, and humanizer-type tools universally require re-checking claims after rewriting (Phase 1 #01). Our production line puts fact-checking behind a human gate — every sentence the AI touched must still pass "is this sentence still true?"

## The Verdict: The Arms Race Has No Winners

My verdict: this niche's demand is manufactured by an arms race, its revenue is driven by anxiety, and its technology is propped up by probability — neither side is sustainable (Phase 1 #03). Unpacked into three sentences.

The detector side's exit is already written in its actions. Dropped by universities, discredited by research, sued over false positives — the leading players have collectively pivoted to "proof of writing process": GPTZero launched writing replay and author verification, Originality does AI-usage allowance management, Winston does website certification (Phase 1 #03). Translated: a career change from judge to notary — no longer ruling "this article is 30% AI", instead showing you "here is how this article was written". That path at least connects to verifiable facts: it can judge evidence, it cannot judge probability.

The humanizer side's wildcard is model-native watermarking. SynthID-class watermarks are embedded during generation, cannot be rewritten away, and already have production-grade deployments (Phase 1 #01); platform-built detection is the second shoe to drop — Substack integrating Pangram has already moved detection from "a teacher clicking manually" to "infrastructure doing it automatically" (Phase 1 #03). With API-default watermarks plus platform-automatic detection, the "output-side disguise" business has nowhere left to live.

The position actually worth betting on is neither side — it's the layering. Frontline writers' practice has converged on one sentence: "AI does volume, humans do flavor; AI does process, humans do judgment" (Phase 2 #29). No sustainably produced piece of writing is delivered straight from a blank prompt. What detectors and humanizers fight over is a text's provenance; what readers care about has never changed — whether a real person sits across from them. Once these two questions decouple, the arms race degrades into background noise: the unit of trust is not a percentage, it's a byline and a process. For the legal meaning of the byline, see "Copyright and Legal Boundaries of AI Writing", published the same day.

---

> **Related posts**: [The Real Workflows of Frontline Writers Have Converged into Four](/2026/09/14/ai-writer-four-workflows/) (Chinese) | [Copyright and Legal Boundaries of AI Writing: A Panorama for Individual Creators](/2026/09/15/ai-writing-copyright-legal/) (Chinese)
