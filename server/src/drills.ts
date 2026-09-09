// The Daily Drill: YapStage's answer to the chess puzzle.
//
// What makes a chess puzzle work is not that it is short. It is that there is
// ONE idea to find, you get thirty seconds, everyone in the world gets the same
// one today, and the feedback is instant and specific. So a debate puzzle is
// not "have a debate, but small" — it is one skill, isolated, with a right
// answer shape you can be graded against.
//
// Three drill types, the three things that actually decide real debates,
// pulled from how competitive debate is judged: answering the point that was
// made, weighing two things that are both true, and naming a flaw precisely.
// (Two more, defending an assigned side and asking the breaking question, were
// cut 2026-09-08: neither made a good thirty-second puzzle.) The bot ladder's
// rungs are built out of the same skills, so a player who drills weighing can
// feel exactly where rank 4 stops being able to.

export type DrillType = 'rebut' | 'weigh' | 'flaw';

export interface Drill {
  id: string;
  type: DrillType;
  /** What the player is shown, and what the timer starts on. */
  prompt: string;
  /** Type-specific context: the claim to answer, the flaw to find, and so on. */
  material: string;
}

/** Thirty seconds. Long enough for one real idea, short enough that padding
    is instantly visible to both the judge and the player. */
export const DRILL_SECONDS = 30;

export const DRILLS: Drill[] = [
  {
    id: 'reb-phones',
    type: 'rebut',
    prompt: 'Answer this argument.',
    material:
      'Phones should be banned in schools. Test scores went up in every district that banned them, so the case is closed.',
  },
  {
    id: 'reb-remote',
    type: 'rebut',
    prompt: 'Answer this argument.',
    material:
      'Remote work is bad for young employees. You learn a job by being in the room, and nobody has ever learned to lead over a video call.',
  },
  {
    id: 'reb-tipping',
    type: 'rebut',
    prompt: 'Answer this argument.',
    material:
      'Tipping should be abolished. It lets restaurants underpay staff and pushes the wage bill onto customers who never agreed to it.',
  },
  {
    id: 'reb-vote16',
    type: 'rebut',
    prompt: 'Answer this argument.',
    material:
      'Sixteen year olds should not vote. They cannot sign a contract or buy a house, so they clearly are not ready to choose a government.',
  },
  {
    id: 'reb-ai-art',
    type: 'rebut',
    prompt: 'Answer this argument.',
    material:
      'AI art is not art. A machine cannot mean anything by what it makes, and meaning is the entire point of art.',
  },

  {
    id: 'wei-uniforms',
    type: 'weigh',
    prompt: 'Both of these are true. Say why yours matters more.',
    material:
      'YOUR SIDE: school uniforms reduce bullying about clothes. THEIR SIDE: uniforms cost poorer families money they do not have.',
  },
  {
    id: 'wei-cars',
    type: 'weigh',
    prompt: 'Both of these are true. Say why yours matters more.',
    material:
      'YOUR SIDE: banning cars downtown cuts air pollution and street deaths. THEIR SIDE: it cuts off people who cannot walk or cycle to work.',
  },
  {
    id: 'wei-privacy',
    type: 'weigh',
    prompt: 'Both of these are true. Say why yours matters more.',
    material:
      'YOUR SIDE: city cameras help solve violent crime. THEIR SIDE: constant surveillance changes how ordinary people behave in public.',
  },
  {
    id: 'wei-zoo',
    type: 'weigh',
    prompt: 'Both of these are true. Say why yours matters more.',
    material:
      'YOUR SIDE: zoos fund conservation programs that keep species alive. THEIR SIDE: the animals in front of you spend their lives in an enclosure.',
  },
  {
    id: 'wei-exams',
    type: 'weigh',
    prompt: 'Both of these are true. Say why yours matters more.',
    material:
      'YOUR SIDE: final exams are the fairest way to compare students. THEIR SIDE: they measure how well you handle one bad morning.',
  },

  {
    id: 'flaw-icecream',
    type: 'flaw',
    prompt: 'Something is wrong with this argument. Name it and explain it.',
    material:
      'Ice cream sales and drowning deaths rise together every summer. If we want fewer drownings, we should be looking hard at ice cream.',
  },
  {
    id: 'flaw-either',
    type: 'flaw',
    prompt: 'Something is wrong with this argument. Name it and explain it.',
    material:
      'Either we cut the arts budget completely or we fire teachers. Nobody wants teachers fired, so the arts have to go.',
  },
  {
    id: 'flaw-grandpa',
    type: 'flaw',
    prompt: 'Something is wrong with this argument. Name it and explain it.',
    material:
      'My grandfather smoked a pack a day and lived to ninety four. So all that research on smoking is clearly overblown.',
  },
  {
    id: 'flaw-circular',
    type: 'flaw',
    prompt: 'Something is wrong with this argument. Name it and explain it.',
    material:
      'The policy is the right one because it is what a responsible government would do, and a responsible government would obviously do this.',
  },
  {
    id: 'flaw-survey',
    type: 'flaw',
    prompt: 'Something is wrong with this argument. Name it and explain it.',
    material:
      'We surveyed people leaving the gym and eighty percent said they exercise regularly. Clearly the country has no fitness problem.',
  },
];

const BY_TYPE: Record<DrillType, { name: string; skill: string; grade: string }> = {
  rebut: {
    name: 'the rebuttal',
    skill: 'answering the argument that was actually made',
    grade:
      'Did they engage the OPPONENT\'S actual claim rather than a nearby easier one? Did they name what is wrong with it and give a reason, instead of just asserting the opposite? A rebuttal that ignores the argument and restates a counter-position scores low no matter how well it is delivered.',
  },
  weigh: {
    name: 'weighing',
    skill: 'saying why your side matters more when both sides are true',
    grade:
      'Did they COMPARE, using a metric a listener can check: more people affected, more likely, sooner, harder to reverse, or first in the causal chain? Simply restating their own side louder is the failure mode here, and so is conceding. They must accept the opponent\'s point is true and still explain why it loses.',
  },
  flaw: {
    name: 'spotting the flaw',
    skill: 'naming exactly what is broken in an argument',
    grade:
      'Did they identify the SPECIFIC defect (correlation treated as causation, false dilemma, one anecdote against a base rate, circular reasoning, a biased sample) and explain WHY it breaks the conclusion? Naming a fallacy with no explanation is half an answer. Explaining the defect clearly without naming it is a full one.',
  },
};

export function drillMeta(type: DrillType) {
  return BY_TYPE[type];
}

/** Everyone gets the same drill on the same day, with no storage: the date IS
    the seed. `day` is a YYYY-MM-DD string in UTC. */
export function drillOfDay(day: string): Drill {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return DRILLS[h % DRILLS.length]!;
}

export const DRILL_TYPES: DrillType[] = ['rebut', 'weigh', 'flaw'];

export function isDrillType(x: unknown): x is DrillType {
  return typeof x === 'string' && (DRILL_TYPES as string[]).includes(x);
}

/** Today's drill of ONE skill, for trying a skill the day did not pick. Same
    seed as the daily, so it is stable across a day and rotates with it. */
export function drillOfDayByType(day: string, type: DrillType): Drill {
  const pool = DRILLS.filter((d) => d.type === type);
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return pool[h % pool.length]!;
}

export function drillById(id: unknown): Drill | undefined {
  return typeof id === 'string' ? DRILLS.find((d) => d.id === id) : undefined;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
