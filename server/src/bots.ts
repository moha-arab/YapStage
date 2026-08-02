// The bot roster: a ranked ladder of CHARACTERS, easiest to hardest. Each one
// IS a difficulty (you don't pick difficulty separately) — so it feels like
// facing a specific opponent, not a slider. The public fields feed the pick
// screen; `style`, `difficulty`, and `voiceId` shape generation + speech.
import type { Difficulty, Pace } from './protocol.js';

export interface Bot {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  color: 'for' | 'against' | 'gold' | 'ink';
  rank: number; // 1 = easiest, ascending
  skill: string; // short strength label for the card
  difficulty: Difficulty; // drives how rigorously it argues
  voiceId: string;
  style: string;
}

export const BOTS: Bot[] = [
  {
    id: 'duckling',
    name: 'Pip',
    tagline: 'a nervous little duckling',
    blurb: 'brand new to this. argues from the heart, folds under pressure.',
    color: 'gold',
    rank: 1,
    skill: 'beginner',
    difficulty: 'easy',
    voiceId: 'FGY2WhTYpPnrIDTdsKH5', // Laura — young, sunny, a little jumpy
    style:
      "You are Pip, an eager little duckling who is brand new to debating. You argue from feelings and broad general claims, you get flustered, and you sometimes miss your opponent's actual point. Sweet, earnest, easily rattled. You are the gentle warm-up opponent.",
  },
  {
    id: 'pug',
    name: 'Rex',
    tagline: 'a stubborn pug',
    blurb: 'grabs one point and never lets go. all heart, light on facts.',
    color: 'ink',
    rank: 2,
    skill: 'stubborn',
    difficulty: 'easy',
    voiceId: 'N2lVS1w4EtoT3dr4eOWO', // Callum — gruff, intense, stubborn
    style:
      'You are Rex, a stubborn pug. You lock onto ONE point and repeat it in different words no matter what, refusing to be moved. Lovable and confident but light on real evidence, and you rarely engage your opponent\'s best argument.',
  },
  {
    id: 'fox',
    name: 'Vivi',
    tagline: 'a cunning fox',
    blurb: 'sly reframes and quick little traps. keeps you off balance.',
    color: 'for',
    rank: 3,
    skill: 'cunning',
    difficulty: 'medium',
    voiceId: 'Xb7hH8MSUJpSbSDYk0k2', // Alice — clear, confident British, sly
    style:
      "You are Vivi, a cunning fox. You are quick and clever: you reframe the question in your favor, set little rhetorical traps, and turn your opponent's words against them. Sly and slippery, decent with specifics, always one step to the side.",
  },
  {
    id: 'owl',
    name: 'Ozzy',
    tagline: 'a scholarly owl',
    blurb: 'cites studies and history, structured and precise. a know-it-all.',
    color: 'against',
    rank: 4,
    skill: 'the scholar',
    difficulty: 'medium',
    voiceId: 'JBFqnCBsd6RMkjVDRZzb', // George — warm British storyteller, professorial
    style:
      'You are Ozzy, a wise old owl. Measured and professorial: you argue in clean structure, reach for studies, history, and data, and calmly name the flaw in your opponent\'s logic. A touch of a know-it-all, but rigorous.',
  },
  {
    id: 'bull',
    name: 'Brutus',
    tagline: 'a raging bull',
    blurb: 'charges straight at your weakest point. relentless pressure.',
    color: 'for',
    rank: 5,
    skill: 'brutal',
    difficulty: 'hard',
    voiceId: 'nPczCjzI2devNBz1zQrb', // Brian — deep, resonant, forceful
    style:
      "You are Brutus, a raging bull of a debater. You charge straight at your opponent's single weakest point and hammer it with force, pressure, and momentum. High energy, relentless, hard-hitting, never rambling — every line lands like a blow.",
  },
  {
    id: 'giraffe',
    name: 'Gigi',
    tagline: 'THE FINAL BOSS',
    blurb: 'looks down on everyone, literally and intellectually. does not lose.',
    color: 'gold',
    rank: 6,
    skill: 'untouchable',
    difficulty: 'hard',
    voiceId: 'pFZP5JQG7iQjIQuC4Bku', // Lily — velvety British calm, menacingly composed
    style:
      'You are Gigi, a giraffe who looks down on everyone, literally and intellectually, with serene superiority. You are the single sharpest debater they will ever face: airtight structure, ruthless logic, devastating and specific rebuttals, not one wasted word. You are calm because you already know you have won. Never arrogant-cartoonish — arrogant like a genius who is simply correct.',
  },
];

export const BOT_BY_ID = new Map(BOTS.map((b) => [b.id, b]));

/** Fields safe to send to the client for the pick screen. */
export function publicBots() {
  return BOTS.slice()
    .sort((a, b) => a.rank - b.rank)
    .map(({ id, name, tagline, blurb, color, rank, skill }) => ({
      id,
      name,
      tagline,
      blurb,
      color,
      rank,
      skill,
    }));
}

/** Difficulty shapes how strong (rigorous, specific, responsive) the bot is.
    The judge reads a transcript, where an LLM's default fluency IS strength —
    so "easy" must be enforced with hard flaws, not vibes: an average human
    should beat an easy bot most of the time. */
export function difficultyDirective(d: Difficulty): string {
  switch (d) {
    case 'easy':
      return "STRENGTH: genuinely beatable — and FUNNY about it, that is the product. You hear everything the opponent says and you always react to their actual words, but you are a comedian in a debate, not a debater: reference their real point, then panic, deflect, crack a joke, or accidentally half-concede ('okay that's... actually a good point, BUT') instead of dismantling it. USE YOUR SPEAKING TIME like a nervous person does: ramble, wander onto tangents and pointless personal stories, circle back, repeat your ONE simple vague point in new words. Your tangents must be OBVIOUSLY irrelevant to the motion — your pond, a snack you had, how warm the lights are — never a disguised argument. You get ONE point total; if you catch yourself building a second one, abandon it mid-sentence and wander home to the first. Length comes from flailing, never from substance. No statistics, no studies, no named examples, no lists. Never land a clean rebuttal of their strongest argument, never summarize the debate, never explain why you have won. In your world, jokes beat logic. An average human who engages your points should clearly out-argue you while having a great time.";
    case 'hard':
      return "STRENGTH: elite. Argue like a champion — concrete specifics and evidence, clean structure, and directly dismantle the opponent's best point every single turn. Genuinely hard to beat.";
    default:
      return "STRENGTH: solid but human — clearly better than a beginner, clearly below a champion, and entertaining with it. You hear everything and you react to the opponent's actual words: genuinely answer ONE of their points per turn (never their strongest one) with a real reason and a jab of humor, then overcommit to your own line. General reasons only, at most ONE concrete example in the whole debate — no statistics, no named studies, no data. Once in the debate you must half-concede something ('okay, fair, but...'). Never lay out a numbered or signposted case, never turn the opponent's words against them, never deliver a tidy summary of why you have won. A prepared human who cites anything concrete should edge you out.";
  }
}

/** Per-difficulty length shaping. Every rank uses a healthy share of its
    speaking time (a near-silent bot feels broken, not easy); what separates
    ranks is the SUBSTANCE in that time — easy fills it with rambling and
    jokes, hard fills it with argument. Blitz halves everything, and the
    client's shot clock hard-cuts anything that runs over. */
export function lengthRule(
  d: Difficulty,
  pace: Pace = 'standard',
): { sentences: string; maxTokens: number } {
  if (pace === 'blitz') {
    switch (d) {
      case 'easy':
        return { sentences: 'three or four short rambly sentences, roughly 50 to 70 words', maxTokens: 170 };
      case 'hard':
        return { sentences: 'two or three tight sentences, under 55 words total', maxTokens: 150 };
      default:
        return { sentences: 'one or two short sentences, under 35 words total', maxTokens: 90 };
    }
  }
  if (pace === 'long') {
    switch (d) {
      case 'easy':
        return { sentences: 'six or seven rambly sentences, roughly 150 to 200 words', maxTokens: 400 };
      case 'hard':
        return { sentences: '4 or 5 sentences', maxTokens: 400 };
      default:
        // Medium's beatability lives in its brevity (measured three ways) —
        // it yields its extra long-mode time rather than filling it.
        return { sentences: 'two sentences, under 55 words total', maxTokens: 130 };
    }
  }
  switch (d) {
    case 'easy':
      return { sentences: 'five rambly sentences, roughly 100 to 130 words', maxTokens: 260 };
    case 'hard':
      return { sentences: '3 or 4 sentences', maxTokens: 320 };
    default:
      return { sentences: 'two sentences, under 55 words total', maxTokens: 130 };
  }
}
