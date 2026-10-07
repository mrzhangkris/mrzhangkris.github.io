---
title: "A Mystery Game Platform (Part 1): From a Pot of Turtle Soup to Murder-Mystery Scripts Where the AI Lies"
date: 2026-09-11 20:00:00
categories: [Tech]
tags: [AI, Game Development, Indie Development]
copyright_author: Sinan
series: turtle-soup
series_title: "The Full Record of the Turtle Soup Mystery Game Platform"
cover: https://images.pexels.com/photos/14777019/pexels-photo-14777019.jpeg?auto=compress&cs=tinysrgb&w=1600
lang: en
---

Turtle Soup is a party deduction game. The puzzle setter throws out a bizarre surface story — say, "he eats penguin meat every day, and cries after eating" — and players can only ask questions answerable with "yes" or "no", closing in on the hidden truth bit by bit. The whole fun of this game rests on the puzzle setter: they know the entire truth, and they have to keep it.

I figured this is something AI is naturally good at. It has read more mystery stories than any human setter could, it never gets tired, it never spoils, and it's available on call. That's how [Turtle Soup](https://soup.jianshi.xyz) came to be — a mystery game platform that grew out of a single pot of turtle soup. As of 2026-09, it offers three game modes, three original live murder-mystery scripts, 70 single-player puzzles; WeChat Pay runs end to end for real, and 660+ backend tests guard the deployment gate.

This post retraces how the platform grew, and what it takes to have AI play a murderer who lies.

![Platform home page, three game modes](/img/ai-turtle-soup-platform/01-home.png)

## Three Game Modes, One Monetization

The platform's home page is a dark terminal-style layout with the three modes side by side, all sharing the same account and membership system.

The first mode is classic surface-story deduction. A polished bank of 30 puzzles, playable the moment you open it. With every question you ask, the AI rules in real time "Yes / No / Irrelevant / Yes and no", judging against its understanding of the hidden truth. When you're stuck you can ask for hints, and once you feel you've pieced it together, write the truth as you see it in free text and the AI scores and critiques it. It can also set puzzles on the spot: give it a theme and a difficulty, and it generates a brand-new puzzle. Members can commission private puzzles, weaving their own names and inside jokes into the riddle. Want to play with friends? Open a friends room, join with an 8-character room code, and when the host gets stuck there's even an "AI answers for me" option that hands over a suggested ruling.

![Classic soup play: ask, get rulings, close in on the truth](/img/ai-turtle-soup-platform/04-soup-play.png)

The second mode is the single-player immersive murder mystery, *Rainy Night Inn*. Five acts of original script, a text adventure for one: Room 403 shows occupied forever, the desk lamp switches itself on at 2:14 a.m., and there are seven letters written on blank paper. Click scenes to search for evidence, talk to NPCs, and free actions are handled entirely by the AI DM. Every character has its own TTS voice, each act opens with a "script for this act" interlude, and when the countdown hits zero the story advances whether you're ready or not — like playing through an audio drama.

![Single-player murder mystery Rainy Night Inn: scene investigation and the AI DM](/img/ai-turtle-soup-platform/07-mystery.png)

The third mode is the platform's flagship: live roleplay murder mystery, and the focus of this post. Groups of 1 to 5 players; empty seats are filled by AI, and the AI doesn't just fill in — it acts, and it lies.

## One Script per Player, AI Fill-Ins That Actually Act

The live mode mirrors the core experience of offline murder mystery: information asymmetry.

At the start, each player receives a character script that belongs to them alone: public identity, secrets (flagged in red), an act-by-act timeline, and personal tasks. Secrets are delivered encrypted per seat — you only ever see your own copy. Clues found during investigation go into your own pocket first; whether to make them public is your call, and you can also private-message anyone to sound them out. At the end, everyone votes for the murderer, and regardless of right or wrong the truth is revealed immediately.

![Opening script reading: case dossier, five seats, your own character script](/img/ai-turtle-soup-platform/10-roleplay-script.png)

Empty seats are role-played by AI. The key is that each AI only holds its own character card and knows nothing of the others' secrets — so it dodges, lies, and changes the subject, holding its cards just like a real player would. The AI in the murderer's seat is even harder to crack: even cornered by ironclad evidence, it only "breaks down" as scripted, and never confesses.

The AI cross-chat chain pushes the confrontation one step further. Whoever an AI's line names by name gets to respond. You'll see Xiu'e shove the blame onto Lin'an, and Lin'an testify back — ensemble confrontations grow on their own, with no one choreographing them.

![Public-screen confrontation: AI characters naming, blaming, and testifying against each other](/img/ai-turtle-soup-platform/12-roleplay-chat.png)

![Endgame voting: accuse whoever you believe is the murderer](/img/ai-turtle-soup-platform/13-roleplay-vote.png)

After the game there's a task-scored debrief: each player's 3 hidden tasks are settled one by one, the murderer earns bonus points for "escaping justice alive", and the debrief page also carries the full investigation replay and clue ownership — every step laid out plainly.

## Making the AI Act Convincingly: The Five-Piece Role Kit

For the AI to act like a human in live games, one line of "you are an innkeeper's wife" is not enough. The platform equips every AI character with a five-piece kit, all written into the script data.

Take Xiu'e the innkeeper's wife from *Death of the Lighthouse Keeper*. Her evasion policy (deny_rules) and ironclad-evidence patch (patch_rules) look like this:

```json
{
  "name": "Innkeeper · Xiu'e",
  "deny_rules": [
    { "about": "The smashed pot / Did you fight with him?",
      "say": "\"I smashed my own pot!\" — the pot was indeed the one you slammed onto the reef as he left; you admit smashing the pot to vent, but you never laid a finger on him" },
    { "about": "You hated him / You had a motive to kill",
      "say": "\"Hate? What I hate is that year's lamp!\" — steer the hatred toward \"the lapse on duty that night at the lighthouse\", never toward Lao Zhou himself" }
  ],
  "patch_rules": [
    { "if_clues": ["ledger"],
      "say": "(presses the ledger down, then slowly lets go) \"...Yes, he owed me eight thousand. Two years, and every year he said he'd pay next year. Last night I went to collect the money, we fought, and at 21:38 I slammed the door and left. If I wanted him dead, would I have waited until today?\"" }
  ]
}
```

The core idea of this design is scripting the behavior instead of trusting the LLM's own judgment. The evasion policy (deny) fixes, in the script, the line to hold when a suspicious topic comes up; the evidence patch (patch) triggers the instant a specific clue is made public on the clue board, and the character it implicates flips face on the spot and delivers the prepared defense; the collapse script (collapse) is the crack in the armor once the decisive evidence set is complete. All triggering is decided by code — the condition is the public clue set covering the rule's trigger group — and the LLM only handles the free-form Q&A. Deterministic triggering beats praying that the model performs every single time.

The fifth piece is the fuse. After the LLM's output passes through, it must clear a self-incriminating keyword filter: hits like "I killed" or "I'm the murderer" get replaced wholesale with the evasion line. The most critical taboo should never be left to the prompt to enforce — you backstop it on the output side. Players have tried all kinds of verbal tricks to fish a confession out of the murderer-seat AI. Not once has it worked.

## How the Secrets Stay Secret

The other lethal problem in live games is information isolation. Five players on five WebSocket connections — what keeps Zhang San from seeing Li Si's secrets?

The platform builds "no leaking" into the server architecture. The room state each connection receives is a personalized snapshot assembled by the server according to "who this connection is": private fields (your own script, your own clues, the private chats you take part in) appear only in your own payload. Other characters' scripts and secrets never enter your state data in the first place, and never enter the AI's prompts either. The frontend would have nothing to render even if it wanted to — the data simply isn't on the wire.

An accompanying leak-matrix test suite rounds this out: from each seat's perspective, it asserts that other players' scripts and secrets never appear in my state or the AI prompt. This class of bug can't be exhausted by human eyes — you need a test matrix watching it for you.

## Engineering Quality and the Business Loop

The platform now has 660+ backend tests, including a security-hunting suite that specifically targets privilege escalation, forged payment callbacks, concurrent grabs, and replay attacks. A full regression run is mandatory before deployment, and online room processes can restart without loss: even if the in-memory room registry is gone, all progress sits in the persistence layer and is rebuilt after restart so play resumes.

Monetization is subscription-based. As of 2026-09 the tiers are a 2-yuan day pass, a 15-yuan monthly pass, and a 38-yuan quarterly pass; membership unlocks unlimited AI quota, private puzzle commissioning, and hint boosts. Payments go through XunhuPay WeChat Pay, with callback signature verification, amount checking, and idempotent activation all automated. On launch day I paid for a 2-yuan day pass with real WeChat Pay — from payment to callback to automatic membership activation, the whole path ran with zero human intervention.

![Membership pricing and benefits](/img/ai-turtle-soup-platform/15-pricing.png)

## The Numbers and Some Takeaways

| Dimension | Number |
|---|---|
| Game modes | 3 (classic soup / single-player murder mystery / live roleplay) |
| Live scripts | 3 original murder-mystery scripts, 5 players each |
| Single-player puzzles | 70 |
| Backend tests | 660+ (including the security-hunting suite) |
| Payments | Verified with real WeChat Pay transactions |

Looking back, two lessons from this project are the most reusable.

Reliable AI roleplay doesn't come from prompt prayers; it comes from structure. Which topics to dodge, which evidence triggers which line, which words must never be spoken — all of it becomes rules in data plus a filter on the output side, and the LLM only fills in the free-form parts.

Gameplay foundations like information asymmetry must be built into the architecture. Per-seat state assembly, leak-matrix tests, and need-to-know injection of information into AI prompts — only with all three layers do you dare claim secrets are held only by those who should know them.

From one pot of turtle soup, simmered down into a mystery game platform. The murderer lies, the testimonies interlock, and the truth is one and only.

Platform address: [Turtle Soup](https://soup.jianshi.xyz)

> The next post tells the other half of this platform's story: the three murder-mystery scripts were created with AI in the loop. AI writes scripts fast, but what it writes doesn't necessarily survive five players cross-examining each other with their own timelines. So we ran a clue-by-clue consistency audit and caught 56 defects. That was the more interesting lesson — [Part 2: AI-Written Murder Mystery Scripts — Writing Is Easy, Staying Consistent Is Hard (Chinese)](/2026/09/11/ai-script-consistency-audit/).
