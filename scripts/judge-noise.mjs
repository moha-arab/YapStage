// Run-to-run noise of the judge: compare two OUT files written by
// scripts/judge-eval.mjs on the same cases and report how far the same
// transcript moves between two judge calls. This is the floor under every
// other number: a "bias" smaller than this is not a bias.
//
// Usage: node scripts/judge-noise.mjs runA.json runB.json [runC.json ...]
// Every pair of files is compared on the case ids they share.
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error('need at least two judge-eval OUT files');
  process.exit(2);
}
const runs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')).results);
const sum = (s) => s.argument + s.evidence + s.clash + s.delivery;
const CATS = ['argument', 'evidence', 'clash', 'delivery'];
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

for (let i = 0; i < runs.length; i++)
  for (let j = i + 1; j < runs.length; j++) {
    const a = runs[i];
    const b = runs[j];
    const marginDeltas = [];
    const totalDeltas = [];
    const cat = Object.fromEntries(CATS.map((k) => [k, []]));
    let flips = 0;
    let n = 0;
    const flipIds = [];
    console.log(`\n=== ${files[i]}  vs  ${files[j]} ===`);
    for (const r of a) {
      const q = b.find((x) => x.id === r.id);
      if (!q) continue;
      n += 1;
      marginDeltas.push(Math.abs(r.margin - q.margin));
      if (r.winner !== q.winner) {
        flips += 1;
        flipIds.push(`${r.id} (${r.margin > 0 ? '+' : ''}${r.margin} / ${q.margin > 0 ? '+' : ''}${q.margin})`);
      }
      for (const side of ['FOR', 'AGAINST']) {
        totalDeltas.push(Math.abs(sum(r.scores[side]) - sum(q.scores[side])));
        for (const k of CATS) cat[k].push(Math.abs(r.scores[side][k] - q.scores[side][k]));
      }
      console.log(
        `${r.id.padEnd(20)} margin ${String(r.margin).padStart(4)} / ${String(q.margin).padStart(4)}  |d| ${String(Math.abs(r.margin - q.margin)).padStart(2)}   FOR ${sum(r.scores.FOR)}/${sum(q.scores.FOR)}  AGAINST ${sum(r.scores.AGAINST)}/${sum(q.scores.AGAINST)}${r.winner !== q.winner ? '  WINNER FLIPPED' : ''}`,
      );
    }
    console.log(`shared cases: ${n}`);
    console.log(`winner flips: ${flips}/${n}${flipIds.length ? '  ' + flipIds.join(', ') : ''}`);
    console.log(`mean |margin delta|: ${avg(marginDeltas).toFixed(2)}   max: ${Math.max(...marginDeltas)}`);
    console.log(`mean |total delta| per side: ${avg(totalDeltas).toFixed(2)}   max: ${Math.max(...totalDeltas)}`);
    console.log(`per category mean |delta| per side: ${CATS.map((k) => `${k} ${avg(cat[k]).toFixed(2)} (max ${Math.max(...cat[k])})`).join(', ')}`);
  }
