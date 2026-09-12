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
your rank among twenty friends and little else. Placement was three ranked
matches for a while (three, not five, so the threshold was reachable), and on
2026-09-12 it became **one match against the bot rated nearest 1400**, his
call: nobody in a small pool was finding three strangers, and a rating that
never arrives is worse than a rough one. The placement match is the one bot
game that touches a rating, and it can only do so once per player:

- The judge's 100-point scorecard gives a margin (your total minus the bot's).
  Starting rating = 1400 + 8 × margin, clamped to [-400, +300], so the band is
  1000 to 1700. Dead even is 1400; a loss by 50 lands at 1000 (Vivi's rung); a
  win by 38 or more lands at 1700, the Headliner line, which a bot game is not
  allowed to cross.
- Wins and losses are untouched, and `placed` flips to true in the same
  statement that writes the rating, guarded by `WHERE placed = false`. A
  second placement game cannot be started once placed, and cannot write even
  if it were.
- If we barely heard you (under 40 words), nothing is set and you are still
  unplaced. A silent mic is our outage, not your rating.
- After placement, K is 96 for your first five human games, 40 until twenty,
  then 24. The bot game is a rough fix; the fast K lets real opponents correct
  it within a week.

Neither argument above comes back: you cannot farm a game you cannot replay,
and a one-off measurement that human games immediately start overwriting is
not a source of rating, it is a starting point. Ranked is also standard pace
only now, one queue, so the placement rating and every game after it live on
one ladder.

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

Bot matches are **unrated** for the human ladder (chess.com does the same),
with the single exception of the placement match described above. That is the
conservative choice: it removes any incentive to farm the weakest rung. The
cost is that the anchor is informational rather than mechanical. If the human
pool ever needs pinning, the change is to make bot results rated with the
bot's K at zero.

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

## Reading the results

Convert a measured win rate into a rating claim before believing it:

```
performance rating = opponent rating + 400 * log10(score / (1 - score))
```

60% is +70. 65% is +110. 75% is +191. If a bot labelled 1120 scores 65% against
players averaging 1120, its label is wrong by 110 points and should move.
