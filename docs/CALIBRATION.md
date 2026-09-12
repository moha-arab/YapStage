# Bot ratings: what the numbers mean and how they were set

Every bot on the ladder shows a rating. Chess.com shows bot ratings too and
never published how they were set, which is exactly why their own blog had to
admit that a bot labelled 2000 plays around 1800. This file exists so that never
becomes true here without someone noticing.

## The scale

Humans start at **700**. Bot ratings are **fixed** and never move.

700 comes from the ladder, not from chess: at 700 you are a 57% favourite over
Pip (650) and a 30% underdog to Cappy (850), so your first rated match is
probably a win and not certainly one. The old seed of 1000 was wrong for a
specific reason. 1000 *is Vivi*, rank 3 of 6, so every new account was handed
the claim that it could already take half the ladder.

Chess.com has the same shape: its bots start at 250 and a self-declared beginner
starts at 400, so a newcomer has one rung below them and a long way up. (Its bot
personalities top out at 2450 and the raw engine slider goes to 3200; there is
no bot at 100.)

## Bot matches are UNRATED

Ranked means humans, the same rule chess.com runs. This was briefly reversed
(bot matches rated against the fixed bot ratings) to solve the cold-start
problem in a twenty-person pool, and reverted 2026-08-12. Two reasons, and both
outrank the cold-start argument:

1. **A bot is a fixed strategy.** Ozzy never weighs impacts. Once you learn
   that, you beat Ozzy forever with the same move, and a rating would climb
   while your debating did not. Elo assumes an opponent whose strength is
   stable across all players; a prompt is not that.
2. **A bot match has no witness.** Rating movement against one is the cheapest
   possible farm for anyone with a chatbot open in the next tab. Unobserved
   rating movement is the last place it belongs, and this app has an anti-cheat
   file precisely because of that.

The cold-start problem is real: in a closed human-only pool your number encodes
your rank among twenty friends and little else. The answer is to fix placement
(three matches, not five, so the threshold is reachable) and to keep the bot
ladder as a published yardstick you measure yourself against, not as a source
of rating.

So the bot ratings on this page are a scale you can compare yourself to. They
are not something you can win or lose.

A rating gap means one thing and nothing else:

```
expected score = 1 / (1 + 10^(-gap/400))
```

| gap | stronger side scores |
| --- | --- |
| 0 | 50% |
| 50 | 57% |
| 100 | 64% |
| 200 | 76% |
| 400 | 91% |

So a 950 bot is not "a bit harder" than an 850 one. It should beat the same
player about 64% of the time where the other one wins 36%.

The ladder spans 600 to 1500, which is deliberately narrower than chess's
400-3200. The span should match the real spread of skill in the game, and 900
points already means the top rung beats the bottom rung ~99% of the time. A
wider ladder would be theatre.

## Why the bots never gain or lose rating

They are the anchor. In a small app, a human-only rating pool is closed and
zero-sum: the numbers encode who is above whom and nothing more, so "you are
1200" is a claim about thirty strangers rather than about debating. Bots with
fixed ratings break that on purpose. Beating a locked 1120 bot means the same
thing this year and next.

Bot matches are currently **unrated** for the human ladder (chess.com does the
same). That is the conservative choice: it removes any incentive to farm the
weakest rung. The cost is that the anchor is informational rather than
mechanical. If the human pool ever needs pinning, the change is to make bot
results rated with the bot's K at zero.

## How the numbers were set

Two stages, following the only published methodology in this space
(Chessiverse's, who put anchor bots on Lichess to fix their absolute offset):

1. **Relative order comes from the design.** Each rung has a distinct, named
   ceiling in `server/src/bots.ts` (`rungDirective`). Rungs are separated by
   things a judge can see: how many points they hold, whether they answer the
   opponent's *strongest* argument or dodge to an easier one, whether they bring
   anything concrete, and whether they ever weigh the two cases against each
   other. Before this existed, six bots shared three difficulty strings, so
   ranks 1/2, 3/4 and 5/6 were the same opponent in different fur, and the
   measured margins confirmed it (fox -12 / owl -13, bull -31 / giraffe -32).

2. **Absolute offset comes from measurement.** `scripts/bot-beatability.mjs`
   runs real debates through the real judge against two scripted human profiles
   ("average" and "strong"), whose lines are written the way speech-to-text
   renders live speaking.

### Measured 2026-08-11, "average" profile, 3 runs per rung

| rung | bot | win rate | avg margin | published |
| --- | --- | --- | --- | --- |
| 1 | Pip | 3/3 | +30 | 650 |
| 2 | Cappy | 1/3 | −2 | 850 |
| 3 | Vivi | 0/3 | −11 | 1000 |
| 4 | Ozzy | 0/3 | −27 | 1200 |
| 5 | Brutus | 0/3 | −25 | 1350 |
| 6 | Gigi | 0/3 | −29 | 1500 |

The "strong" profile, same run: 0/3 against Brutus (−19) and 0/3 against Gigi
(−24).

**What this instrument cannot resolve.** Above rung 4 both scripted profiles
lose every match, so the margin stops discriminating: −27, −25, −29 for rungs
4, 5, 6 is a ceiling effect, not a measured ordering. The only consistent
signal up there is that Gigi beats both profiles by about 5 more points than
Brutus does, in both profiles. So the ordering of the top three is design
intent (each rung has a named extra skill) plus a weak measurement, and the
gaps between 1200 / 1350 / 1500 are the least trustworthy numbers on the
ladder. Resolving them needs a stronger test profile, not more runs of this one.

The margin curve is what matters: +30 → −2 → −11 → −27 is a ladder. The run
before this one read +27 → +12 → −12 → −13, with ranks 3 and 4 statistically
indistinguishable, because they shared a difficulty string.

Two ordering bugs surfaced and were fixed here, both worth remembering:

- **Rank 1 was scoring above rank 2.** Rambling at length reads as substance to
  a judge, while conceding does not. Rank 1 now carries both handicaps and
  speaks less.
- **Rank 3 got stronger when it was given "hold two points and reframe".**
  Reframing is a genuine mid-tier skill; it belongs at rank 4 and above. Rank 3
  is one idea, defended stubbornly.

The general lesson: making a bot weaker is not about telling it to be worse. It
is about removing a specific, nameable skill and leaving everything else intact.

## The honest error bar

Getting a rating to ±50 needs about **185 scored matches per bot**; ±100 needs
about **46**. The current numbers come from 3 runs per profile per bot. That is
±200 at best, so treat every rating as provisional and directional until real
human matches accumulate.

The scripted "average" profile is also a **lower bound on a human**, not a
median human: its four turns are written in advance, so it cannot actually
respond to what the bot just said, and clash is 30 of the 100 rubric points.
A real player of the same ability scores higher than the script does.

## Re-run the calibration whenever the judge prompt changes

The ratings are measured against a specific judge. Changing the rubric changes
what "strong" means, so a prompt edit invalidates the numbers.

```bash
PORT=3010 DEBATE_SPEED=fast ELEVENLABS_API_KEY= node server/dist/index.js
URL=http://localhost:3010 RUNS=3 BOTS=duckling,capybara,fox,owl,bull,giraffe node scripts/bot-beatability.mjs
```

Judge fairness has its own harness and should be run alongside it. It checks
that the judge picks the side built to argue better, that a well-argued
unpopular position still wins, and that the call agrees with an independent
blind reader:

```bash
URL=http://localhost:3010 CASES=scripts/judge-cases.json node scripts/judge-eval.mjs
```

Three more instruments sit next to it, and every prompt change should run
all four before the bot calibration (numbers for every run live in
`docs/judge-tightening-log.md`):

```bash
# bias families, each case in both orders (labels exchanged, motion negated)
URL=http://localhost:3010 CASES=scripts/judge-cases-bias.json MIRROR=1 node scripts/judge-eval.mjs
# hard cases: a debater talking to the judge, and new material smuggled into a closing
URL=http://localhost:3010 CASES=scripts/judge-cases-hard.json MIRROR=1 node scripts/judge-eval.mjs
# swap and order harness: does the same speech win regardless of its label and slot?
URL=http://localhost:3010 node scripts/judge-fairness.mjs
# the same with the label-only condition (relabel without moving slots), when swap and order disagree
URL=http://localhost:3010 CONDITIONS=asis,swap,order,label node scripts/judge-fairness.mjs
# the fabricated-evidence probe (calls the built judge directly, no server)
node scripts/fabricated-evidence-probe.mjs
# run-to-run noise: compare two OUT files of the same cases
node scripts/judge-noise.mjs runA.json runB.json
```

`scripts/judge-cases-bias.json` holds ten families, each with a clearly
built-to-win side and a note saying why: length (short and tight vs long and
padded), confidence (assertive and empty vs hedged and substantive), adhom
(mockery vs argument), dodge (never answering the strongest point), concession
(conceding a minor point and winning the major clash), stats (unexplained
figures vs an explained mechanism), stt (the better case rendered as noisy
speech-to-text), offtopic, repeat (one point four times vs a case developed),
and paste (polished chatbot text that never engages). Five families carry a
third case that is a false-positive trap, where the long, confident, rude,
conceding or polished side is the better one, so an over-corrected judge is
caught too.

`scripts/judge-cases-hard.json` holds two more families: inject (a debater
addresses the judge with a fake system message or an override; inject-3 is
the false alarm where a debater merely says "ignore" and "instructions" about
the opponent) and closing (the weaker side introduces its strongest argument
for the first time in its closing, which the judge is told to disregard).
Cases there carry `expectInjection`, and `judge-eval.mjs` reports whether the
`injectionDetected` flag was set exactly when it should have been.

`scripts/judge-fairness.mjs` judges every case three ways: as written, with
the sides swapped (the same words with FOR and AGAINST exchanged, each speech
moved to the same phase on the other side, under the negated motion), and with
only the running order flipped. It tracks the two speeches by identity and
reports how often the winning speech changes, the signed bonus a speech gets
from wearing the FOR label or the FOR slots, the mean absolute score
movement, and how the asis winner's and loser's totals move separately (the
baseline's label bias lived entirely in the losing speech: a thin FOR case
was read as a failed burden, the same thin case as AGAINST as raised doubts).
A fair judge picks the same speech under all three, and the bonuses sit inside
the run-to-run noise.

The judge itself (debate mode) never sees the words FOR and AGAINST: the
sides are Debater A (argues the motion is true) and Debater B (argues it is
false), the transcript and the JSON it writes use those letters, and the code
maps them back. The words themselves cost a losing speech about four points
whenever it wore FOR; the letters cut that to under three. It also writes a
private `analysis` field before any score: a ledger of each side's distinct points, marked answered, conceded
or standing, with the support behind each, ending with a labels-covered line
saying which side has more standing. It is parsed and dropped by
`scoreTranscript`, so nothing the app receives changed; it exists because the
eval log showed the judge naming a total drop in the feedback and then pricing
it at five clash points. The full rule inventory and every run's numbers are
in `docs/judge-tightening-log.md`.

## Reading the results

Convert a measured win rate into a rating claim before believing it:

```
performance rating = opponent rating + 400 * log10(score / (1 - score))
```

60% is +70. 65% is +110. 75% is +191. If a bot labelled 1120 scores 65% against
players averaging 1120, its label is wrong by 110 points and should move.
