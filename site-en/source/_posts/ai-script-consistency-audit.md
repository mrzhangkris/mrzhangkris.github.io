---
title: "A Mystery Game Platform (Part 2): AI-Written Murder Mystery Scripts — Writing Is Easy, Staying Consistent Is Hard"
date: 2026-09-11 20:30:00
lang: en
categories: [Tech]
tags: [AI, Game Development, Quality Engineering]
copyright_author: Sinan
series: turtle-soup
series_title: "The Full Record of the Turtle Soup Mystery Game Platform"
cover: https://images.pexels.com/photos/4587610/pexels-photo-4587610.jpeg?auto=compress&cs=tinysrgb&w=1600
---

Generating a murder-mystery script with AI takes a single evening: five characters, a death in a closed space, one secret and one timeline per person, and a handful of clues — the text looks impressive enough on its face.

But a murder-mystery script has a special quality bar: it has to survive five players cross-examining each other with their own scripts in hand. Players will lay their timelines out on the table and compare, press each other with "you say you climbed the tower at 21:40, he says he heard a muffled thud at 21:47 — so where were you at 21:45", and point at a clue card to accuse: "this cigarette butt is yours." One mismatched number, one piece of physical evidence nobody claims, one spatially impossible sighting, and the confrontation blows the whole thing apart — the illusion of closed-space reasoning collapses on the spot.

My Turtle Soup platform ([Turtle Soup](https://soup.jianshi.xyz)) runs three original live-player scripts: *Death of the Lighthouse Keeper*, *The Night Train*, and *The Fog-Locked Gallery*, plus two single-player scripts and 70 soup puzzles. In early September 2026, we ran a line-by-line audit of all script content, caught 56 defects, fixed every one of them, and got all 93 gate tests passing. This post reviews that audit: what kinds of mistakes AI (and humans) make when writing scripts, and how to catch them systematically.

## The Authoring System: A Script Is a JSON Seed

Before the audit, a word on where scripts come from. Adding a new script to the platform requires no code changes: a script is just a JSON seed — drop it into the seed file, structural tests validate it automatically, and after a restart the game is ready to run.

![Script list: the three original scripts are three JSON seeds](/img/ai-script-consistency-audit/08-roleplay-create.png)

Every character has a fixed granularity in the JSON: public identity, personality, script body (secret + timeline), opening lines, evasion policy, ironclad-evidence patch, breakdown line, voting tendency, personal task, and opening clues. The engine drives the AI's performance and behavior rulings off these fields.

The field most likely to plant a landmine is the personal task. When designing a task, you must first work out how the machine will judge its completion. The platform implements seven ruling predicates: `clue_unpublished` (a clue remains unpublished), `whisper_distinct` (whispers with different people), `search_total` (number of searches), `publish_any` (publishes a designated clue), `public_chat` (number of public-screen messages), `vote_correct` (votes for the real murderer), `survive` (survives to the endgame). Writing a task like "find out the truth" that cannot be automatically judged is planting a landmine in the endgame settlement.

Character behavior works the same way: which topics to dodge, what alibi to give once a certain clue is published, when to crack under a certain set of evidence — all written as structured rules, with triggering ruled by code. Scripting behavior makes the AI performance controllable, but it also means every fact a rule references must agree exactly with the script body, the timeline, and the clue descriptions. The consistency debt is taken on at the authoring stage.

## How the Audit Worked: Three Lines

The audit was not a read-through looking for typos. We worked three lines.

**Physical evidence to owner**: for each clue, the `points_to` field (which suspect it points at) was checked one by one against the fact chain of the character scripts, asking whose object this really is and who touched it in the script.

**Cell-by-cell timeline verification**: each script's five characters' movements were laid out hour by hour into a table, the truth anchors pinned down, and then each cell checked: at any moment, does anyone's account hold up simultaneously with everyone else's account, with the truth, and with the location of the physical evidence?

Here is what the timeline verification table for *Death of the Lighthouse Keeper* looks like (excerpt):

| Time | He Jing | Xiu'e | Zhou Xiaozhou | A Chao | Lin An |
|---|---|---|---|---|---|
| 21:30 | At the sanatorium | Confrontation at the tower station | Work shed | Dockside | The inn |
| 21:35-21:42 | Slips into the cabin to take the medicine | Arguing until 21:38, then slams the door | | | |
| 21:47 | Already left | Splitting firewood (witnessed) | Hears a muffled thud in the lamp room | | |
| 22:00 | Dormitory | The inn | In the lamp room, trims the wick low | In Leeward Cove, sees "a figure standing in the tower's shadow" | |
| 22:30 | | | Work shed | | Knocks on the tower door; no answer |

**Solvability calculation**: searching has a quota (3 per act per person), and clues are claimed in location-pool order. The trigger set of the murderer's breakdown script and each seat's clue income all had to be simulated with a solo player searching in optimal order, checking whether the set can be completed within the quota. A trigger condition that can't actually be reached is as good as never written.

After the three lines, the three live scripts plus two single-player scripts plus 70 soup puzzles yielded 56 defects in total: 1 critical (P0), 22 major (P1), and 35 polish-level (P2).

## The Stranded-Island Predicament Broken by the Boatman's Own Boat (P0)

The core setting of *Death of the Lighthouse Keeper* is a closed island: the lighthouse keeper Old Zhou falls to his death from the tower, and the case dossier reads "this morning's boat has already left port. The next boat is seven days away. The police cannot reach the island." Nobody can leave, so everyone must investigate — that is the closed premise the entire script rests on.

The problem is with the boatman A Chao. Open his personal script: at 21:50, "you took the boat from the dock over to Leeward Cove and hid it"; at 23:00, "quietly returned to the dock and slept on the boat." His boat was on the island all night. The boat can sail, and the man is on the island. The five players were never trapped at all — they could take the boat and call the police. The seven-days-until-the-police closed premise falls apart on the spot.

Even the dates don't agree: A Chao's public identity is "comes every Wednesday, leaves Friday." If the boat leaves Friday morning and the next one arrives Wednesday, the gap is five days — which also fails to square with "the next boat is seven days away."

The fix was to rewrite A Chao's world setting: the big boat belongs to the shipping line and did leave port that morning as normal — the closed premise survives; A Chao is an island-based small-boatman who runs unlicensed trips, and his private little boat ran aground in Leeward Cove in the small hours and took on water, its engine refusing to start. The boat is there, the man is stuck on the island, and the boat cannot sail. Five places — case dossier, public identity, script, patch lines, voting hints — were updated to a single consistent version.

This is a textbook P0: read separately, every piece of text is fine; put together, the world's foundation collapses. In the audit this class is called a closed-premise conflict with individual settings — machines can hardly find it automatically and only human review catches it, but it is a mandatory check on the launch checklist.

## Seventeen Minutes or Seventy-Seven Minutes

*Death of the Lighthouse Keeper* also contains a twenty-year-old case that anchors the motive line: one night the lighthouse keeper lit the lamp late, and eleven people died. Nearly every place in the script says "seventeen minutes late" — except one clue card, a reply letter from the archives bureau, which reads "the lamp was due at 18:00 and was actually lit at 19:17," its description text even doing the math itself: "seventy-seven minutes late."

The truth is that the underlying moment drifted: one place says the lamp was due at 18:00, while everywhere else says 19:00. From 19:00 to 19:17 is seventeen minutes; from 18:00 to 19:17 is seventy-seven. Each account is internally consistent; combined, they give themselves away. If a player presses on this clue card about exactly how late the lamp was, the credibility of the motive line takes a direct hit.

The fix: the reply letter and the truth were unified as "the lamp was due at 19:00, actually lit at 19:17 — seventeen minutes late."

This kind of numeric entity drift (times, durations, amounts, headcounts) is a high-frequency defect in AI-generated content — and also the most automatable kind: run entity extraction on "number + minutes/time/amount," scan the values of the same event for uniqueness, and raise an alarm on mutually exclusive values. Since this audit, the timeline has been backfilled as structured fields (15 seats × 70 entries), so consistency assertions can be built directly on the structure.

## Physical Evidence with the Wrong Owner

The third high-frequency defect class is clues pointing away from the fact chain — in the audit, called points_to mismatches:

- The cigarette butt in *The Night Train*: the smoker is Shen Wanchuan; both his script and Bai Weilan's lying guide rest on that fact — yet the clue pointed to Tie Hansheng.
- The drag marks on the floor of *The Fog-Locked Gallery*: Ruan Qing dragged the painting, but the clue pointed to Lu Xiaotang. Lu Xiaotang's suspicion path was consequently broken and had to be carried by other clues instead.
- Still in *The Night Train*, "the money-transfer receipt in the mattress seam" had three parties in conflict: Lin Shuang's script says she took it, the clue description says it's still in the seam, and a patch line says it's "in the paper clip on the desk." One object, three locations — a player who wants to challenge it doesn't even know where to begin.

Object ownership must be unique: a physical object can only be in one place at one moment, and once someone's script says "took it away," the clue description and the truth must acknowledge it is no longer there. Machines can handle this semi-automatically (presence-exclusivity checks on entities), but whether a given pointing holds up narratively still needs human eyes.

There is also the reverse-direction error: an extra piece of planted evidence nobody claims. "Hair-tie fibers on the spare-key hook, plus two scratch marks" sounds like key evidence — but turning through all five scripts, nobody touched the keys, and the truth explicitly states the keys were never moved. Planted evidence with no factual backing sends players chasing a dead line. We deleted it and replaced it with "nobody touched the keys, but nobody was watching them either" — atmospheric without lying.

## The Numbers

| Script | P0 | P1 | P2 | Status |
|---|---|---|---|---|
| Death of the Lighthouse Keeper | 1 | 6 | 6 | All fixed |
| The Night Train | 0 | 7 | 6 | All fixed |
| The Fog-Locked Gallery | 0 | 4 | 9 | All fixed |
| Rainy Night Inn (single-player) | 0 | 5 | 2 | All fixed |
| Fog Island Sanatorium (single-player) | 0 | 0 | 3 | 2 fixed, 1 outstanding |
| 70 soup puzzles | 0 | 0 | 9 | 8 fixed, 1 outstanding |
| **Total** | **1** | **22** | **35** | **56 fixed** |

Fixing doesn't end when the edits are done. The gate tests — full script-consistency, structural validation, soup-puzzle consistency, and the leakage matrix — went green on all 93 cases, plus script-simulation verification: all trigger sets across the three scripts are reachable within a solo player's search quota, and every seat's clue-pool income meets the bar.

![Investigation and action: every clue goes into its own pocket](/img/ai-script-consistency-audit/11-roleplay-act.png)

![Endgame review: a full investigation replay, where every step of every player is on the record](/img/ai-script-consistency-audit/14-roleplay-reveal.png)

## What Can Go to Machines, and What Needs Human Review

The audit's biggest outcome was turning content quality from a one-off action into a sustainable defense line. By degree of automation, the checks split into three tiers.

What machines can guard directly goes into reasoning-gate tests:

- Trigger-set reachability: simulate a solo player claiming clues in location-pool order and assert that breakdown and patch trigger conditions can all be met within the quota
- Numeric entity consistency: extract "number + minutes/time/amount" and scan same-event values for uniqueness, built on the structured timeline
- Spoiler scanning: intersect the keyword sets of character secrets with the case dossier and the introduction
- Text-format assertions: mixed English/Chinese and half-width punctuation in player-visible text

What needs heuristics backed by human review:

- points_to semantic correctness: a keyword-intersection heuristic does the first pass, with a human checklist as the safety net
- Object ownership uniqueness: verb-direction and presence-exclusivity checks

What only humans can review:

- Whether a puzzle surface's final line leaks the reasoning direction: a one-sentence spoiler like "the spot in front of his freezer" is beyond a machine's judgment
- World-level consistency of the closed premise: the stranded-island predicament broken by the boatman's own boat can only be found by someone who understands the world

This checklist pays off in a concrete way: only by knowing which quality gates can be automated and which will always need humans do you dare scale up content production.

## Closing Thoughts

Back to the title. With AI writing murder-mystery scripts, the generation step is nearly free — the hard part is making five differently-angled, individually-lying texts fit together seamlessly at the fact layer: the same person cannot be in two places at once, one piece of physical evidence cannot have two owners, one number cannot have two versions.

The answer this audit produced: authoring is responsible for drama and information asymmetry; auditing is responsible for welding the fact chain shut. Machines guard the gates that can be automated; humans guard the gates that require understanding a world.

One interesting finding along the way: *The Fog-Locked Gallery*, with the most defects caught (13), and *The Night Train*, with the fewest (also 13), are exactly tied — which says defect count has little to do with how well a script is written, and much more with text volume and cross-reference density. The more you write, the more you need the audit.

Platform address: [Turtle Soup](https://soup.jianshi.xyz) — all three scripts are playable online.

---

> **The Series**: (1) [From a Pot of Turtle Soup to Murder-Mystery Scripts Where the AI Lies](/2026/09/11/ai-turtle-soup-platform/) | (2) This post · The script consistency audit
