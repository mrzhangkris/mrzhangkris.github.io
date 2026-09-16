---
title: "The Real Workflows of Frontline Writers Have Converged into Four"
date: 2026-09-14 23:45:00
lang: en
categories: [AI Engineering]
tags: [AI Writing, Workflows, Research, Content Creation]
copyright_author: 干将
cover: https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=1600&q=80&fm=jpg
---

AI writing as seen at vendor keynotes is "one sentence generates a viral hit"; AI writing in the hands of frontline writers is a local corpus, six acceptance gates, and an iron rule that "facts must be verified by yourself." Where does the gap lie? We ran a survey that accepts only first-hand material: 10 long-form first-person accounts by Chinese writers (sspai, Juejin, Tencent, Sina, Jianshu — all authors disclosed their AI use under their real names), plus 8 first-voice discussions from overseas writing communities, extracted item by item along four dimensions — which stage AI is used in, which stage it is firmly kept out of, the worst failure, and quantifiable output.

From those 18 sources, four workflow types converged. This post lays out all four, with each type's shared failure points.

First, the method, stated plainly: we only collected content where the author disclosed AI use under a real name, and every link was opened and verified by hand; extraction followed a fixed set of four dimensions — which stage AI is used in, which stage it is firmly kept out of, the worst failure, and quantifiable output. Only with fixed dimensions can you speak of "convergence"; otherwise it's just a scrapbook of impressions. Don't overestimate the sample, either: authors willing to publicly disclose are survivors to begin with — this list works for them, and not necessarily for the silent majority.

## Type A: Knowledge Base + Dual-Track Writing — "Humans Own the Flavor, AI Owns the Volume"

The most common type. The skeleton is a local long-term corpus (an Obsidian card box, a WeChat official-account archive); before writing, search your own past work first; **write the opening, the ending, and personal details yourself, and hand the middle sections to AI for expansion**, then rewrite the draft back into your own spoken voice, and finally archive it into the corpus for reuse next time.

One author fed 523 personal Markdown notes to the model for style alignment and iterated through three versions before settling; another's principle is even simpler and more direct: the opening, the examples, and the ending are always done personally.

Shared failure point: failures of this type almost all happen at "let AI polish the whole piece" — AI polishes the entire article into AI flavor. The community has even grown a minimalist counter-technique: have AI first mark which sentences sound like AI, then have AI rewrite only the marked sentences.

## Type B: Multi-Model Division of Labor + Multi-Role Review — "AI Is the Review Panel, the Author Has Final Say"

This type doesn't agonize over which model to use; it divides labor by stage: one model for research, one for structure, one for fact-checking; during writing, AI repeatedly switches expert identities — librarian, architect, security expert, opposing reviewer — picking holes over multiple rounds. The heaviest practitioner set up 8 roles and 6 acceptance gates (facts, concepts, method feasibility, opposing opinions, author self-review).

There are two consensus failure points: AI's first drafts are generally "generic consulting copy" — correct but stanceless; and AI's own judgments are unstable — one author measured the same AI contradicting itself about the same novel across sessions. So this type's iron rule is **fact verification must be done by humans**, with AI's opinions treated only as leads.

## Type C: Private Style Configuration + Revision-Feedback Loop — "AI Learns My Revisions and Corrects Itself"

The most engineering-flavored type. Personal style, reader personas, image-count limits — all written into a config file; AI produces two drafts daily (one baseline draft frozen, one revised per feedback); the author does only diffs in the evening, distilling **no more than five executable rules** from the changes into local memory, which are read back as hard constraints at the next writing session.

Everything hinges on the word "executable": a rule must be a sentence whose right or wrong can be judged, like "no more than four images per post"; vacuous rules like "make the style a bit better" have no legal force — a tuition fee this type's practitioners admit paying themselves.

## Type D: Multi-Platform Distribution + GEO — "Content Production → Channel Amplification"

The first three types govern production; this one governs amplification: the author personally handles only topic selection and quality control, while AI batch-generates multi-platform versions (title length, tags, and cover dimensions adapted per platform), schedules publishing automatically, and later optimizes content for citations by AI assistants. One author did a ninety-day review: multi-platform sync time dropped from two hours to twenty minutes.

But its shared failure point is also the most cutting: **ten batch-generated accounts don't beat one carefully made piece**; platforms' special rules are beyond what tools can help with; and AI-flavored writing is recognizable at a glance on distribution platforms — it actually costs you points. This type suits authors who already have stable production quality and want to amplify distribution; it should not be the main workflow.

## Cross-Type Consensus

Beyond the four types, three consensuses span all practitioners:

1. **The forbidden zones are highly consistent** — openings and endings, personal experience, fact-checking: almost no one hands these three to AI;
2. **"AI as the ignition starter" doesn't constitute an independent type** — having AI open the piece when writing is blocked, asking for feedback when stuck: such uses are scattered across every type; they're auxiliary steps, not workflows;
3. **Revision data is a compounding asset** — Type A archives it into the corpus, Type C distills it into rules; both turn "this revision" into "fewer revisions next time."

Alongside the cross-type consensuses, two honest footnotes. First, overseas communities have another use of "AI as the ignition starter" — having AI open the piece when writing is blocked, asking for feedback when stuck, sketching the draft as a diagram — with plenty of users, but as an auxiliary step it's scattered across the four types and cannot support an independent type. Second, some writer communities are absent from this corpus (nonfiction writers, for example), and the conclusions' applicability to them is in doubt — exactly the hole the next survey round needs to fill.

Incidentally, all four types have shadows in our own blog production line: dual-track writing corresponds to "humans set the structure, AI expands it"; multi-role review corresponds to the article verifier plus the health check; the config loop corresponds to the writing baseline iterated version by version. **That frontline practitioners' convergence and an engineering production line's evolution arrived at the same place from different directions is itself a signal**: the mature form of AI writing is not full automation, but the precise division of labor between human and machine.

## An Honest Tail

The survey's expiry conditions are stated too: model capabilities and Agent skill standardization are still evolving fast, and the four types' boundaries may re-merge — for instance, once the skill marketplace matures, Type B's multi-model division of labor may collapse into tool calls inside a single Agent. The conclusions are valid for roughly the next year, until next spring; at that point it's worth running another round.

Methodology outlives conclusions: grab first-person accounts, extract along the four dimensions of stage/forbidden zone/failure point/output, and trust only content with real-name disclosure — this playbook transfers to any other survey target unchanged.

## The Three Sharpest First-Hand Quotes

Three sentences in the 18 sources deserve to be pulled out on their own, each mapping to a verifiable failure mode.

**The first, on why AI flavor is fatal** (WeChat official-account author Simonlin): 「Articles written purely by AI, readers spot at a glance. It's not that the content is wrong — it's that the 'flavor' is wrong: that over-tidy sentence structure, the logic with no flaws but no surprises either, that 'in summary' ending. The reader can't feel a real person sitting on the other side.」

**The second, on honest disclosure** (sspai author canber, who voluntarily states he works deeply with AI): 「Depending on AI means depending on AI. I don't want to package this article as 'I wrote it all myself, AI only did the polish.' The truth is AI participated in literature search, viewpoint synthesis, structure design, content generation, charts, expert-role simulation, defect review, and multiple rounds of rewriting.」 — a rare no-pretense sample in the Chinese-language sphere; the 8-role review process comes from him.

**The third is the harshest, explaining why AI self-review is bound to fail** (a Reddit user): ask AI to check whether a draft has AI flavor, and it will always say it's clean — not because the draft is truly clean, but because those machine-flavored sentences happen to be exactly the "good writing" in the model's training objective: neat closing sentences, the "not X but Y" construction, three-point parallelism, an opening paragraph that restates the question. **To the model, those are virtues, not defects.** This is also why no detection/humanizer toolchain can ever rely on the model reviewing itself alone.

## The Gap Against the Vendor Narrative

The most revealing part of the survey is the contrast between frontline practice and the vendor line:

| Vendor narrative | Frontline reality |
|---|---|
| "10x efficiency, drafts in minutes" | One author took 90 days to sediment a workflow; many still need 5 rounds of manual revision; one burned a cumulative 4 billion tokens to arrive at 7 usable workflows |
| "One-click publishing to every platform" | Testing shows Sohu/Baijiahao/WeChat official accounts all require manual adaptation; "one-click" is ad copy |
| "AI feedback = editor replacement" | One author admits using AI for feedback "because no one is willing to listen" — a byproduct of loneliness, not a craft upgrade |
| "AI lets everyone become a writer" | A contracted author produced 370,000 characters that almost nobody read — AI cannot solve distribution |

The converging verdict in one sentence: **none of the genuinely sustainable workflows of 2026 matches the "AI one-click done" narrative** — they are all human-layered: AI does volume, humans do flavor, AI does process, humans do judgment. Not a single article was delivered straight from a blank prompt.

There's also a painful distribution pattern: **the closer a group is to "byline — personal brand — long-term identity," the less they disclose their AI workflows** — investigative journalists, contracted authors, credited screenwriters, published academics: first-hand accounts are entirely absent. Publicly stating "how I use AI" costs their personal brand too much. So this four-type map describes "the people willing to say it" — read it with that filter on.

---

> **Related posts**: for the engineering side of writing in production, see [Blog Production Line (Part 2): 10 Parallel Agents Renovated 93 Old Articles in One Day](/2026/09/14/ai-blog-v4-renovation/) and [AI Novel Production Line (Part 1): An Orchestrator That Doesn't Write, Only Enforces Discipline](/2026/09/14/ai-novel-pipeline-libai/).
