import type { Server } from 'socket.io';
import type {
  ClientToServer,
  PhaseLabel,
  ServerToClient,
  Side,
  SocketData,
  SpeechChunk,
} from './protocol.js';
import { type Lobby, type Participant, destroyLobby, sideOf, touch } from './lobby.js';
import { namesOf, runJudge } from './judge.js';
import { TOPIC_BY_ID } from './topics.js';
import { transcribe } from './stt.js';
import { event } from './stats.js';

export type Io = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export interface Step {
  phase: PhaseLabel;
  speaker: Side;
  seconds: number;
}

const FAST = process.env.DEBATE_SPEED === 'fast';

export const SCRIPT: Step[] = FAST
  ? [
      { phase: 'opening', speaker: 'FOR', seconds: 5 },
      { phase: 'opening', speaker: 'AGAINST', seconds: 5 },
      { phase: 'rebuttal', speaker: 'FOR', seconds: 4 },
      { phase: 'rebuttal', speaker: 'AGAINST', seconds: 4 },
      { phase: 'closing', speaker: 'FOR', seconds: 3 },
      { phase: 'closing', speaker: 'AGAINST', seconds: 3 },
    ]
  : [
      { phase: 'opening', speaker: 'FOR', seconds: 60 },
      { phase: 'opening', speaker: 'AGAINST', seconds: 60 },
      { phase: 'rebuttal', speaker: 'FOR', seconds: 45 },
      { phase: 'rebuttal', speaker: 'AGAINST', seconds: 45 },
      { phase: 'closing', speaker: 'FOR', seconds: 30 },
      { phase: 'closing', speaker: 'AGAINST', seconds: 30 },
    ];

const REVEAL_MS = FAST ? 3000 : 8000;

// Trailing grace: a final speech result often lands 1-2s after a turn ends.
const CHUNK_GRACE_MS = 2500;
// Wait for trailing chunks before judging.
const JUDGE_DELAY_MS = 3000;

const MAX_CHUNK_CHARS = 600;
const MAX_TRANSCRIPT_ENTRIES = 400;

export function startDebate(io: Io, lobby: Lobby): void {
  if (lobby.status !== 'greenroom' || !lobby.host || !lobby.guest) return;
  const { pick } = lobby;
  const topic = pick.hostTopicId ? TOPIC_BY_ID.get(pick.hostTopicId) : undefined;
  const agreed =
    topic !== undefined &&
    pick.hostTopicId === pick.guestTopicId &&
    pick.hostSide !== null &&
    pick.guestSide !== null &&
    pick.hostSide !== pick.guestSide;
  if (!agreed) return;
  touch(lobby);
  event('debate_started', { code: lobby.code, topic: pick.hostTopicId });
  lobby.status = 'in_debate';
  lobby.topic = topic;
  lobby.sides = { host: pick.hostSide!, guest: pick.guestSide! };

  const names: Record<Side, string> = {
    FOR: lobby.sides.host === 'FOR' ? lobby.host.name : lobby.guest.name,
    AGAINST: lobby.sides.host === 'AGAINST' ? lobby.host.name : lobby.guest.name,
  };

  const now = Date.now();
  const startsAt = now + REVEAL_MS;
  io.to(lobby.host.socketId).emit('debate:start', {
    topic: lobby.topic,
    yourSide: lobby.sides.host,
    names,
    startsAt,
    serverNow: now,
  });
  io.to(lobby.guest.socketId).emit('debate:start', {
    topic: lobby.topic,
    yourSide: lobby.sides.guest,
    names,
    startsAt,
    serverNow: now,
  });

  lobby.stepIndex = -1;
  lobby.phaseTimer = setTimeout(() => advance(io, lobby, -1), REVEAL_MS);
}

export function advance(io: Io, lobby: Lobby, expectedStep: number): void {
  // The only guard that matters: stale timer callbacks and double-advances
  // both fail this check and become no-ops.
  if (lobby.status !== 'in_debate' || lobby.stepIndex !== expectedStep) return;
  touch(lobby);

  const next = expectedStep + 1;
  if (next >= SCRIPT.length) {
    finishDebate(io, lobby);
    return;
  }

  lobby.stepIndex = next;
  const step = SCRIPT[next];
  const now = Date.now();
  const deadline = now + step.seconds * 1000;
  lobby.stepStartedAt = now;

  io.to(lobby.code).emit('debate:phase', {
    stepIndex: next,
    phase: step.phase,
    activeSpeaker: step.speaker,
    seconds: step.seconds,
    deadline,
    serverNow: now,
  });

  lobby.phaseTimer = setTimeout(() => advance(io, lobby, next), step.seconds * 1000);
}

function finishDebate(io: Io, lobby: Lobby): void {
  lobby.status = 'judging';
  lobby.debateCompleted = true;
  event('debate_completed', { code: lobby.code });
  lobby.finishedAt = Date.now();
  io.to(lobby.code).emit('debate:ended');
  if (FAST) {
    // Test mode only — never log transcripts in production (privacy promise).
    console.log(`[debate] ${lobby.code} transcript:`, JSON.stringify(lobby.transcript));
  }
  // Give trailing speech chunks / audio blobs time to land, then transcribe
  // any recorded turns server-side before the judge reads.
  lobby.judgeTimer = setTimeout(() => {
    void (async () => {
      await applyServerTranscription(lobby);
      void runJudge(io, lobby);
    })();
  }, JUDGE_DELAY_MS);
}

/** reason is an i18n KEY (client renders t(reason, vars)) — servers don't
    speak a language, users do. */
export function abort(io: Io, lobby: Lobby, reason: string, vars?: Record<string, string>): void {
  if (lobby.status === 'aborted' || lobby.status === 'verdict') return;
  if (lobby.phaseTimer) clearTimeout(lobby.phaseTimer);
  if (lobby.judgeTimer) clearTimeout(lobby.judgeTimer);
  event('debate_aborted', { code: lobby.code, reason });
  lobby.status = 'aborted';
  lobby.abortInfo = { reason, vars };
  io.to(lobby.code).emit('debate:aborted', { reason, vars });
  setTimeout(() => {
    destroyLobby(lobby.code);
    io.socketsLeave(lobby.code);
  }, 60_000).unref();
}

/**
 * Resend missed state to one participant's socket after a resume. Covers every
 * stage: a client may have missed debate:start, debate:ended, the verdict, or
 * the abort entirely while its socket was down (room emits don't queue).
 */
export function resendState(io: Io, lobby: Lobby, participant: Participant): void {
  const socketId = participant.socketId;
  const now = Date.now();

  // The client may have missed debate:start itself (blip at the transition,
  // or a post-debate page refresh): without it, it can't render the debate or
  // verdict screens with names/topic/side. Idempotent resend.
  const emitStart = () => {
    const side = sideOf(lobby, participant);
    if (lobby.topic && side) {
      io.to(socketId).emit('debate:start', {
        topic: lobby.topic,
        yourSide: side,
        names: namesOf(lobby),
        startsAt: lobby.stepStartedAt, // already in the past — no reveal replay
        serverNow: now,
      });
    }
  };

  if (lobby.status === 'in_debate' && lobby.stepIndex >= 0) {
    emitStart();
    const step = SCRIPT[lobby.stepIndex];
    io.to(socketId).emit('debate:phase', {
      stepIndex: lobby.stepIndex,
      phase: step.phase,
      activeSpeaker: step.speaker,
      seconds: step.seconds,
      deadline: lobby.stepStartedAt + step.seconds * 1000,
      serverNow: now,
    });
    return;
  }

  if (lobby.status === 'judging') {
    emitStart();
    io.to(socketId).emit('debate:ended');
    io.to(socketId).emit(
      'verdict:status',
      lobby.judgeState === 'failed'
        ? { state: 'failed', message: 'judgeFailedMsg' }
        : { state: 'pending' },
    );
    return;
  }

  if (lobby.status === 'verdict' && lobby.verdict) {
    emitStart();
    io.to(socketId).emit('debate:ended');
    io.to(socketId).emit('verdict:result', { verdict: lobby.verdict, names: namesOf(lobby) });
    return;
  }

  if (lobby.status === 'aborted') {
    io.to(socketId).emit(
      'debate:aborted',
      lobby.abortInfo ?? { reason: 'abortGone' },
    );
  }
}

/** Shared turn-validation for incoming transcription material. */
function turnIsAcceptable(lobby: Lobby, sender: Participant, stepIndex: number): boolean {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= SCRIPT.length) return false;
  const side = sideOf(lobby, sender);
  if (!side || SCRIPT[stepIndex].speaker !== side) return false;
  const now = Date.now();
  const isCurrent = lobby.status === 'in_debate' && stepIndex === lobby.stepIndex;
  const isTrailingPrev =
    lobby.status === 'in_debate' &&
    stepIndex === lobby.stepIndex - 1 &&
    now - lobby.stepStartedAt < CHUNK_GRACE_MS;
  const isTrailingLast =
    lobby.status === 'judging' &&
    stepIndex === SCRIPT.length - 1 &&
    lobby.finishedAt !== undefined &&
    now - lobby.finishedAt < CHUNK_GRACE_MS;
  return isCurrent || isTrailingPrev || isTrailingLast;
}

/** Recorded audio for a turn (server-STT mode). A turn may arrive as several
    blobs — a phone that locks mid-turn flushes a partial recording and starts
    a fresh one on return — so blobs APPEND (bounded) and each is transcribed;
    their texts join for that step. */
export function acceptAudioTurn(
  lobby: Lobby,
  sender: Participant,
  stepIndex: number,
  mime: string,
  data: Buffer,
): void {
  if (!lobby.debateCompleted && lobby.status !== 'in_debate') return;
  if (!turnIsAcceptable(lobby, sender, stepIndex)) return;
  const side = sideOf(lobby, sender)!;
  const forStep = lobby.audioTurns.filter((a) => a.stepIndex === stepIndex && a.side === side);
  if (forStep.length >= 3 || lobby.audioTurns.length >= 18) return;
  lobby.audioTurns.push({ stepIndex, side, mime, data });
  touch(lobby);
}

/** Whisper the recorded turns; where transcription succeeds it REPLACES any
    browser speech chunks for that step (higher quality, esp. Arabic). */
async function applyServerTranscription(lobby: Lobby): Promise<void> {
  if (lobby.audioTurns.length === 0) return;
  const turns = lobby.audioTurns;
  lobby.audioTurns = []; // free the buffers regardless of outcome
  const results = await Promise.all(
    turns.map(async (turn) => ({ turn, text: await transcribe(turn.data) })),
  );
  // Group by step, keep upload order, join partial recordings into one text.
  const bySteps = new Map<number, { side: Side; texts: string[] }>();
  for (const { turn, text } of results) {
    if (!text) continue; // keep whatever browser chunks exist for this step
    const entry = bySteps.get(turn.stepIndex) ?? { side: turn.side, texts: [] };
    entry.texts.push(text);
    bySteps.set(turn.stepIndex, entry);
  }
  for (const [stepIndex, { side, texts }] of bySteps) {
    lobby.transcript = lobby.transcript.filter((e) => e.stepIndex !== stepIndex);
    lobby.transcript.push({ stepIndex, side, text: texts.join(' '), at: Date.now() });
  }
}

export function acceptChunk(lobby: Lobby, sender: Participant, chunk: SpeechChunk): void {
  // A payload-less emit must be a no-op, not an uncaughtException that takes
  // down every live debate on the box.
  if (!chunk || typeof chunk !== 'object') return;
  if (!lobby.debateCompleted && lobby.status !== 'in_debate') return;
  if (lobby.transcript.length >= MAX_TRANSCRIPT_ENTRIES) return;

  const text = String(chunk.text ?? '').trim().slice(0, MAX_CHUNK_CHARS);
  if (!text) return;
  if (!turnIsAcceptable(lobby, sender, chunk.stepIndex)) return;

  const side = sideOf(lobby, sender)!;
  lobby.transcript.push({ stepIndex: chunk.stepIndex, side, text, at: Date.now() });
  touch(lobby);
}
