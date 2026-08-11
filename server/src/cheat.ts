// Anti-cheat: the only cheat that actually threatens this game is reading an
// answer off a second screen. Everything else (multi-accounting, self-play) is
// already blocked at the seat.
//
// The design rule here is that we do NOT accuse. We measure a handful of
// signals that separate SPEAKING from READING, score them, and file the score
// where a human can look. A false accusation costs far more than a missed
// cheat, so nothing in this file ever changes a verdict or shows a player a
// warning: it produces evidence, and a person decides.
//
// What actually separates speaking from reading, in a transcript:
//   - Fillers. Spontaneous speech runs 2-6 fillers per 100 words. Read prose
//     runs near zero, because the sentence already exists.
//   - Essay connectives. "Firstly", "moreover", "in conclusion", "it is
//     important to note" are written-English scaffolding. People do not say
//     them out loud at any rate; chatbots produce them constantly.
//   - Dead air, then fluency. A long silence at the top of your turn followed
//     by a clean uninterrupted burst is the shape of someone waiting for text
//     to finish generating and then reading it.
//   - Leaving the tab while it is your turn to speak. Reported by the client,
//     so treat it as the softest signal of the four: it is trivially spoofed,
//     and someone can legitimately get a phone call.

export interface TurnChunk {
  side: 'FOR' | 'AGAINST';
  stepIndex: number;
  text: string;
  at: number;
}

export interface BlurReport {
  /** Milliseconds this player's tab was hidden or unfocused during THEIR turn. */
  blurMs: number;
  blurCount: number;
}

export interface CheatSignals {
  words: number;
  fillersPer100: number;
  connectivesPer100: number;
  /** Longest dead-air gap before a burst, in seconds. */
  worstLatencySec: number;
  blurMs: number;
  score: number;
  reasons: string[];
}

const FILLERS =
  /\b(um+|uh+|erm+|hmm+|like|you know|i mean|kind of|kinda|sort of|sorta|basically|literally|i guess|right\?)\b/gi;

const CONNECTIVES =
  /\b(firstly|secondly|thirdly|moreover|furthermore|additionally|in conclusion|to conclude|in summary|consequently|nevertheless|nonetheless|it is important to note|it's important to note|that being said|on the other hand|in essence|ultimately, it)\b/gi;

const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

/** Per-side signals for one debate. `turnStarts` maps stepIndex to the moment
    the turn opened, which is what makes "dead air then a fluent burst"
    measurable at all. */
export function analyze(
  chunks: TurnChunk[],
  side: 'FOR' | 'AGAINST',
  turnStarts: Map<number, number>,
  blur?: BlurReport,
): CheatSignals {
  const mine = chunks.filter((c) => c.side === side).sort((a, b) => a.at - b.at);
  const text = mine.map((c) => c.text).join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  const per100 = (n: number) => (words > 0 ? (n * 100) / words : 0);

  const fillersPer100 = per100(count(text, FILLERS));
  const connectivesPer100 = per100(count(text, CONNECTIVES));

  // Dead air: for each turn, how long between the turn opening and the first
  // words arriving. Only counted for turns that then produced real content.
  let worstLatencySec = 0;
  const byStep = new Map<number, TurnChunk[]>();
  for (const c of mine) {
    const list = byStep.get(c.stepIndex) ?? [];
    list.push(c);
    byStep.set(c.stepIndex, list);
  }
  for (const [step, list] of byStep) {
    const started = turnStarts.get(step);
    if (!started || list.length === 0) continue;
    const turnWords = list.map((c) => c.text).join(' ').split(/\s+/).filter(Boolean).length;
    if (turnWords < 20) continue; // a stray word is not a composed answer
    worstLatencySec = Math.max(worstLatencySec, (list[0]!.at - started) / 1000);
  }

  const blurMs = blur?.blurMs ?? 0;

  // Weights, in the order they deserve trust. Nothing here fires on its own:
  // the score only gets interesting when several agree, which is the point.
  const reasons: string[] = [];
  let score = 0;
  if (words >= 60) {
    if (fillersPer100 < 0.5) {
      score += 30;
      reasons.push('no filler words at all');
    } else if (fillersPer100 < 1.5) {
      score += 15;
      reasons.push('unusually few filler words');
    }
    if (connectivesPer100 > 3) {
      score += 30;
      reasons.push('written-essay connectives throughout');
    } else if (connectivesPer100 > 1.5) {
      score += 15;
      reasons.push('essay-style connectives');
    }
  }
  if (worstLatencySec > 12) {
    score += 25;
    reasons.push(`${Math.round(worstLatencySec)}s of dead air before speaking`);
  } else if (worstLatencySec > 7) {
    score += 12;
    reasons.push(`${Math.round(worstLatencySec)}s pause before speaking`);
  }
  if (blurMs > 20_000) {
    score += 15;
    reasons.push('left the tab for most of a turn');
  } else if (blurMs > 6_000) {
    score += 8;
    reasons.push('left the tab mid-turn');
  }

  return {
    words,
    fillersPer100: Math.round(fillersPer100 * 10) / 10,
    connectivesPer100: Math.round(connectivesPer100 * 10) / 10,
    worstLatencySec: Math.round(worstLatencySec),
    blurMs,
    score: Math.min(100, score),
    reasons,
  };
}

/** Above this, a human should look at the match. Deliberately high: at 60 you
    need at least two independent signals to agree. */
export const FLAG_AT = 60;
