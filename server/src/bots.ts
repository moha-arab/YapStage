// The bot roster: a ranked ladder of CHARACTERS, easiest to hardest. Each one
// IS a difficulty (you don't pick difficulty separately) — so it feels like
// facing a specific opponent, not a slider. The public fields feed the pick
// screen; `style`, `difficulty`, and `voiceId` shape generation + speech.
import type { Difficulty } from './protocol.js';

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
    voiceId: 'MF3mGyEYCl7XYWbV9V6O', // Elli
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
    voiceId: 'yoZ06aMxZJJ28mfd3POQ', // Sam
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
    voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
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
    voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam
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
    voiceId: 'ErXwobaYiN019PkySvjV', // Antoni
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
    voiceId: 'VR6AewLTigWG4xSOukaG', // Arnold
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

/** Difficulty shapes how strong (rigorous, specific, responsive) the bot is. */
export function difficultyDirective(d: Difficulty): string {
  switch (d) {
    case 'easy':
      return 'STRENGTH: beatable. Argue like a casual amateur — general points, vibes over hard evidence, and you do not always answer the opponent\'s strongest argument. A sharp human should out-argue you.';
    case 'hard':
      return 'STRENGTH: elite. Argue like a champion — concrete specifics and evidence, clean structure, and directly dismantle the opponent\'s best point every single turn. Genuinely hard to beat.';
    default:
      return 'STRENGTH: solid. Argue like a prepared debater — real reasons with some specifics, answer the opponent\'s main point most turns, stay organized.';
  }
}
