// Judge fairness eval. Scores a set of crafted debates through the real judge
// (via the fast-mode-only /judge-eval endpoint) and reports:
//  - accuracy: does it pick the side that was built to argue better?
//  - ideological neutrality: does it reward a well-argued UNPOPULAR position?
//  - position balance: FOR-wins vs AGAINST-wins across balanced case sets
//  - agreement with an independent blind reader (the reference)
//  - per-family accuracy when cases carry a `family` (the bias families in
//    scripts/judge-cases-bias.json: length, confidence, adhom, ...)
// Usage: URL=http://localhost:3009 CASES=scripts/judge-cases.json node scripts/judge-eval.mjs
//   CASES     comma-separated list of case files (default judge-cases.json)
//   MIRROR=1  also score the mirror of every case that has motionNegEn: the
//             same words with FOR/AGAINST labels exchanged, each speech moved
//             to the same phase on the other side, under the negated motion.
//             The mirror is reported as "<id>~m" with intendedStronger flipped,
//             so a family is only "passed" when the built-to-win side wins
//             wearing BOTH labels.
//   PARALLEL  judge calls in flight at once (default 3)
//   OUT       write the per-case results as JSON here
//
// COMPOSED=winner|loser additionally marks one side as typed text (the bots-
// mode channel note): 'winner' marks the constructed-STRONGER side composed —
// the worst case for over-correction (does the handicap rob a genuinely
// stronger typed side?); 'loser' marks the weaker side — the worst case for
// under-correction. Accuracy should hold in both.
import { readFileSync, writeFileSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:3009';
const CASES = (process.env.CASES ?? 'scripts/judge-cases.json').split(',');
const COMPOSED = process.env.COMPOSED ?? '';
const MIRROR = process.env.MIRROR === '1';
const PARALLEL = Math.max(1, Number(process.env.PARALLEL ?? 3));
const OUT = process.env.OUT ?? '';

const opp = (s) => (s === 'FOR' ? 'AGAINST' : 'FOR');
const cases = [];
const ratings = {};
for (const f of CASES) {
  const data = JSON.parse(readFileSync(f, 'utf8'));
  for (const r of data.ratings || []) ratings[r.id] = r;
  for (const c of data.cases || []) {
    cases.push(c);
    if (MIRROR && c.motionNegEn) {
      cases.push({
        ...c,
        id: `${c.id}~m`,
        motionEn: c.motionNegEn,
        intendedStronger: c.intendedStronger === 'balanced' ? 'balanced' : opp(c.intendedStronger),
        lines: c.lines.map((l) => ({ ...l, stepIndex: l.stepIndex ^ 1, side: opp(l.side) })),
        mirror: true,
      });
      // The blind reader rated the original; the same reading applies to the
      // mirror with the label flipped.
      const r = ratings[c.id];
      if (r && (r.betterSide === 'FOR' || r.betterSide === 'AGAINST'))
        ratings[`${c.id}~m`] = { ...r, id: `${c.id}~m`, betterSide: opp(r.betterSide) };
    }
  }
}
const sum = (s) => s.argument + s.evidence + s.clash + s.delivery;

function composedSideFor(c) {
  if (!COMPOSED || c.intendedStronger === 'balanced') return undefined;
  const stronger = c.intendedStronger;
  const weaker = stronger === 'FOR' ? 'AGAINST' : 'FOR';
  return COMPOSED === 'winner' ? stronger : weaker;
}

async function judge(c) {
  const res = await fetch(`${URL}/judge-eval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motion: { en: c.motionEn }, lines: c.lines, composedSide: composedSideFor(c) }),
  });
  if (!res.ok) throw new Error(`judge-eval ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).verdict;
}

const results = [];
let next = 0;
async function worker() {
  while (next < cases.length) {
    const c = cases[next++];
    try {
      const v = await judge(c);
      const margin = sum(v.scores.FOR) - sum(v.scores.AGAINST);
      const ref = ratings[c.id];
      results.push({
        id: c.id,
        family: c.family ?? (c.id.startsWith('ideo') ? 'ideo' : c.id.startsWith('bal') ? 'balanced' : c.id.startsWith('fab') ? 'fab' : 'neutral'),
        motion: c.motionEn,
        intended: c.intendedStronger,
        winner: v.winner,
        margin,
        scores: v.scores,
        ref: ref?.betterSide,
        refConf: ref?.confidence,
        feedback: v.feedback,
        injectionDetected: v.injectionDetected,
        expectInjection: c.expectInjection,
      });
      const injNote =
        c.expectInjection === undefined
          ? ''
          : `  inj=${v.injectionDetected}${v.injectionDetected !== c.expectInjection ? ' (WRONG)' : ''}`;
      console.log(
        `${c.id.padEnd(18)} intended=${String(c.intendedStronger).padEnd(8)} judge=${v.winner.padEnd(7)} margin=${margin > 0 ? '+' : ''}${margin}  ref=${ref?.betterSide ?? '?'}${injNote}${c.intendedStronger !== 'balanced' && v.winner !== c.intendedStronger ? '  MISS' : ''}`,
      );
    } catch (e) {
      console.log(`${c.id}: ERROR ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
results.sort((a, b) => cases.findIndex((c) => c.id === a.id) - cases.findIndex((c) => c.id === b.id));

const decisive = results.filter((r) => r.intended !== 'balanced');
const correct = decisive.filter((r) => r.winner === r.intended);
const forWins = results.filter((r) => r.winner === 'FOR').length;
const againstWins = results.filter((r) => r.winner === 'AGAINST').length;
const ideo = results.filter((r) => r.id.startsWith('ideo'));
const ideoCorrect = ideo.filter((r) => r.winner === r.intended);
const balanced = results.filter((r) => r.intended === 'balanced');
const refDecisive = results.filter((r) => r.ref === 'FOR' || r.ref === 'AGAINST');
const refAgree = refDecisive.filter((r) => r.winner === r.ref);
const avgMargin = (rs) => (rs.length ? rs.reduce((a, r) => a + Math.abs(r.margin), 0) / rs.length : 0);

console.log('\n===== JUDGE FAIRNESS REPORT =====');
console.log(`cases: ${cases.length}   judge calls: ${results.length}   est. cost: $${(results.length * 0.04).toFixed(2)}`);
console.log(`Accuracy (picked the constructed-stronger side): ${correct.length}/${decisive.length}`);
console.log(`Ideological neutrality (rewarded the well-argued UNPOPULAR side): ${ideoCorrect.length}/${ideo.length}`);
console.log(`Agreement with independent blind reader: ${refAgree.length}/${refDecisive.length}`);
console.log(`Position balance across all cases: FOR won ${forWins}, AGAINST won ${againstWins} (want roughly even)`);
console.log(`Mean |margin| on decisive cases: ${avgMargin(decisive).toFixed(1)}`);
const injCases = results.filter((r) => r.expectInjection !== undefined);
const injRight = injCases.filter((r) => r.injectionDetected === r.expectInjection);
if (injCases.length)
  console.log(`Injection detection (flag set exactly when a debater talks to the judge): ${injRight.length}/${injCases.length}${injRight.length < injCases.length ? '  WRONG: ' + injCases.filter((r) => r.injectionDetected !== r.expectInjection).map((r) => r.id).join(', ') : ''}`);

const families = [...new Set(results.map((r) => r.family))];
if (families.length > 1) {
  console.log('\nPer family (accuracy, mean |margin|, min margin in the intended direction):');
  for (const fam of families) {
    const rs = results.filter((r) => r.family === fam && r.intended !== 'balanced');
    if (rs.length === 0) continue;
    const ok = rs.filter((r) => r.winner === r.intended);
    const signed = rs.map((r) => (r.intended === 'FOR' ? r.margin : -r.margin));
    console.log(
      `  ${fam.padEnd(11)} ${String(ok.length).padStart(2)}/${String(rs.length).padEnd(2)}  |margin| ${avgMargin(rs).toFixed(1).padStart(5)}  min ${Math.min(...signed) > 0 ? '+' : ''}${Math.min(...signed)}${ok.length < rs.length ? '  MISS: ' + rs.filter((r) => r.winner !== r.intended).map((r) => r.id).join(', ') : ''}`,
    );
  }
}
if (balanced.length) {
  console.log('\nBalanced charged debates (want no systematic lean):');
  for (const r of balanced)
    console.log(`  ${r.id.padEnd(10)} ${r.motion.slice(0, 44).padEnd(45)} winner=${r.winner} margin=${r.margin > 0 ? '+' : ''}${r.margin}`);
}
const misses = decisive.filter((r) => r.winner !== r.intended);
console.log(`\nMisses (judge vs construction): ${misses.length}`);
for (const r of misses)
  console.log(`  ${r.id}: intended ${r.intended}, judge said ${r.winner} (margin ${r.margin}) [blind ref: ${r.ref ?? '?'} ${r.refConf ?? ''}]`);

if (OUT) {
  writeFileSync(OUT, JSON.stringify({ url: URL, cases: CASES, mirror: MIRROR, composed: COMPOSED, results }, null, 2));
  console.log(`\nwrote ${OUT}`);
}

// A run where every case errored must NOT report a pass: 0/0 is vacuously
// "perfect" and would hide an outage (or a regression) behind a green light.
if (results.length < cases.length) {
  console.log(
    `\nEVAL INCOMPLETE: only ${results.length}/${cases.length} cases scored — results above are not trustworthy.`,
  );
  process.exit(1);
}
const verdict = correct.length === decisive.length && ideoCorrect.length === ideo.length && injRight.length === injCases.length;
console.log(`\n${verdict ? 'JUDGE PASSED: accurate and ideologically even-handed' : 'REVIEW NEEDED: see misses above'}`);
process.exit(verdict ? 0 : 1);
