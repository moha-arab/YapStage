import { useRef, type ReactNode } from 'react';
import type { PhaseLabel, PhaseUpdate, Side } from '../../server/src/protocol';
import { useI18n } from './i18n';
import './debate.css';

/* The parts of the live match that the debater's screen (Debate.tsx) and the
   spectator's (Spectate.tsx) share: the progress track with the turn clock,
   and the paper strip that carries the motion.

   His brief (2026-09-12): the motion at the bottom, not on the side; simple,
   not overwhelming; and "the user clearly should see the progression of the
   game each round and how long is left". The track answers the second half:
   every turn of the debate in order, tinted by whose it is, the current one
   filling as its clock runs. */

/** Every debate has this shape: four rounds, two turns each, the speaking
    order mirrored at halfway (server/src/debate.ts, `script`). Every pace and
    the tutorial share it; only the seconds differ. */
export const SHAPE: { phase: PhaseLabel; speaker: Side }[] = [
  { phase: 'opening', speaker: 'FOR' },
  { phase: 'opening', speaker: 'AGAINST' },
  { phase: 'rebuttal', speaker: 'FOR' },
  { phase: 'rebuttal', speaker: 'AGAINST' },
  { phase: 'defense', speaker: 'AGAINST' },
  { phase: 'defense', speaker: 'FOR' },
  { phase: 'closing', speaker: 'AGAINST' },
  { phase: 'closing', speaker: 'FOR' },
];

const ROUNDS: PhaseLabel[] = ['opening', 'rebuttal', 'defense', 'closing'];

export const ROUND_KEY: Record<PhaseLabel, string> = {
  opening: 'openings',
  rebuttal: 'rebuttals',
  defense: 'defenses',
  closing: 'closings',
};

/* The seconds of each turn, one row per script in server/src/debate.ts:
   standard, blitz, long, the tutorial, and DEBATE_SPEED=fast. The client is
   never told the pace, only the current turn's length, so it matches what it
   has seen against these rows. If the server's numbers ever drift from this
   copy, nothing breaks: the track scales the standard row to the turn in
   front of it, and the total is only ever labelled "about". */
const SCRIPTS: number[][] = [
  [45, 45, 45, 45, 35, 35, 25, 25],
  [25, 25, 25, 25, 20, 20, 15, 15],
  [75, 75, 75, 75, 55, 55, 40, 40],
  [60, 45, 60, 45, 35, 50, 30, 45],
  [5, 5, 4, 4, 3, 3, 3, 3],
];

/** A turn's visible allowance. On a bot's turn `seconds` is the server's wider
    window (thinking plus speaking); `speakSeconds` is the turn itself. */
export const turnSeconds = (p: PhaseUpdate): number => p.speakSeconds ?? p.seconds;

/** The seconds of all eight turns of THIS debate, inferred from the turns seen
    so far (see SCRIPTS). */
export function useSchedule(phase: PhaseUpdate | null): number[] {
  const seen = useRef(new Map<number, number>());
  if (phase && phase.stepIndex >= 0) seen.current.set(phase.stepIndex, turnSeconds(phase));
  const fit = SCRIPTS.find((row) => [...seen.current].every(([i, s]) => row[i] === s));
  if (fit) return fit;
  const std = SCRIPTS[0];
  if (!phase || !std[phase.stepIndex]) return std;
  const k = turnSeconds(phase) / std[phase.stepIndex];
  return std.map((s) => Math.max(1, Math.round(s * k)));
}

/** Time left in the whole debate: what is left of this turn plus every later
    turn in full, rounded up to ten seconds so it does not tick beside the
    turn clock. A ceiling (pass the mic ends a turn early), hence "about". */
export function debateLeftMs(schedule: number[], step: number, turnLeftMs: number): number {
  let ms = Math.min(turnLeftMs, (schedule[step] ?? 0) * 1000);
  for (let i = step + 1; i < schedule.length; i++) ms += schedule[i] * 1000;
  return Math.ceil(ms / 10_000) * 10_000;
}

interface TrackProps {
  schedule: number[];
  /** The current turn. -1 before the first; SHAPE.length once it is over. */
  step: number;
  /** How much of the current turn has gone, 0..1. */
  fill: number;
  /** "Turn 3 of 8 · Rebuttals", or a waiting line. */
  label: ReactNode;
  /** The big turn clock (or a word in its place: "Thinking..."). Null hides it. */
  clock: string | null;
  clockSide?: Side;
  clockWord?: boolean;
  clockDanger?: boolean;
  clockFailed?: boolean;
  /** The line under the clock: "About 3:40 left in the debate". */
  sub?: string | null;
}

export function MatchTrack({
  schedule,
  step,
  fill,
  label,
  clock,
  clockSide,
  clockWord,
  clockDanger,
  clockFailed,
  sub,
}: TrackProps) {
  const { t } = useI18n();
  return (
    <section className="dv-track">
      <p className="dv-turn">{label}</p>
      <div className="dv-rounds" aria-hidden="true">
        {ROUNDS.map((r) => {
          const turns = SHAPE.map((s, i) => ({ ...s, i })).filter((s) => s.phase === r);
          const first = turns[0].i;
          const last = turns[turns.length - 1].i;
          const state = step > last ? 'done' : step >= first ? 'now' : 'next';
          const grow = turns.reduce((n, s) => n + (schedule[s.i] ?? 1), 0);
          return (
            <div key={r} className={`dv-round dv-round-${state}`} style={{ flexGrow: grow }}>
              <div className="dv-segs">
                {turns.map((s) => (
                  <span
                    key={s.i}
                    className={`dv-seg ${s.speaker === 'FOR' ? 'dv-for' : 'dv-against'} ${
                      s.i < step ? 'is-done' : s.i === step ? 'is-now' : ''
                    }`}
                    style={{ flexGrow: schedule[s.i] ?? 1 }}
                  >
                    {s.i === step ? (
                      <i style={{ width: `${Math.round(Math.min(1, Math.max(0, fill)) * 1000) / 10}%` }} />
                    ) : null}
                  </span>
                ))}
              </div>
              <span className="dv-round-name">{t(ROUND_KEY[r])}</span>
            </div>
          );
        })}
      </div>
      {clock !== null ? (
        <div
          className={`dv-clock ${clockSide === 'AGAINST' ? 'dv-against' : 'dv-for'} ${clockWord ? 'is-word' : ''} ${
            clockFailed ? 'is-failed' : clockDanger ? 'is-danger' : ''
          }`}
          role="timer"
        >
          {clock}
        </div>
      ) : null}
      {sub ? <p className="dv-left">{sub}</p> : null}
    </section>
  );
}

/** The paper strip along the bottom: the motion, with the line that says
    whose side of it you are on, and the one thing to press right now. */
export function MotionStrip({
  kicker,
  motion,
  children,
}: {
  kicker: ReactNode;
  motion: string;
  children?: ReactNode;
}) {
  return (
    <section className="dv-strip">
      <div className="dv-strip-text">
        <p className="dv-kicker">{kicker}</p>
        <p className="dv-motion display">{motion}</p>
      </div>
      {children ? <div className="dv-strip-act">{children}</div> : null}
    </section>
  );
}
