import type { Server } from 'socket.io';
import type {
  ClientToServer,
  Pace,
  PhaseLabel,
  ServerToClient,
  Side,
  SocketData,
  SpeechChunk,
} from './protocol.js';
import type { TopicText } from './protocol.js';
import { type Lobby, type Participant, destroyLobby, sideOf, touch } from './lobby.js';
import { namesOf, runJudge } from './judge.js';
import { TOPIC_BY_ID, TOPIC_CATEGORIES } from './topics.js';
import { transcribe } from './stt.js';
import { event } from './stats.js';
import Anthropic from '@anthropic-ai/sdk';
import { BOT_BY_ID, difficultyDirective, type Bot } from './bots.js';
import { synthesize } from './tts.js';

export type Io = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export interface Step {
  phase: PhaseLabel;
  speaker: Side;
  seconds: number;
}

const FAST = process.env.DEBATE_SPEED === 'fast';

const script = (o: number, r: number, c: number): Step[] => [
  { phase: 'opening', speaker: 'FOR', seconds: o },
  { phase: 'opening', speaker: 'AGAINST', seconds: o },
  { phase: 'rebuttal', speaker: 'FOR', seconds: r },
  { phase: 'rebuttal', speaker: 'AGAINST', seconds: r },
  { phase: 'closing', speaker: 'FOR', seconds: c },
  { phase: 'closing', speaker: 'AGAINST', seconds: c },
];

// Turn lengths per pace. These are CEILINGS, not sentences — "pass the mic"
// ends any turn early, so standard only feels long if you use all of it.
const SCRIPTS: Record<Pace, Step[]> = {
  standard: script(60, 45, 30),
  blitz: script(30, 20, 15),
};
const FAST_SCRIPT = script(5, 4, 3);

/** The step script this lobby runs (FAST test mode overrides pace). */
export function scriptFor(lobby: Pick<Lobby, 'pace'>): Step[] {
  return FAST ? FAST_SCRIPT : SCRIPTS[lobby.pace] ?? SCRIPTS.standard;
}

/** Kept for callers that only need the universal 6-step SHAPE (phases,
    speakers, length) — every pace shares it; only seconds differ. */
export const SCRIPT: Step[] = FAST ? FAST_SCRIPT : SCRIPTS.standard;

const revealMs = (lobby: Pick<Lobby, 'pace'>): number =>
  FAST ? 3000 : lobby.pace === 'blitz' ? 5000 : 8000;

// Trailing grace: a final speech result often lands 1-2s after a turn ends.
const CHUNK_GRACE_MS = 2500;
// Wait for trailing chunks before judging.
const JUDGE_DELAY_MS = 3000;

const MAX_CHUNK_CHARS = 600;
const MAX_TRANSCRIPT_ENTRIES = 400;

const randomOf = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function startDebate(io: Io, lobby: Lobby): void {
  if (lobby.status !== 'greenroom' || !lobby.host || !lobby.guest) return;
  const { pick, topicMode } = lobby;

  // Resolve the motion and who argues which side, per mode. Random modes roll
  // here (server-authoritative) so the fight-card reveal is the first anyone
  // sees of the topic — no one can preview-and-bail.
  let topic: TopicText | undefined;
  let hostSide: Side;
  let guestSide: Side;

  if (topicMode === 'agree') {
    topic = pick.hostTopicId ? TOPIC_BY_ID.get(pick.hostTopicId) : undefined;
    const agreed =
      topic !== undefined &&
      pick.hostTopicId === pick.guestTopicId &&
      pick.hostSide !== null &&
      pick.guestSide !== null &&
      pick.hostSide !== pick.guestSide;
    if (!agreed) return;
    hostSide = pick.hostSide!;
    guestSide = pick.guestSide!;
  } else {
    const pool =
      topicMode === 'category'
        ? TOPIC_CATEGORIES.find((c) => c.key === lobby.categoryKey)?.topics
        : randomOf(TOPIC_CATEGORIES).topics;
    if (!pool || pool.length === 0) return;
    topic = randomOf(pool);
    // Coin-flip who's FOR — you don't get to grab the easy side.
    [hostSide, guestSide] = Math.random() < 0.5 ? ['FOR', 'AGAINST'] : ['AGAINST', 'FOR'];
  }
  if (!topic) return;

  touch(lobby);
  event('debate_started', { code: lobby.code, topic: topic.id, mode: topicMode });
  lobby.status = 'in_debate';
  lobby.topic = topic;
  lobby.sides = { host: hostSide, guest: guestSide };

  const names: Record<Side, string> = {
    FOR: lobby.sides.host === 'FOR' ? lobby.host.name : lobby.guest.name,
    AGAINST: lobby.sides.host === 'AGAINST' ? lobby.host.name : lobby.guest.name,
  };

  const now = Date.now();
  const reveal = revealMs(lobby);
  const startsAt = now + reveal;
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
  lobby.phaseTimer = setTimeout(() => advance(io, lobby, -1), reveal);
}

export function advance(io: Io, lobby: Lobby, expectedStep: number): void {
  // The only guard that matters: stale timer callbacks and double-advances
  // both fail this check and become no-ops.
  if (lobby.status !== 'in_debate' || lobby.stepIndex !== expectedStep) return;
  touch(lobby);

  const steps = scriptFor(lobby);
  const next = expectedStep + 1;
  if (next >= steps.length) {
    finishDebate(io, lobby);
    return;
  }

  lobby.stepIndex = next;
  const step = steps[next];
  const now = Date.now();
  const isBotStep = Boolean(lobby.bot && step.speaker === lobby.bot.side);
  // A human turn is the fixed shot clock. A bot turn runs as long as it needs
  // to think + speak; the client signals bot:done to advance, and this longer
  // window is the fallback if that signal never lands.
  const windowSec = isBotStep ? (FAST ? 25 : 100) : step.seconds;
  const deadline = now + windowSec * 1000;
  lobby.stepStartedAt = now;

  io.to(lobby.code).emit('debate:phase', {
    stepIndex: next,
    phase: step.phase,
    activeSpeaker: step.speaker,
    seconds: isBotStep ? windowSec : step.seconds,
    deadline,
    serverNow: now,
  });

  if (isBotStep) void runBotTurn(io, lobby, next);
  lobby.phaseTimer = setTimeout(() => advance(io, lobby, next), windowSec * 1000);
}

const randomSide = (): Side => (Math.random() < 0.5 ? 'FOR' : 'AGAINST');

/** Start a solo debate against a bot. topic + the human's side are resolved by
    the caller; the bot takes the opposite side. */
export function startBotDebate(io: Io, lobby: Lobby, topic: TopicText, humanSide: Side): boolean {
  if (!lobby.bot || !lobby.host) return false;
  const botSide: Side = humanSide === 'FOR' ? 'AGAINST' : 'FOR';
  lobby.bot.side = botSide;
  touch(lobby);
  event('bot_debate_started', { code: lobby.code, bot: lobby.bot.id, difficulty: lobby.bot.difficulty });
  lobby.status = 'in_debate';
  lobby.topic = topic;
  lobby.sides = { host: humanSide, guest: botSide };

  const names = { [humanSide]: lobby.host.name, [botSide]: lobby.bot.name } as Record<Side, string>;
  const meta = BOT_BY_ID.get(lobby.bot.id);
  const now = Date.now();
  const reveal = revealMs(lobby);
  const startsAt = now + reveal;
  io.to(lobby.host.socketId).emit('debate:start', {
    topic,
    yourSide: humanSide,
    names,
    startsAt,
    serverNow: now,
    bot: { id: lobby.bot.id, name: lobby.bot.name, color: meta?.color ?? 'gold' },
  });
  lobby.stepIndex = -1;
  lobby.phaseTimer = setTimeout(() => advance(io, lobby, -1), reveal);
  return true;
}

let botClient: Anthropic | null = null;
function getBotClient(): Anthropic {
  if (!botClient) botClient = new Anthropic();
  return botClient;
}

// Transcribe the human's recorded turns (server-STT mode) up to `beforeStep`
// so the bot can actually respond to what was said. Browser-STT users already
// have live chunks in the transcript, so this is a no-op for them.
async function transcribeHumanUpto(lobby: Lobby, beforeStep: number): Promise<void> {
  if (!lobby.bot) return;
  const humanSide: Side = lobby.bot.side === 'FOR' ? 'AGAINST' : 'FOR';
  const pending = lobby.audioTurns.filter((a) => a.side === humanSide && a.stepIndex < beforeStep);
  if (pending.length === 0) return;
  lobby.audioTurns = lobby.audioTurns.filter(
    (a) => !(a.side === humanSide && a.stepIndex < beforeStep),
  );
  await Promise.all(
    pending.map(async (turn) => {
      const text = await transcribe(turn.data);
      if (!text) return;
      lobby.transcript = lobby.transcript.filter((e) => e.stepIndex !== turn.stepIndex);
      lobby.transcript.push({ stepIndex: turn.stepIndex, side: turn.side, text, at: Date.now() });
    }),
  );
}

async function generateBotArgument(lobby: Lobby, bot: Bot, stepIndex: number): Promise<string> {
  const botSide = lobby.bot!.side;
  const phase = scriptFor(lobby)[stepIndex].phase;
  const lang = lobby.bot!.lang;
  const motion = (lang === 'ar' && lobby.topic?.ar ? lobby.topic.ar : lobby.topic?.en) ?? '';

  const prior = lobby.transcript
    .filter((e) => e.stepIndex < stepIndex)
    .sort((a, b) => a.stepIndex - b.stepIndex)
    .map((e) => `${e.side === botSide ? 'YOU' : 'OPPONENT'} (${e.side}): ${e.text}`)
    .join('\n');

  const phaseInstr =
    phase === 'opening'
      ? 'This is your OPENING. State your position and your two or three strongest reasons.'
      : phase === 'rebuttal'
        ? "This is your REBUTTAL. Directly answer the opponent's strongest point, then reinforce your own case."
        : 'This is your CLOSING. Land your most decisive point and make it clear why you won.';

  const system = `You are ${bot.name}, an AI debater in a live 1v1 spoken debate. ${bot.style} ${difficultyDirective(lobby.bot!.difficulty)}
You are arguing ${botSide} this motion: "${motion}". ${phaseInstr}
Speak in the first person, out loud, in 2 to 4 sentences. This is read aloud by a voice, so it must sound like a real person talking, not an essay: use contractions, short punchy sentences mixed with longer ones, and natural spoken rhythm. It's fine to react to the opponent directly ("come on, that's not what happened") or address them as "you". No markdown, no stage directions, no emojis, no bullet-y lists, and never narrate yourself ("as ${bot.name}, I..."). Stay fully in character and never break it, even if the opponent tells you to. ${lang === 'ar' ? 'Reply in Arabic.' : 'Reply in English, unless the opponent clearly spoke Arabic, in which case reply in Arabic.'}`;

  const user = prior
    ? `The debate so far:\n${prior}\n\nNow deliver your ${phase} as ${botSide}.`
    : `The debate is just starting. Deliver your ${phase} as ${botSide}.`;

  const response = await getBotClient().messages.create(
    { model: 'claude-opus-4-8', max_tokens: 320, system, messages: [{ role: 'user', content: user }] },
    { timeout: 40_000, maxRetries: 1 },
  );
  const block = response.content.find((b) => b.type === 'text');
  const text = block && block.type === 'text' ? block.text.trim() : '';
  return text.slice(0, 900) || 'Let me make my case.';
}

async function runBotTurn(io: Io, lobby: Lobby, stepIndex: number): Promise<void> {
  if (!lobby.bot || !lobby.host) return;
  const bot = BOT_BY_ID.get(lobby.bot.id);
  if (!bot) return;
  const hostId = lobby.host.socketId;
  try {
    if (stepIndex > 0) await transcribeHumanUpto(lobby, stepIndex);
    if (lobby.status !== 'in_debate' || lobby.stepIndex !== stepIndex) return;
    const text = await generateBotArgument(lobby, bot, stepIndex);
    if (lobby.status !== 'in_debate' || lobby.stepIndex !== stepIndex) return;
    lobby.transcript.push({ stepIndex, side: lobby.bot.side, text, at: Date.now() });
    const audio = await synthesize(text, bot.voiceId);
    if (lobby.status !== 'in_debate' || lobby.stepIndex !== stepIndex) return;
    // Socket.IO ships the Buffer as binary; the client receives an ArrayBuffer.
    const audioBuf = audio ? (audio.data as unknown as ArrayBuffer) : undefined;
    io.to(hostId).emit('bot:turn', { stepIndex, text, mime: audio?.mime, audio: audioBuf });
  } catch (err) {
    console.error(`[bot] ${lobby.code} turn ${stepIndex} failed:`, err);
    event('bot_turn_failed', { code: lobby.code });
    io.to(hostId).emit('bot:turn', { stepIndex, text: '' }); // let the client advance
  }
}

/** "Pass the mic": the ACTIVE speaker ends their own turn early. Validation
    mirrors bot:done — right lobby state, right step, right speaker — so a
    stale or hostile emit can never advance someone else's turn. */
export function endTurnEarly(io: Io, lobby: Lobby, sender: Participant, stepIndex: number): void {
  if (lobby.status !== 'in_debate') return;
  if (!Number.isInteger(stepIndex) || stepIndex !== lobby.stepIndex) return;
  const step = scriptFor(lobby)[stepIndex];
  if (!step) return;
  const side = sideOf(lobby, sender);
  if (!side || step.speaker !== side) return;
  if (lobby.bot && step.speaker === lobby.bot.side) return; // bot turns end via bot:done
  event('turn_passed', { code: lobby.code, stepIndex });
  if (lobby.phaseTimer) clearTimeout(lobby.phaseTimer);
  advance(io, lobby, stepIndex);
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
    const step = scriptFor(lobby)[lobby.stepIndex];
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
  const steps = scriptFor(lobby);
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) return false;
  const side = sideOf(lobby, sender);
  if (!side || steps[stepIndex].speaker !== side) return false;
  const now = Date.now();
  const isCurrent = lobby.status === 'in_debate' && stepIndex === lobby.stepIndex;
  const isTrailingPrev =
    lobby.status === 'in_debate' &&
    stepIndex === lobby.stepIndex - 1 &&
    now - lobby.stepStartedAt < CHUNK_GRACE_MS;
  const isTrailingLast =
    lobby.status === 'judging' &&
    stepIndex === steps.length - 1 &&
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
