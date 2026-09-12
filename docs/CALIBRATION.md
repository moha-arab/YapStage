# Bot ratings: what the numbers mean and how they get set

Every bot on the ladder shows a rating. Chess.com shows bot ratings too and
never published how they were set, which is exactly why their own blog had to
admit that a bot labelled 2000 plays around 1800. This file exists so that never
becomes true here without someone noticing.

## The grid

Eight bots, 400 apart, 200 to 3000. Bot ratings are **fixed** and never move.

| rank | bot | rating | the one skill this rung adds |
| --- | --- | --- | --- |
| 1 | Pip, duckling | 200 | the floor: holds one point, hears the opponent, answers nothing |
| 2 | Cappy, capybara | 600 | one rebuttal per turn, aimed at the easiest thing said |
| 3 | Vivi, fox | 1000 | a second point, both kept alive all debate |
| 4 | Nora, border collie | 1400 | concrete support: named examples, mechanisms, history |
| 5 | Ozzy, owl | 1800 | answers the opponent's strongest argument instead of the easiest |
| 6 | Brutus, bull | 2200 | defends under attack: repairs every hit point, pre-empts the obvious objection |
| 7 | Vera, elephant | 2600 | weighs: names the measure and says why her side wins on it |
| 8 | Gigi, giraffe | 3000 | resolves the clash: names the one question, settles it, uses your own words |

Nora is the placement opponent: fair, no gimmick, her only ceiling is the
skills above her. Gigi is the final boss and has every skill on the list.

**These numbers are designed, not measured.** The order comes from the rung
contracts in `server/src/bots.ts` (`rungDirective`): each rung adds exactly one
skill a judge can count in the transcript, and personality is voice only, so
the weakness always lives in the contract and never in the character. The
spacing is a claim the calibration plan below has to make true. Until it has
run, treat every gap as a statement of intent with an error bar of the whole
gap.

The six animals that survived the 2026-09-12 re-rating (Pip, Cappy, Vivi,
Ozzy, Brutus, Gigi) kept their names, art and voices but were given new rung
contracts, so the 2026-08-11 measurements below no longer describe them.

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

## Tiers

Every tier boundary above Iron is a bot you can go and fight
(`server/src/protocol.ts` TIERS): Bronze 200 (Pip), Silver 600 (Cappy), Gold
1000 (Vivi), Platinum 1400 (Nora), Diamond 1800 (Ozzy), Master 2200 (Brutus),
Headliner 2600 (Vera). A tier means you are at or above that bot's rating, which
is a 50 percent claim against it. Gigi at 3000 sits above every tier on purpose.

## Where humans start

Humans currently seed at 700 (`SEED_RATING`, `server/src/store.ts`). That
number was chosen against the old grid (a 57 percent favourite over Pip at 650)
and is stale against this one: 700 sits above Pip and Cappy, handing a new
account the claim it beats two rungs. The replacement is a placement debate
against Nora at 1400 that seeds from the outcome and the margin (a loss by
more than 20 seeds at 900, a loss by 20 or less at 1150, a win by 20 or less at
1450, a win by more than 20 at 1700). The four bands are guesses to be checked
against the first hundred placements: the median new player should land in
Silver, and the bands get widened or narrowed until they do. Until the
placement debate ships, the 700 seed stands and this paragraph is the honest
note that it does not fit the grid.

## Bot matches are UNRATED

Ranked means humans, the same rule chess.com runs. This was briefly reversed
(bot matches rated against the fixed bot ratings) to solve the cold-start
problem in a twenty-person pool, and reverted 2026-08-12. Two reasons, and both
outrank the cold-start argument:

1. **A bot is a fixed strategy.** Ozzy never repairs a point you hit. Once you
   learn that, you beat Ozzy forever with the same move, and a rating would
   climb while your debating did not. Elo assumes an opponent whose strength is
   stable across all players; a prompt is not that.
2. **A bot match has no witness.** Rating movement against one is the cheapest
   possible farm for anyone with a chatbot open in the next tab. Unobserved
   rating movement is the last place it belongs, and this app has an anti-cheat
   file precisely because of that.

So the bot ratings on this page are a scale you can compare yourself to. They
are not something you can win or lose. The one exception is placement: a new
player's first number comes from one debate against Nora, which attaches the
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
10). The placement debate against Nora attaches the human scale to the bot
scale.

**Prerequisite.** A bot-versus-bot harness: `scripts/bot-ladder.mjs`, or a
FAST-only route that runs `generateBotArgument` for both seats and then the
judge, with `DEBATE_SPEED=fast` and `ELEVENLABS_API_KEY` empty. The current
`bot-beatability.mjs` pits a bot against a scripted human and cannot do this.
Rotate over ten motions from the deck, not one, and alternate which bot argues
FOR. A debate is about 8 generations and one judge call, roughly 10 cents.

| phase | what | debates | pass |
| --- | --- | --- | --- |
| A. Order, adjacent pairs | Pip v Cappy, Cappy v Vivi, Vivi v Nora, Nora v Ozzy, Ozzy v Brutus, Brutus v Vera, Vera v Gigi; 20 each, 10 with the higher bot FOR | 140 | the higher bot wins at least 15 of 20 in every pair |
| B. Spacing, two rungs apart | Pip v Vivi, Cappy v Nora, Vivi v Ozzy, Nora v Brutus, Ozzy v Vera, Brutus v Gigi; 10 each | 60 | the higher bot wins at least 9 of 10 in every pair, and its mean margin is larger than in the adjacent pair below it |
| C. Placement fairness and endpoints | Nora v Nora, 20, sides alternated; Pip v Gigi, 4 | 24 | Nora v Nora splits between 7 and 13 of 20 for FOR (outside that band the judge or the format has a side bias that would poison every placement, and that gets fixed before anything else); Pip v Gigi goes 4 to 0 |
| D. Human scale, scripted profiles | both profiles in `bot-beatability.mjs` against all eight bots, 3 runs each | 48 | average beats Pip 3 of 3 and Cappy at least 2 of 3, splits with Vivi, loses to Nora and above; strong beats through Nora, splits with Ozzy, loses to Brutus and above |

Total about 272 debates, about 27 dollars. After any prompt change, rerun
phase A at 10 per pair (70 debates, 7 dollars).

**A confirming result** has no inversion anywhere; every adjacent pair between
14 and 19 wins of 20 for the higher bot (an implied gap of about 190 to 510 by
`gap = 400 x log10(w / (20 - w))`, target 18 of 20, which is 382); margins that
grow with the gap; and the human profiles crossing the ladder where the scale
says they should, average near Vivi and strong near Ozzy.

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

## What was measured before (the old six-rung ladder, 2026-08-11)

Kept for the lessons, not the numbers. The old rungs were 650 to 1500, the
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

## Re-run the calibration whenever the judge prompt changes

The ratings are measured against a specific judge. Changing the rubric changes
what "strong" means, so a prompt edit invalidates the numbers.

```bash
PORT=3010 DEBATE_SPEED=fast ELEVENLABS_API_KEY= node server/dist/index.js
URL=http://localhost:3010 RUNS=3 BOTS=duckling,capybara,fox,collie,owl,bull,elephant,giraffe node scripts/bot-beatability.mjs
```

Judge fairness has its own harness and should be run alongside it. It checks
that the judge picks the side built to argue better, that a well-argued
unpopular position still wins, and that the call agrees with an independent
blind reader:

```bash
URL=http://localhost:3010 CASES=scripts/judge-cases.json node scripts/judge-eval.mjs
```

## Reading the results

Convert a measured win rate into a rating claim before believing it:

```
performance rating = opponent rating + 400 * log10(score / (1 - score))
```

60% is +70. 65% is +110. 75% is +191. If a bot labelled 1400 scores 65% against
players averaging 1400, its label is wrong by 110 points. On this ladder the
number stays where it is and the rung's directive moves until the label is true
again.
