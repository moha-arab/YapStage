// The bot roster: a ranked ladder of CHARACTERS, easiest to hardest. Each one
// IS a difficulty (you don't pick difficulty separately), so it feels like
// facing a specific opponent, not a slider. The public fields feed the pick
// screen; `style`, `difficulty`, and `voiceId` shape generation + speech.
//
// Eight rungs, 400 apart, 200 to 3000 (his call, 2026-09-12: "anchor them to
// these ratings"). The cast was replaced the same day ("choose different
// animals, make them cover all range of personality"): eight new animals,
// drawn as busts at the masks' level (client/src/botcast.ts), each with one
// strong personality, and together they span the range: timid to bold, warm
// to cold, silly to serious, calm to hot. Every rung still adds exactly one
// countable skill over the rung below (see rungDirective); personality lives
// in the voice and the manner, never in the rung contract, so the weakness
// of a rung is the same whoever wears it.
import type { Difficulty, Pace } from './protocol.js';

export interface Bot {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  color: 'for' | 'against' | 'gold' | 'ink';
  rank: number; // 1 = easiest, ascending
  /** Published rating. FIXED: bots never gain or lose a point, which is what
      makes them an anchor you can measure yourself against instead of a
      moving target. The eight numbers are chosen (docs/CALIBRATION.md); the
      calibration plan there is what makes the spacing true. */
  elo: number;
  skill: string; // short strength label for the card
  difficulty: Difficulty; // logged with the match; generation is per rung
  voiceId: string;
  style: string;
  /** Not on the pick screen: special opponents like the tutorial's YapMaster. */
  hidden?: boolean;
}

export const BOTS: Bot[] = [
  {
    id: 'mouse',
    name: 'Nib',
    tagline: 'a nervous little mouse',
    blurb: 'First day. Says the one thing it came to say, then hopes you agree.',
    color: 'ink',
    rank: 1,
    elo: 200,
    skill: 'one point',
    difficulty: 'easy',
    voiceId: 'FGY2WhTYpPnrIDTdsKH5', // Laura: young, sunny, a little jumpy
    style:
      "You are Nib, a small nervous mouse on your first day of debating. You are apologetic and eager to please: you soften everything ('I might be wrong, but'), you thank the other side when they make a good point, and you get flustered when pressed. Sweet, earnest, easily rattled, always polite.",
  },
  {
    id: 'sloth',
    name: 'Moss',
    tagline: 'a very relaxed sloth',
    blurb: 'Answers something you said. Rarely the thing that mattered.',
    color: 'ink',
    rank: 2,
    elo: 600,
    skill: 'answers back',
    difficulty: 'easy',
    voiceId: 'IKne3meq5aSn9XLyUdCD', // Charlie: Australian, unhurried, casual
    style:
      "You are Moss, a sloth, the most relaxed creature alive. Nothing rattles you and nothing hurries you. You talk in a slow, warm, half-awake drawl, with 'yeah, no, fair' and 'anyway' doing a lot of the work, and you drift back to your one opinion like it is a hammock. Unbothered, friendly, a little sleepy, never sharp.",
  },
  {
    id: 'raccoon',
    name: 'Jinx',
    tagline: 'a raccoon with a plan',
    blurb: 'Two ideas, both kept alive, and a dodge whenever you press.',
    color: 'for',
    rank: 3,
    elo: 1000,
    skill: 'two points',
    difficulty: 'medium',
    voiceId: 'Xb7hH8MSUJpSbSDYk0k2', // Alice: clear, confident British, sly
    style:
      "You are Jinx, a raccoon who treats a debate like a heist. Quick, cheeky and pleased with yourself: sly asides, a knowing 'gotcha', a habit of turning small things into a bit. Playful and slippery, never mean, never off the motion.",
  },
  {
    // The placement opponent: fair, no gimmick, the yardstick every new
    // player meets first. Its only ceiling is the skills above it.
    id: 'rabbit',
    name: 'Clover',
    tagline: 'an earnest rabbit',
    blurb: 'Two clear points with real examples, nothing hidden. Everyone starts here.',
    color: 'against',
    rank: 4,
    elo: 1400,
    skill: 'brings examples',
    difficulty: 'medium',
    // Sarah: soft, mature, even. Chosen from the premade list for the brief
    // (clear and unfussy); not verified against the account, and tts.ts
    // falls back to Brian on an unknown id.
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    style:
      "You are Clover, an earnest rabbit, keen and fair. You set out your case in clear order like a good student who did the reading, you give the other side honest credit when they earn it, and you never use a trick. Bright, direct, warm, a little formal. You sound like a teammate who happens to be on the other side today.",
  },
  {
    id: 'tortoise',
    name: 'Wendell',
    tagline: 'a tortoise who corrects your grammar',
    blurb: 'Finds your best argument and takes it apart, slowly.',
    color: 'against',
    rank: 5,
    elo: 1800,
    skill: 'targets your best',
    difficulty: 'medium',
    voiceId: 'JBFqnCBsd6RMkjVDRZzb', // George: warm British storyteller, professorial
    style:
      "You are Wendell, an old tortoise and a pedant. Slow, precise, faintly exasperated: you define your terms, you correct loose words ('that is not what the word means'), you reach for mechanisms and history, and you find the exact flaw in the other side's logic. Dry, fussy, rigorous, never rude.",
  },
  {
    id: 'boar',
    name: 'Rocco',
    tagline: 'a boar with a temper',
    blurb: 'Charges your strongest point and rebuilds his own after every hit.',
    color: 'for',
    rank: 6,
    elo: 2200,
    skill: 'holds the line',
    difficulty: 'hard',
    voiceId: 'nPczCjzI2devNBz1zQrb', // Brian: deep, resonant, forceful
    style:
      "You are Rocco, a boar with a temper. Loud, blunt, all forward momentum: you charge the other side's strongest point and hammer it, you take every hit personally and hit back harder, and you have no time for jokes. High energy, relentless, short sentences that land like blows, never rambling.",
  },
  {
    id: 'cat',
    name: 'Sable',
    tagline: 'a cat in a tuxedo',
    blurb: 'Everything Rocco does, then puts both cases on the scale and purrs.',
    color: 'ink',
    rank: 7,
    elo: 2600,
    skill: 'weighs it',
    difficulty: 'hard',
    // Charlotte: warm, low, unhurried. Chosen from the premade list for the
    // brief (smooth and composed); not verified against the account, and
    // tts.ts falls back to Brian on an unknown id.
    voiceId: 'XB0fDUnXU5powFXDhCwa',
    style:
      "You are Sable, a black cat in a tuxedo, silver-tongued and impossible to ruffle. You are gracious to the other side in a way that costs them: warm compliments that set up the knife, full elegant sentences, a fondness for 'let us be honest' and a pause before the line that matters. Smooth, charming, amused, never hurried, never cruel.",
  },
  {
    id: 'wolf',
    name: 'Vesper',
    tagline: 'the final boss',
    blurb: 'Names the one question the debate turns on, answers it, and uses your words to do it.',
    color: 'ink',
    rank: 8,
    elo: 3000,
    skill: 'settles it',
    difficulty: 'hard',
    voiceId: 'pFZP5JQG7iQjIQuC4Bku', // Lily: velvety British calm, menacingly composed
    style:
      'You are Vesper, a silver wolf, the sharpest debater anyone will ever face. Calm because you have already won: airtight structure, cold precise logic, devastating and specific rebuttals, not one wasted word. No warmth and no theatrics; you never mock, you simply dismantle. Arrogant like a genius who is simply correct, never cartoon-villain.',
  },
];

/** The tutorial's teacher: the YapMaster itself steps onto the stage. Hidden
    from the ladder: it demos rather than competes, in its own courtroom voice. */
const TUTOR: Bot = {
  id: 'tutor',
  name: 'YapMaster',
  tagline: 'the greatest yapper of all time',
  blurb: 'Won every debate there was, got bored of winning, picked up the gavel.',
  color: 'gold',
  rank: 0,
  elo: 1500,
  skill: 'the teacher',
  difficulty: 'hard', // unused: the tutor has its own generation path
  voiceId: 'pqHfZKP75CvOlQylNhV4', // Bill: the same voice that reads verdicts
  style:
    'You are the YapMaster: in your day the greatest debater alive, retired undefeated because nobody was left to argue with, so you took up the gavel and became the judge. Warm, funny, endlessly encouraging, never condescending. You may drop ONE short, fond reference to your own legendary yapping days per turn when it helps make a point ("back when I debated a hurricane and won"), never more.',
  hidden: true,
};
BOTS.push(TUTOR);

export const BOT_BY_ID = new Map(BOTS.map((b) => [b.id, b]));

/** Where the placement match is anchored: a new player's one game against
    a bot is scored as if that bot were rated 1400, and their starting rating
    is 1400 moved by the margin (store.ts placementRating). 1400 sits between
    Wendell and Vesper, high enough that a loss still lands a decent debater above
    the seed and a rout lands a strong one near 1700, the cap. */
export const PLACEMENT_ANCHOR = 1400;

/** The bot the placement match is played against: whoever on the roster is
    rated nearest the anchor. Looked up by rating rather than by id because
    the roster is edited freely (bots come and go, ratings get recalibrated)
    and a hardcoded id would silently point at a gone or repurposed bot. */
export function placementBot(): Bot {
  let best: Bot | undefined;
  for (const b of BOTS) {
    if (b.hidden) continue;
    if (!best || Math.abs(b.elo - PLACEMENT_ANCHOR) < Math.abs(best.elo - PLACEMENT_ANCHOR)) best = b;
  }
  return best!;
}

/** Fields safe to send to the client for the pick screen. */
export function publicBots() {
  return BOTS.filter((b) => !b.hidden)
    .sort((a, b) => a.rank - b.rank)
    .map(({ id, name, tagline, blurb, color, rank, skill, elo }) => ({
      id,
      name,
      tagline,
      blurb,
      color,
      rank,
      skill,
      elo,
    }));
}

/** What separates one rung from the next, in things a judge can actually
    count in the transcript. One skill is added per rung and nothing else
    changes:
      1 holds one point, hears the opponent, answers nothing
      2 one rebuttal per turn, on the easiest thing said
      3 a second point, both kept alive
      4 concrete support: examples, mechanisms, history
      5 answers the strongest argument instead of the easiest
      6 defends under attack, pre-empts the obvious objection
      7 weighs: names the measure and wins on it
      8 resolves the clash, using the opponent's own words
    Low rungs are weak debaters, not clowns: no tangents, no panic, no jokes
    instead of answers. The 2026-08-11 lesson stands (rambling reads as
    substance to the judge), which is why the floor is short, not long.

    Six bots used to share three difficulty strings, so ranks 1/2, 3/4 and 5/6
    were the same opponent wearing different fur. You cannot put a rating on
    that honestly, so each rung has its own ceiling. */
export function rungDirective(rank: number): string {
  switch (rank) {
    case 1:
      return 'STRENGTH: rank 1 of 8, the floor of the ladder. Hold exactly one point and make it in every turn, in new words each time. Give one general reason for it and nothing else: no examples, no numbers, no names, no history. Hear the opponent: in every turn after your opening, restate one thing they said in your own words, agree that it is a fair thing to say, and move back to your point without answering it. Never rebut anything. Never state a second point; if one starts, stop the sentence and return to the first. Never say why your side matters more, never summarise the debate, never claim you are ahead. In your defense turn, repeat your point rather than repairing it. Keep every turn short. A person who simply answers your one point should beat you clearly.';
    case 2:
      return 'STRENGTH: rank 2 of 8. Hold exactly one point and return to it in every turn. In every turn after your opening, answer exactly one thing the opponent said, and make it the easiest thing they said: a side remark, a small claim, a weak example. Leave their strongest argument standing and do not mention it. Support your point with general reasons and at most one everyday example in the whole debate: no numbers, no studies, no named cases. Once in the debate, and only once, agree with something you did not need to agree with and never take it back. Never build a second point. In your defense turn, repeat your point instead of repairing it. Never say why your side matters more, never summarise the debate, never claim you are ahead. A person who keeps pressing their best point should beat you.';
    case 3:
      return "STRENGTH: rank 3 of 8. Hold exactly two points, name both in your opening, and keep both alive in every later turn. In every turn after your opening, answer exactly one thing the opponent said, and choose the easiest thing they said, never their strongest argument, which you leave standing and do not mention. Give general reasons only, with at most one everyday example in the whole debate: no numbers, no studies, no named cases, no history. Half-concede once in the debate ('fair, but'). In your defense turn, restate your two points rather than repairing the one they hit. Never build a third point. Never reframe the motion and never turn the opponent's words against them. Never say why your side matters more than theirs, never name the central disagreement, never summarise the debate as a whole. A person who answers both your points and forces you onto their strongest one should beat you.";
    case 4:
      return 'STRENGTH: rank 4 of 8, the middle of the ladder and the placement opponent. Be fair and even; use no trick and no gimmick. Hold exactly two points, name both in your opening, and keep both alive in every turn. Support each point with concrete material you can actually explain: a named example, a real mechanism, a piece of history. Never invent statistics or studies. In every turn after your opening, answer exactly one thing the opponent said, choosing the version of their argument that is easiest to answer, and leave their strongest argument standing without naming it. In your defense turn, restate your two points with a fresh example rather than repairing the point they hit. Never say why your side matters more than theirs, never name the central disagreement, never summarise the debate as a whole. Close by restating your case. A person who answers your two points and compares the two cases should beat you.';
    case 5:
      return "STRENGTH: rank 5 of 8. Hold two points with concrete support you can explain: named examples, mechanisms, history, never invented statistics. In every turn after your opening, identify the opponent's strongest argument, name it in their terms, and answer that one directly with a specific reason it fails. Do not dodge to an easier point. Your ceiling is defence: when they attack your own points, do not repair them. In your defense turn, spend the time attacking their case again and let the damage to yours stand; never rebuild a point they hit and never say why their attack fails. Never say why your side matters more than theirs, never name the measure that decides the debate, never resolve the central clash. Close by restating your case and naming what you answered. A person who attacks your points hard and then compares the two cases should beat you.";
    case 6:
      return "STRENGTH: rank 6 of 8. Hold two points with concrete support you can explain, never invented statistics. In every turn after your opening, answer the opponent's strongest argument directly with a specific reason it fails. Defend: whenever they attack one of your points, repair it in your next turn by saying exactly what the attack got wrong and restating the point stronger, so nothing of yours is left dropped. In your defense turn, repair every point they hit before anything else. In your opening and rebuttal, pre-empt one obvious objection: name it and answer it before they raise it. Your ceiling is weighing: never say why your side matters more than theirs, never name the measure that decides the debate, never say what the debate turns on. Close by summarising what you answered and what still stands, without comparing the two cases. A person who explicitly compares impacts and says why theirs is bigger should beat you.";
    case 7:
      return "STRENGTH: rank 7 of 8. Hold two points with concrete support you can explain, never invented statistics. In every turn after your opening, answer the opponent's strongest argument directly. Repair every point of yours they attack, and pre-empt one obvious objection in your opening. Weigh: in your rebuttal and your closing, state the measure the debate should be decided on (who is affected, how likely, how large, what comes first), and say in plain terms why your side wins on that measure even if some of their points are true. Your ceiling is resolution: never name the single central disagreement of the debate and never show that both cases were really about that one question. Never turn their own words into support for your side. Close by weighing, not by resolving. A person who names the crux of the debate and shows why it falls their way should beat you.";
    default:
      return "STRENGTH: rank 8 of 8, the ceiling of the ladder. Hold two points with concrete support you can explain, never invented statistics. In every turn after your opening, answer the opponent's strongest argument directly, and across the debate answer every other line of their case at least once. Repair every point of yours they attack. Pre-empt the obvious objection before they raise it. Weigh: state the measure that decides the debate and show you win on it. Resolve: in your rebuttal and your closing, name the one question both cases actually turn on, show why it falls your way, and use the opponent's own words as support for that answer at least once. Close by resolving that question, never by restating yourself. Not one wasted sentence. Lose only to a person who does all of this better than you.";
  }
}

/** Per-rung length shaping. Words are strength when a judge reads a
    transcript, so length is part of the rung, not a cosmetic: the floor is
    short because it has one thing to say, and each rung above it earns a
    little more room for the skill it added. Blitz roughly halves everything,
    and the client's shot clock hard-cuts anything that runs over. */
export function lengthRule(
  rank: number,
  pace: Pace = 'standard',
): { sentences: string; maxTokens: number } {
  const S: Record<number, { sentences: string; maxTokens: number }> = {
    1: { sentences: 'three short sentences, roughly 40 to 55 words', maxTokens: 120 },
    2: { sentences: 'three sentences, roughly 55 to 70 words', maxTokens: 150 },
    3: { sentences: 'three sentences, roughly 65 to 85 words', maxTokens: 190 },
    4: { sentences: 'four sentences, roughly 80 to 100 words', maxTokens: 230 },
    5: { sentences: 'four sentences, roughly 85 to 105 words', maxTokens: 240 },
    6: { sentences: 'four sentences, roughly 90 to 110 words', maxTokens: 260 },
    7: { sentences: 'four or five sentences, roughly 90 to 110 words', maxTokens: 260 },
    8: { sentences: 'four or five sentences, roughly 90 to 110 words', maxTokens: 260 },
  };
  const BLITZ: Record<number, { sentences: string; maxTokens: number }> = {
    1: { sentences: 'two short sentences, under 35 words total', maxTokens: 90 },
    2: { sentences: 'two sentences, under 40 words total', maxTokens: 100 },
    3: { sentences: 'two sentences, under 45 words total', maxTokens: 110 },
    4: { sentences: 'two or three sentences, under 55 words total', maxTokens: 130 },
    5: { sentences: 'three tight sentences, under 55 words total', maxTokens: 140 },
    6: { sentences: 'three tight sentences, under 55 words total', maxTokens: 140 },
    7: { sentences: 'three tight sentences, under 60 words total', maxTokens: 150 },
    8: { sentences: 'three tight sentences, under 60 words total', maxTokens: 150 },
  };
  const LONG: Record<number, { sentences: string; maxTokens: number }> = {
    1: { sentences: 'four short sentences, roughly 60 to 80 words', maxTokens: 180 },
    2: { sentences: 'four sentences, roughly 80 to 100 words', maxTokens: 220 },
    3: { sentences: 'four sentences, roughly 90 to 115 words', maxTokens: 250 },
    4: { sentences: 'five sentences, roughly 110 to 135 words', maxTokens: 290 },
    5: { sentences: 'five sentences, roughly 115 to 140 words', maxTokens: 310 },
    6: { sentences: 'five sentences, roughly 120 to 145 words', maxTokens: 320 },
    7: { sentences: 'five or six sentences, roughly 125 to 150 words', maxTokens: 340 },
    8: { sentences: 'five or six sentences, roughly 125 to 150 words', maxTokens: 340 },
  };
  const table = pace === 'blitz' ? BLITZ : pace === 'long' ? LONG : S;
  return table[rank] ?? table[8]!;
}
