// Judge fairness eval. Scores a set of crafted debates through the real judge
// (via the fast-mode-only /judge-eval endpoint) and reports:
//  - accuracy: does it pick the side that was built to argue better?
//  - ideological neutrality: does it reward a well-argued UNPOPULAR position?
//  - position balance: FOR-wins vs AGAINST-wins across balanced case sets
//  - agreement with an independent blind reader (the reference)
// Usage: URL=http://localhost:3009 CASES=scripts/judge-cases.json node scripts/judge-eval.mjs
import { readFileSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:3009';
const CASES = process.env.CASES ?? 'scripts/judge-cases.json';

const data = JSON.parse(readFileSync(CASES, 'utf8'));
const cases = data.cases || [];
const ratings = Object.fromEntries((data.ratings || []).map((r) => [r.id, r]));
const sum = (s) => s.argument + s.evidence + s.clash + s.delivery;

async function judge(c) {
  const res = await fetch(`${URL}/judge-eval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motion: { en: c.motionEn }, lines: c.lines }),
  });
  if (!res.ok) throw new Error(`judge-eval ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).verdict;
}

const results = [];
for (const c of cases) {
  try {
    const v = await judge(c);
    const margin = sum(v.scores.FOR) - sum(v.scores.AGAINST);
    const ref = ratings[c.id];
    results.push({
      id: c.id,
      motion: c.motionEn,
      intended: c.intendedStronger,
      winner: v.winner,
      margin,
      ref: ref?.betterSide,
      refConf: ref?.confidence,
    });
    console.log(
      `${c.id.padEnd(18)} intended=${String(c.intendedStronger).padEnd(8)} judge=${v.winner.padEnd(7)} margin=${margin > 0 ? '+' : ''}${margin}  ref=${ref?.betterSide ?? '?'}`,
    );
  } catch (e) {
    console.log(`${c.id}: ERROR ${e.message}`);
  }
}

const decisive = results.filter((r) => r.intended !== 'balanced');
const correct = decisive.filter((r) => r.winner === r.intended);
const forWins = results.filter((r) => r.winner === 'FOR').length;
const againstWins = results.filter((r) => r.winner === 'AGAINST').length;
const ideo = results.filter((r) => r.id.startsWith('ideo'));
const ideoCorrect = ideo.filter((r) => r.winner === r.intended);
const balanced = results.filter((r) => r.intended === 'balanced');
const refDecisive = results.filter((r) => r.ref === 'FOR' || r.ref === 'AGAINST');
const refAgree = refDecisive.filter((r) => r.winner === r.ref);

console.log('\n===== JUDGE FAIRNESS REPORT =====');
console.log(`Accuracy (picked the constructed-stronger side): ${correct.length}/${decisive.length}`);
console.log(`Ideological neutrality (rewarded the well-argued UNPOPULAR side): ${ideoCorrect.length}/${ideo.length}`);
console.log(`Agreement with independent blind reader: ${refAgree.length}/${refDecisive.length}`);
console.log(`Position balance across all cases: FOR won ${forWins}, AGAINST won ${againstWins} (want roughly even)`);
console.log('\nBalanced charged debates (want no systematic lean):');
for (const r of balanced)
  console.log(`  ${r.id.padEnd(10)} ${r.motion.slice(0, 44).padEnd(45)} winner=${r.winner} margin=${r.margin > 0 ? '+' : ''}${r.margin}`);
const misses = decisive.filter((r) => r.winner !== r.intended);
console.log(`\nMisses (judge vs construction): ${misses.length}`);
for (const r of misses)
  console.log(`  ${r.id}: intended ${r.intended}, judge said ${r.winner} (margin ${r.margin}) [blind ref: ${r.ref} ${r.refConf}]`);

const verdict = correct.length === decisive.length && ideoCorrect.length === ideo.length;
console.log(`\n${verdict ? 'JUDGE PASSED: accurate and ideologically even-handed' : 'REVIEW NEEDED: see misses above'}`);
process.exit(0);
