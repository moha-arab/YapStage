# Bot ratings: what the numbers mean and how they get set

Every bot on the ladder shows a rating. Chess.com shows bot ratings too and
never published how they were set, which is exactly why their own blog had to
admit that a bot labelled 2000 plays around 1800. This file exists so that never
becomes true here without someone noticing.

## The grid

Eight bots, 400 apart, 200 to 3000. Bot ratings are **fixed** and never move.

| rank | bot | rating | the one skill this rung adds |
| --- | --- | --- | --- |
| 1 | Nib, mouse | 200 | the floor: holds one point, hears the opponent, answers nothing |
| 2 | Moss, sloth | 600 | one rebuttal per turn, aimed at the easiest thing said |
| 3 | Dodger, raccoon | 1000 | a second point, both kept alive all debate |
| 4 | Clover, rabbit | 1400 | concrete support: named examples, mechanisms, history |
| 5 | Prudence, tortoise | 1800 | answers the opponent's strongest argument instead of the easiest |
| 6 | Rocco, boar | 2200 | defends under attack: repairs every hit point, pre-empts the obvious objection |
| 7 | Sterling, cat | 2600 | weighs: names the measure and says why his side wins on it |
| 8 | Vesper, wolf | 3000 | resolves the clash: names the one question, settles it, uses your own words |

Clover is the placement opponent: fair, no gimmick, her only ceiling is the
skills above her. Vesper is the final boss and has every skill on the list.

**These numbers are designed, not measured.** The order comes from the rung
contracts in `server/src/bots.ts` (`rungDirective`): each rung adds exactly one
skill a judge can count in the transcript, and personality is voice only, so
the weakness always lives in the contract and never in the character. The
spacing is a claim the calibration plan below has to make true. Until it has
run, treat every gap as a statement of intent with an error bar of the whole
gap.

The six animals that survived the 2026-09-12 re-rating (Nib, Moss, Jinx,
Wendell, Rocco, Vesper) kept their names, art and voices but were given new rung
contracts, so the 2026-08-11 measurements below no longer describe them.

Later on 2026-09-12 the tortoise became a woman, renamed Prudence (Wendell in
every table below) and voiced by Alice, and Sable went back to being a man,
voiced by George. Then the raccoon Jinx became Dodger and the cat Sable
became Sterling, names that read as the men they are (the tables below keep
the old names). Names, art and voices only: no rung contract changed.

### Why 200 to 3000

An earlier version of this file argued for a 650 to 1500 span on the grounds
that 900 points already made the top rung beat the bottom rung 99 percent of
the time and a wider ladder would be theatre. That was overruled on 2026-09-12
("anchor them to these ratings"): a ladder is also a map of what there is to
learn, and eight rungs with one named skill each need eight numbers a player
can recognise from any game with ranks. The Elo arithmetic has not changed,
which is why the plan below insists on measuring the spacing rather than
assuming it.

### What a gap means

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
| 800 | 99% |

So adjacent rungs should measure as about 9 in 10 for the higher bot and two
rungs apart as about 99 in 100. If they do not, the directives move, never the
numbers (see "when it fails").

## No tiers

The ladder used to name eight metals (Iron to Headliner) with a bot at every
boundary. He cut them on 2026-09-12 ("remove the ranks, only numbers"): a
rating is the whole rank now, and the eight bots are the only fixed numbers
on it. "I am above Clover" is what a tier used to say, and it still says it.

## Where humans start

Nobody seeds any more. A new player's first number comes from one placement
debate against the roster bot rated nearest 1400 (Clover), his call on
2026-09-12: in a small pool nobody was finding three strangers for placement
matches, and a rating that never arrives is worse than a rough one. The rule,
as implemented in `server/src/judge.ts` and `store.placePlayer`:

- The judge's 100-point scorecard gives a margin (your total minus the
  bot's). Starting rating = 1400 + 8 x margin, clamped to [-400, +300], never
  below the floor of 500. Dead even is 1400; a loss by 50 lands at 1000
  (Dodger's rung); a win by 38 or more lands at 1700, the most a bot game may
  hand out.
- Wins and losses are untouched, and `placed` flips to true in the same
  statement that writes the rating, guarded by `WHERE placed = false`, so it
  can only ever happen once. If we barely heard you (under 40 words), nothing
  is set and you are still unplaced: a silent mic is our outage, not your
  rating.
- After placement, K is 96 for your first five human games, 40 until twenty,
  then 24. The bot game is a rough fix; the fast K lets real opponents correct
  it within a week.
- Players who already had three or more rated games when this shipped were
  marked placed and kept their rating. `SEED_RATING` (700) still backs the
  column default and only matters if the store is down during a placement.

The first hundred placements should be read against this: the median new
player should land around Silver, and the multiplier or the clamp moves if
they do not.

## Bot matches are UNRATED

Ranked means humans, the same rule chess.com runs. This was briefly reversed
(bot matches rated against the fixed bot ratings) to solve the cold-start
problem in a twenty-person pool, and reverted 2026-08-12. Two reasons, and both
outrank the cold-start argument:

1. **A bot is a fixed strategy.** Wendell never repairs a point you hit. Once you
   learn that, you beat Wendell forever with the same move, and a rating would
   climb while your debating did not. Elo assumes an opponent whose strength is
   stable across all players; a prompt is not that.
2. **A bot match has no witness.** Rating movement against one is the cheapest
   possible farm for anyone with a chatbot open in the next tab. Unobserved
   rating movement is the last place it belongs, and this app has an anti-cheat
   file precisely because of that.

So the bot ratings on this page are a scale you can compare yourself to. They
are not something you can win or lose. The one exception is placement: a new
player's first number comes from one debate against Clover, which attaches the
human scale to the bot scale, and after that the bots never move a rating
again.

## Why the bots never gain or lose rating

They are the anchor. In a small app, a human-only rating pool is closed and
zero-sum: the numbers encode who is above whom and nothing more, so "you are
1200" is a claim about thirty strangers rather than about debating. Bots with
fixed ratings break that on purpose. Beating a locked 1400 bot means the same
thing this year and next.

## The calibration plan

Three things pin the numbers. The design fixes the order (one skill per rung).
Bot-versus-bot debates fix the spacing (400 apart must measure as about 9 in
10). The placement debate against Clover attaches the human scale to the bot
scale.

**Prerequisite.** A bot-versus-bot harness: `scripts/bot-ladder.mjs`, or a
FAST-only route that runs `generateBotArgument` for both seats and then the
judge, with `DEBATE_SPEED=fast` and `ELEVENLABS_API_KEY` empty. The current
`bot-beatability.mjs` pits a bot against a scripted human and cannot do this.
Rotate over ten motions from the deck, not one, and alternate which bot argues
FOR. A debate is about 8 generations and one judge call, roughly 10 cents.

| phase | what | debates | pass |
| --- | --- | --- | --- |
| A. Order, adjacent pairs | Nib v Moss, Moss v Jinx, Jinx v Clover, Clover v Wendell, Wendell v Rocco, Rocco v Sable, Sable v Vesper; 20 each, 10 with the higher bot FOR | 140 | the higher bot wins at least 15 of 20 in every pair |
| B. Spacing, two rungs apart | Nib v Jinx, Moss v Clover, Jinx v Wendell, Clover v Rocco, Wendell v Sable, Rocco v Vesper; 10 each | 60 | the higher bot wins at least 9 of 10 in every pair, and its mean margin is larger than in the adjacent pair below it |
| C. Placement fairness and endpoints | Clover v Clover, 20, sides alternated; Nib v Vesper, 4 | 24 | Clover v Clover splits between 7 and 13 of 20 for FOR (outside that band the judge or the format has a side bias that would poison every placement, and that gets fixed before anything else); Nib v Vesper goes 4 to 0 |
| D. Human scale, scripted profiles | both profiles in `bot-beatability.mjs` against all eight bots, 3 runs each | 48 | average beats Nib 3 of 3 and Moss at least 2 of 3, splits with Jinx, loses to Clover and above; strong beats through Clover, splits with Wendell, loses to Rocco and above |

Total about 272 debates, about 27 dollars. After any prompt change, rerun
phase A at 10 per pair (70 debates, 7 dollars).

**A confirming result** has no inversion anywhere; every adjacent pair between
14 and 19 wins of 20 for the higher bot (an implied gap of about 190 to 510 by
`gap = 400 x log10(w / (20 - w))`, target 18 of 20, which is 382); margins that
grow with the gap; and the human profiles crossing the ladder where the scale
says they should, average near Jinx and strong near Wendell.

**When it fails:**

- a pair at 20 of 20 is a wall: the added skill is worth more than 400 to the
  judge, so soften the upper rung's directive or move that skill one rung down;
  do not move the number
- a pair at 13 of 20 or worse means the skill is not landing: tighten that
  rung's directive so a compliance reader can count the skill in the
  transcript; do not move the number
- if a lower bot ever wins on argument or delivery through sheer length,
  shorten it first: the 2026-08-11 run showed rambling reads as substance to
  the judge
- the numbers are chosen, the spacing is measured: the only edits are to the
  directives and the length rules, never to the eight ratings

**Error bar.** 20 debates confirms order, not exact spacing: the 95 percent band
on a true 91 percent rate is roughly 70 to 99. Pinning a gap to plus or minus
100 needs about 50 debates per pair, which is 35 dollars for the seven adjacent
pairs and is the second pass once the first is clean.

## What was measured on 2026-09-12 (the eight-rung ladder)

Phase D only, at 2 runs per cell instead of 3, with the new cast and the
tightened judge. Phases A to C still need the bot-versus-bot harness.

| rung | bot | rating | average profile | strong profile |
| --- | --- | --- | --- | --- |
| 1 | Nib | 200 | 2/2, +61 | 2/2, +60 |
| 2 | Moss | 600 | 2/2, +36 | 2/2, +46 |
| 3 | Jinx | 1000 | 1/2, +8 | 2/2, +22 |
| 4 | Clover | 1400 | 0/2, −25 | 0/2, −12 |
| 5 | Wendell | 1800 | 0/2, −33 | 0/2, −24 |
| 6 | Rocco | 2200 | 0/2, −31 | 0/2, −17 |
| 7 | Sable | 2600 | 0/2, −24 | 0/2, −12 |
| 8 | Vesper | 3000 | 0/2, −38 | 0/2, −28 |

The order holds from rung 1 to rung 4. The average profile splits with Jinx,
as the scale says it should. The strong profile beats Jinx and loses to
Clover, a rung below the "near Wendell" the plan expects.

From rung 4 up both profiles lose every match and the margins stop ordering
the bots: Sable measured easier than Rocco and Wendell for both profiles.
Those gaps are inside the judge's run-to-run noise at two runs, and a scripted
human cannot separate the top of the ladder. That is what phases A and B are
for.

Against the same run the night before (old cast, judge not yet tightened),
the floor widened: Nib +61 where Pip was +37. That fits the tightened judge
scoring clear cases more decisively (mean margin on clear cases 48 to 56).

## What was measured before (the old six-rung ladder and the old cast, 2026-08-11)

Kept for the lessons, not the numbers. The names are the cast of the time
(Pip the duckling up to Gigi the giraffe, replaced 2026-09-12). The old rungs
were 650 to 1500, the
"average" profile in `bot-beatability.mjs`, 3 runs per rung:

| rung | bot | win rate | avg margin | old rating |
| --- | --- | --- | --- | --- |
| 1 | Pip | 3/3 | +30 | 650 |
| 2 | Cappy | 1/3 | −2 | 850 |
| 3 | Vivi | 0/3 | −11 | 1000 |
| 4 | Ozzy | 0/3 | −27 | 1200 |
| 5 | Brutus | 0/3 | −25 | 1350 |
| 6 | Gigi | 0/3 | −29 | 1500 |

Above rung 4 both scripted profiles lost every match, so the margin stopped
discriminating (a ceiling effect, not a measured ordering). Two ordering bugs
surfaced there and shaped the new contracts:

- **Rank 1 was scoring above rank 2.** Rambling at length reads as substance to
  a judge, while conceding does not. The new floor is short and answers
  nothing; nobody on the ladder rambles.
- **Rank 3 got stronger when it was given "hold two points and reframe".**
  Reframing is a genuine mid-tier skill. The new rung 3 holds two points and
  is forbidden to reframe; turning the opponent's words is reserved for the
  boss.

The general lesson: making a bot weaker is not about telling it to be worse. It
is about removing a specific, nameable skill and leaving everything else intact.

The scripted "average" profile is also a **lower bound on a human**, not a
median human: its four turns are written in advance, so it cannot actually
respond to what the bot just said, and clash is 30 of the 100 rubric points.
A real player of the same ability scores higher than the script does.

## Spot check on 2026-09-13 (the no-animal rule and the renames)

The bot prompt gained one sentence (a persona, not a species: never mention,
joke about or pun on being an animal) and the eight styles lost their
species; three bots were renamed in their prompts (Dodger, Prudence,
Sterling). Phase D at 1 run per cell, about 1.60 dollars. Not one animal
reference in the 16 transcripts, and every cell sits inside the 2026-09-12
numbers' noise (yesterday's figure in brackets):

| rung | bot | average profile | strong profile |
| --- | --- | --- | --- |
| 1 | Nib | +58 (+61) | +64 (+60) |
| 2 | Moss | +13 (+36) | +36 (+46) |
| 3 | Dodger | -8 (+8) | +22 (+22) |
| 4 | Clover | -25 (-25) | -15 (-12) |
| 5 | Prudence | -33 (-33) | -29 (-24) |
| 6 | Rocco | -30 (-31) | -20 (-17) |
| 7 | Sterling | -27 (-24) | -13 (-12) |
| 8 | Vesper | -32 (-38) | -25 (-28) |

## Re-run the calibration whenever the judge prompt changes

The ratings are measured against a specific judge. Changing the rubric changes
what "strong" means, so a prompt edit invalidates the numbers.

```bash
PORT=3010 DEBATE_SPEED=fast ELEVENLABS_API_KEY= node server/dist/index.js
URL=http://localhost:3010 RUNS=3 BOTS=mouse,sloth,raccoon,rabbit,tortoise,boar,cat,wolf node scripts/bot-beatability.mjs
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

60% is +70. 65% is +110. 75% is +191. If a bot labelled 1400 scores 65% against
players averaging 1400, its label is wrong by 110 points. On this ladder the
number stays where it is and the rung's directive moves until the label is true
again.

## 2026-09-13: bot turns now fit their clock (re-calibration pending)

A paid QA run on the live site measured the ElevenLabs voices at about 2.1
words a second: Vesper spoke 39.3 seconds in a 35 second defense and 42.9 in
a 25 second closing. The client cuts the audio at the clock, but the judge
read the whole generated text, so top bots were scored on words nobody heard.

`fitToClock()` (bots.ts) now trims every bot turn at a sentence end to what
its voice can say in the turn (8 percent plus one second of margin; standard
pace: 45 s = 84 words, 35 s = 65, 25 s = 46), and the transcript, caption and
voice all carry the trimmed text. The prompts did not change.

Consequence: `lengthRule()` sets one word target per rung and pace for EVERY
turn, so rungs 4 to 8 (80 to 110 words at standard) lose the end of their
closings (often the weighing sentence) and some of their defenses. Expect the
top rungs to measure weaker than their labels and to compress together. The
proper fix is a clock-aware lengthRule (targets per turn length, keeping the
rung differences as density rather than length), then phase D (about 1.60
dollars) and, if the order moves, phase A (about 7 dollars).

## 2026-09-14: clock-aware lengthRule, phase D

`lengthRule(rank, pace, seconds)` now caps each rung's word range at what the
voice can say in that turn (`clockWordBudget(seconds)` less four words for the
model's overshoot): standard pace asks for under 80 words in a 45 s turn, 61
in 35 s, 42 in 25 s. Rungs whose own range already fits keep it (Nib and Moss
openings). From rung 3 up, every rung gets the same length per turn, so the
rungs now differ only in what they do with the words (`rungDirective`). The
old closing and defense token trim is gone; `fitToClock` stays as a backstop.
Standard is the default pace again for friend rooms, ranked and placement.

Phase D at 1 run per cell (16 debates, about 1.60 dollars), margins from the
human's side, with the 2026-09-13 spot check in brackets:

| bot | average profile | strong profile |
| --- | --- | --- |
| Nib | +49 (+58) | +60 (+64) |
| Moss | +28 (+13) | +42 (+36) |
| Dodger | +7 (-8) | +10 (+22) |
| Clover | -25 (-25) | -14 (-15) |
| Prudence | -27 (-33) | -22 (-29) |
| Rocco | -20 (-30) | -6 (-20) |
| Sterling | -17 (-27) | -4 (-13) |
| Vesper | -24 (-32) | -21 (-25) |

The bottom of the ladder holds its targets: the average profile beats Nib and
Moss, splits with Dodger and loses from Clover up. The top compressed as
predicted: Rocco and Sterling measure 10 to 14 points easier than before and
the strong profile nearly splits with them, while Prudence and Vesper still
beat it clearly. At one run per cell those gaps sit inside the judge's
noise, and the top was already out of order on 2026-09-13 (Sterling easier
than Rocco and Prudence for both profiles). Ladder direction check: OK.

Next, if the top-rung labels matter before real data exists: phase A at 10
per pair across rungs 5 to 8 (about 7 dollars), and move `rungDirective` for
Rocco and Sterling rather than giving length back.
