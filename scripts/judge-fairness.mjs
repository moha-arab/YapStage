// Judge FAIRNESS harness: does the judge pick the same SPEECH regardless of
// which label it wears and which slot it speaks from?
//
// For every hand-written case it scores three transcripts through the real
// judge (the fast-mode-only /judge-eval endpoint):
//
//   asis   the case exactly as written
//   swap   the same words with the FOR and AGAINST labels exchanged: every
//          speech moves to the same phase on the other side (step 0<->1,
//          2<->3, 4<->5, 6<->7) and the motion is replaced by its negation
//          (motionNegEn) so each speech still argues the side it is labelled.
//          This is what the app itself would have produced had the two
//          people drawn opposite sides.
//   order  labels and words unchanged; only the running order flips (the same
//          step exchange without relabelling), so AGAINST opens the debate and
//          FOR takes the back-to-back middle run. The format allows this
//          because the judge attributes each segment by its recorded speaker,
//          not by its slot.
//
// Speeches are tracked by identity, not label: P is whatever the FOR side said
// in the original, Q is whatever the AGAINST side said. A fair judge picks the
// same one of P and Q under all three conditions and gives it the same score.
//
// Reports, per condition:
//   winner flip rate       cases where the winning SPEECH changed vs asis
//   decisive flips         the same, counting only cases whose asis margin was
//                          at least MARGIN (default 6), so run-to-run noise on
//                          near-ties does not read as bias
//   label / slot bonus     mean signed total-score change a speech gets from
//                          wearing the FOR label (swap) or the FOR slots (order)
//   mean |delta|           mean absolute per-speech total change
//   accuracy               did the intended-stronger speech win, per condition
//
// Usage:
//   URL=http://localhost:3010 node scripts/judge-fairness.mjs
//   CASES=a.json,b.json CONDITIONS=asis,swap,order REPEAT=1 MARGIN=6 OUT=results.json
//   ONLY=length-,paste-   only ids starting with one of these prefixes
//   PARALLEL=3            judge calls in flight at once
//
// Cost: one judge call per case per condition per repeat (about $0.04 each).
import { readFileSync, writeFileSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:3010';
const CASES = (process.env.CASES ?? 'scripts/judge-cases.json,scripts/judge-cases-bias.json').split(',');
const CONDITIONS = (process.env.CONDITIONS ?? 'asis,swap,order').split(',');
const REPEAT = Number(process.env.REPEAT ?? 1);
const MARGIN = Number(process.env.MARGIN ?? 6);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const OUT = process.env.OUT ?? '';
const PARALLEL = Math.max(1, Number(process.env.PARALLEL ?? 3));

const cases = [];
for (const f of CASES) {
  const data = JSON.parse(readFileSync(f, 'utf8'));
  for (const c of data.cases || []) {
    if (ONLY && !ONLY.some((p) => c.id.startsWith(p))) continue;
    cases.push(c);
  }
}

const opp = (s) => (s === 'FOR' ? 'AGAINST' : 'FOR');
const sum = (s) => s.argument + s.evidence + s.clash + s.delivery;
const CATS = ['argument', 'evidence', 'clash', 'delivery'];

// Every condition returns { motion, lines, labelOf } where labelOf maps the
// speech identity (P = original FOR words, Q = original AGAINST words) to the
// label it wears in this transcript.
function variant(c, cond) {
  if (cond === 'asis') return { motion: c.motionEn, lines: c.lines, labelOf: { P: 'FOR', Q: 'AGAINST' } };
  if (cond === 'swap') {
    if (!c.motionNegEn) return null;
    return {
      motion: c.motionNegEn,
      lines: c.lines.map((l) => ({ ...l, stepIndex: l.stepIndex ^ 1, side: opp(l.side) })),
      labelOf: { P: 'AGAINST', Q: 'FOR' },
    };
  }
  if (cond === 'order') {
    return {
      motion: c.motionEn,
      lines: c.lines.map((l) => ({ ...l, stepIndex: l.stepIndex ^ 1 })),
      labelOf: { P: 'FOR', Q: 'AGAINST' },
    };
  }
  // label: relabel without moving slots (isolates the label from the order).
  // Not run by default; useful when swap and order disagree.
  if (cond === 'label') {
    if (!c.motionNegEn) return null;
    return {
      motion: c.motionNegEn,
      lines: c.lines.map((l) => ({ ...l, side: opp(l.side) })),
      labelOf: { P: 'AGAINST', Q: 'FOR' },
    };
  }
  throw new Error(`unknown condition ${cond}`);
}

async function judge(motion, lines) {
  const res = await fetch(`${URL}/judge-eval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motion: { en: motion }, lines }),
  });
  if (!res.ok) throw new Error(`judge-eval ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).verdict;
}

// results[caseId][cond] = [{ winner: 'P'|'Q', margin (P minus Q), scores: {P, Q} }, ...]
const results = {};
let calls = 0;
// One job per (case, condition, repeat); a small worker pool runs them.
const jobs = [];
for (const c of cases) {
  results[c.id] = {};
  for (const cond of CONDITIONS) {
    const v = variant(c, cond);
    if (!v) {
      console.log(`${c.id.padEnd(22)} ${cond.padEnd(6)} SKIPPED (no motionNegEn)`);
      continue;
    }
    results[c.id][cond] = [];
    for (let r = 0; r < REPEAT; r++) jobs.push({ c, cond, v });
  }
}
let nextJob = 0;
async function worker() {
  while (nextJob < jobs.length) {
    const { c, cond, v } = jobs[nextJob++];
    const intended = c.intendedStronger === 'FOR' ? 'P' : c.intendedStronger === 'AGAINST' ? 'Q' : 'balanced';
    try {
      const verdict = await judge(v.motion, v.lines);
      calls += 1;
      const P = verdict.scores[v.labelOf.P];
      const Q = verdict.scores[v.labelOf.Q];
      const winner = verdict.winner === v.labelOf.P ? 'P' : 'Q';
      results[c.id][cond].push({ winner, margin: sum(P) - sum(Q), scores: { P, Q }, feedback: verdict.feedback });
      console.log(
        `${c.id.padEnd(22)} ${cond.padEnd(6)} winner=${winner} (${verdict.winner.padEnd(7)}) P=${sum(P)} Q=${sum(Q)} margin=${sum(P) - sum(Q) > 0 ? '+' : ''}${sum(P) - sum(Q)}${intended !== 'balanced' ? (winner === intended ? '  ok' : '  MISS') : ''}`,
      );
    } catch (e) {
      console.log(`${c.id.padEnd(22)} ${cond.padEnd(6)} ERROR ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));

// ---- report ----
const first = (id, cond) => results[id]?.[cond]?.[0];
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (x, d = 1) => (Number.isFinite(x) ? (x > 0 ? '+' : '') + x.toFixed(d) : 'n/a');

console.log('\n===== JUDGE FAIRNESS (swap / order) REPORT =====');
console.log(`cases: ${cases.length}   conditions: ${CONDITIONS.join(',')}   repeat: ${REPEAT}   judge calls: ${calls}   est. cost: $${(calls * 0.04).toFixed(2)}`);

const summary = { cases: cases.length, calls, conditions: {} };
for (const cond of CONDITIONS) {
  if (cond === 'asis') continue;
  const paired = cases.filter((c) => first(c.id, 'asis') && first(c.id, cond));
  const flips = paired.filter((c) => first(c.id, 'asis').winner !== first(c.id, cond).winner);
  const decisive = paired.filter((c) => Math.abs(first(c.id, 'asis').margin) >= MARGIN);
  const decisiveFlips = decisive.filter((c) => first(c.id, 'asis').winner !== first(c.id, cond).winner);
  // Bonus for the FOR label (swap/label) or the FOR slots (order): for each
  // speech, score when it carried the FOR label/slots minus score when it did
  // not. Under asis P has FOR, under the other condition Q has FOR.
  const bonuses = [];
  const absDeltas = [];
  const catBonus = Object.fromEntries(CATS.map((k) => [k, []]));
  for (const c of paired) {
    const a = first(c.id, 'asis');
    const b = first(c.id, cond);
    if (cond === 'order') {
      // P has FOR slots in asis, Q has FOR slots in order
      bonuses.push(sum(a.scores.P) - sum(b.scores.P), sum(b.scores.Q) - sum(a.scores.Q));
      for (const k of CATS) catBonus[k].push(a.scores.P[k] - b.scores.P[k], b.scores.Q[k] - a.scores.Q[k]);
    } else {
      bonuses.push(sum(a.scores.P) - sum(b.scores.P), sum(b.scores.Q) - sum(a.scores.Q));
      for (const k of CATS) catBonus[k].push(a.scores.P[k] - b.scores.P[k], b.scores.Q[k] - a.scores.Q[k]);
    }
    absDeltas.push(Math.abs(sum(a.scores.P) - sum(b.scores.P)), Math.abs(sum(a.scores.Q) - sum(b.scores.Q)));
  }
  const decisiveCases = cases.filter((c) => c.intendedStronger === 'FOR' || c.intendedStronger === 'AGAINST');
  const accAsis = decisiveCases.filter((c) => first(c.id, 'asis')?.winner === (c.intendedStronger === 'FOR' ? 'P' : 'Q'));
  const accCond = decisiveCases.filter((c) => first(c.id, cond)?.winner === (c.intendedStronger === 'FOR' ? 'P' : 'Q'));
  const what = cond === 'order' ? 'FOR-slot bonus (opens + last word)' : 'FOR-label bonus';
  console.log(`\n--- ${cond} vs asis ---`);
  console.log(`winner flips: ${flips.length}/${paired.length} (${paired.length ? ((100 * flips.length) / paired.length).toFixed(0) : 0}%)`);
  console.log(`decisive flips (asis |margin| >= ${MARGIN}): ${decisiveFlips.length}/${decisive.length}`);
  console.log(`${what}: ${fmt(avg(bonuses))} points per speech (want 0)   per category: ${CATS.map((k) => `${k} ${fmt(avg(catBonus[k]))}`).join(', ')}`);
  console.log(`mean |total delta| per speech: ${fmt(avg(absDeltas))}`);
  console.log(`accuracy: asis ${accAsis.length}/${decisiveCases.length}, ${cond} ${accCond.length}/${decisiveCases.length}`);
  for (const c of flips) {
    const a = first(c.id, 'asis');
    const b = first(c.id, cond);
    console.log(`  FLIP ${c.id}: asis winner ${a.winner} (margin ${fmt(a.margin, 0)}), ${cond} winner ${b.winner} (margin ${fmt(b.margin, 0)})${c.intendedStronger !== 'balanced' ? `, intended ${c.intendedStronger === 'FOR' ? 'P' : 'Q'}` : ''}`);
  }
  summary.conditions[cond] = {
    paired: paired.length,
    flips: flips.length,
    decisive: decisive.length,
    decisiveFlips: decisiveFlips.length,
    bonus: avg(bonuses),
    catBonus: Object.fromEntries(CATS.map((k) => [k, avg(catBonus[k])])),
    meanAbsDelta: avg(absDeltas),
    accuracy: { asis: `${accAsis.length}/${decisiveCases.length}`, [cond]: `${accCond.length}/${decisiveCases.length}` },
    flipIds: flips.map((c) => c.id),
  };
}

// Run-to-run noise when REPEAT > 1: how often the same transcript flips on itself.
if (REPEAT > 1) {
  let self = 0;
  let n = 0;
  const spread = [];
  for (const c of cases)
    for (const cond of CONDITIONS) {
      const runs = results[c.id][cond] ?? [];
      if (runs.length < 2) continue;
      n += 1;
      if (new Set(runs.map((r) => r.winner)).size > 1) self += 1;
      spread.push(Math.max(...runs.map((r) => r.margin)) - Math.min(...runs.map((r) => r.margin)));
    }
  console.log(`\nrun-to-run noise: ${self}/${n} transcripts flipped against themselves; mean margin spread ${fmt(avg(spread))}`);
  summary.noise = { selfFlips: self, transcripts: n, meanMarginSpread: avg(spread) };
}

if (OUT) {
  writeFileSync(OUT, JSON.stringify({ summary, results }, null, 2));
  console.log(`\nwrote ${OUT}`);
}
