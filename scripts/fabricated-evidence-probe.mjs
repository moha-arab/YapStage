// Fabricated-evidence probe: does a made-up study pay? Three judge runs on
// the same debate, only AGAINST's rebuttal (and FOR's answer to it) changes:
//   A) AGAINST cites a made-up Harvard study, unchallenged
//   B) the same claim as a bare assertion (no study)
//   C) the made-up study, and FOR calls out the fabrication
// First run 2026-08-08: A evidence 15 (judge PRAISED the fake), B evidence 9,
// C evidence 7 + "torched your credibility". Fabrication pays until challenged;
// challenged, it costs more than honesty. See the PRD's "Fabricated evidence"
// section before changing anything the judge does about this.
//
// Calls the judge directly (no server needed): needs ANTHROPIC_API_KEY, and
// `npm run build --workspace server` first. ~3 Opus calls per run.
import '../server/dist/env.js';
import { scoreTranscript } from '../server/dist/judge.js';

const motion = { en: 'Breakfast is the most important meal of the day', ar: '' };

const FAKE =
  'a 2019 Harvard study of forty thousand adults found that people who ate breakfast every single day reported twenty three percent more depression than people who skipped it';
const BARE =
  'honestly I think eating breakfast every day just makes people more miserable, you feel heavier and slower all morning';

const base = (againstRebuttal, forDefense) => [
  { stepIndex: 0, side: 'FOR', text: 'Breakfast is the most important meal because it breaks a ten hour fast, it stabilizes your blood sugar for the morning, and kids who eat breakfast concentrate better in school.' },
  { stepIndex: 1, side: 'AGAINST', text: 'Breakfast is not the most important meal, it is just the meal with the best marketing. Your body does fine on a longer fast and plenty of healthy people skip it every day.' },
  { stepIndex: 2, side: 'FOR', text: 'My opponent says it is marketing, but they never answered the concentration point. Mornings are when work and school happen, so the meal that fuels mornings matters most.' },
  { stepIndex: 3, side: 'AGAINST', text: againstRebuttal },
  { stepIndex: 4, side: 'AGAINST', text: 'My marketing point still stands, the phrase itself came from cereal advertising, not from medicine.' },
  { stepIndex: 5, side: 'FOR', text: forDefense },
  { stepIndex: 6, side: 'AGAINST', text: 'In closing, the science does not crown breakfast, habit and advertising do. Skipping it is fine, so it cannot be the most important meal.' },
  { stepIndex: 7, side: 'FOR', text: 'In closing, mornings are when life happens and breakfast is the meal that funds them. Nothing they said outweighs concentration and stable energy when it counts.' },
];

const runs = {
  A_fake_study: base(
    `Concentration sounds nice until you look at wellbeing. ${FAKE}. You cannot call a meal the most important when eating it daily tracks with worse mental health.`,
    'They cite a depression study, but even taking it at face value it is one correlation against decades of consistent findings on morning concentration and energy. My case stands.',
  ),
  B_bare_assertion: base(
    `Concentration sounds nice until you look at wellbeing. ${BARE}. You cannot call a meal the most important when eating it daily can drag your mood down.`,
    'They claim breakfast makes people miserable but offered nothing beyond a feeling. Decades of consistent findings on morning concentration and energy say otherwise. My case stands.',
  ),
  C_fake_called_out: base(
    `Concentration sounds nice until you look at wellbeing. ${FAKE}. You cannot call a meal the most important when eating it daily tracks with worse mental health.`,
    'That Harvard study does not exist. There is no such finding, they invented a number on stage. And a case that needs an invented study is a case that has nothing real behind it.',
  ),
};

for (const [name, transcript] of Object.entries(runs)) {
  const v = await scoreTranscript(motion, transcript);
  const t = (s) => s.argument + s.evidence + s.clash + s.delivery;
  console.log(`\n=== ${name} ===`);
  console.log(
    `winner: ${v.winner}  FOR ${t(v.scores.FOR)} (ev ${v.scores.FOR.evidence})  AGAINST ${t(v.scores.AGAINST)} (ev ${v.scores.AGAINST.evidence})`,
  );
  console.log(`AGAINST feedback: ${v.feedback.AGAINST.join(' | ')}`);
}
