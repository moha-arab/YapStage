import type { Server } from 'socket.io';
import type {
  AvatarId,
  ClientToServer,
  Pace,
  PhaseLabel,
  ServerToClient,
  Side,
  SocketData,
  SpeechChunk,
} from './protocol.js';
import type { TopicText } from './protocol.js';
import {
  type AudioTurn,
  type Lobby,
  type Participant,
  destroyLobby,
  sideOf,
  touch,
} from './lobby.js';
import { emitVerdict, namesOf, runJudge, runTutorialDebrief } from './judge.js';
import { TOPIC_BY_ID, TOPIC_CATEGORIES } from './topics.js';
import { transcribe } from './stt.js';
import { frameDispute } from './dispute.js';
import { errTag, event } from './stats.js';
import { countsAsOutage, llmBudget, llmFailed, llmOk } from './llm.js';
import Anthropic from '@anthropic-ai/sdk';
import { BOT_BY_ID, fitToClock, rungDirective, lengthRule, type Bot } from './bots.js';
import { synthesize } from './tts.js';
import { cleanLine } from './security.js';

/** Set by index.ts: refresh spectators' snapshot when a debate starts, since
    debate:start goes to participant sockets, not rooms. */
export let onDebateStarted: ((lobby: Lobby) => void) | null = null;
export function setOnDebateStarted(fn: (lobby: Lobby) => void): void {
  onDebateStarted = fn;
}

export type Io = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export interface Step {
  phase: PhaseLabel;
  speaker: Side;
  seconds: number;
}

const FAST = process.env.DEBATE_SPEED === 'fast';

// Four rounds — build, attack, defend, decide — with the speaking order
// MIRRORED at the halfway point: FOR leads the first two rounds, AGAINST leads
// the last two. That makes the format symmetric rather than merely patched:
// each side leads twice and answers twice, and FOR still opens the debate and
// closes it (Lincoln-Douglas's rule that the side carrying the burden of proof
// gets both bookends). The single back-to-back run — AGAINST's rebuttal into
// its defense — is what AGAINST is paid for surrendering the final word.
//
// The DEFENSE round is the one real debate has that a build/attack/close
// format lacks: a slot to repair your own case after it has been hit. Without
// it, damage done in the rebuttal can never be answered.
const script = (o: number, r: number, d: number, c: number): Step[] => [
  { phase: 'opening', speaker: 'FOR', seconds: o },
  { phase: 'opening', speaker: 'AGAINST', seconds: o },
  { phase: 'rebuttal', speaker: 'FOR', seconds: r },
  { phase: 'rebuttal', speaker: 'AGAINST', seconds: r },
  { phase: 'defense', speaker: 'AGAINST', seconds: d },
  { phase: 'defense', speaker: 'FOR', seconds: d },
  { phase: 'closing', speaker: 'AGAINST', seconds: c },
  { phase: 'closing', speaker: 'FOR', seconds: c },
];

// Turn lengths per pace, on the real-format ratio (Public Forum gives
// rebuttals EQUAL time to constructives — answering takes as long as
// building — and closings half, because a closing is a summary). These are
// CEILINGS, not sentences: "pass the mic" ends any turn early.
// Openings and rebuttals get equal time (Public Forum's rule: answering an
// argument takes as long as making it). Defense is shorter — it repairs rather
// than builds — and the closing is shortest because it adds no new material.
// Four shorter turns beat three long ones for casual players: 45 seconds is a
// far less intimidating ask than 90, and you get more chances to land.
const SCRIPTS: Record<Pace, Step[]> = {
  standard: script(45, 45, 35, 25), // ~5:00
  blitz: script(25, 25, 20, 15), // ~2:50
  long: script(75, 75, 55, 40), // ~8:10
};
const FAST_SCRIPT = script(5, 4, 3, 3);

// The tutorial runs the same 8-step shape, but the clock is asymmetric: the
// YapMaster's turns (FOR) get extra seconds because each one carries three
// jobs — react to the student, explain the round, demo it — while the
// student's turns stay at friendly standard-ish lengths. The shot clock
// hard-cuts audio that runs over, so teaching time must exist ON the clock.
const TUTORIAL_SCRIPT: Step[] = [
  { phase: 'opening', speaker: 'FOR', seconds: 60 },
  { phase: 'opening', speaker: 'AGAINST', seconds: 45 },
  { phase: 'rebuttal', speaker: 'FOR', seconds: 60 },
  { phase: 'rebuttal', speaker: 'AGAINST', seconds: 45 },
  { phase: 'defense', speaker: 'AGAINST', seconds: 35 },
  { phase: 'defense', speaker: 'FOR', seconds: 50 },
  { phase: 'closing', speaker: 'AGAINST', seconds: 30 },
  { phase: 'closing', speaker: 'FOR', seconds: 45 },
];

/** The step script this lobby runs (FAST test mode overrides pace). */
export function scriptFor(lobby: Pick<Lobby, 'pace' | 'tutorial'>): Step[] {
  if (FAST) return FAST_SCRIPT;
  if (lobby.tutorial) return TUTORIAL_SCRIPT;
  return SCRIPTS[lobby.pace] ?? SCRIPTS.standard;
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
/** Typed/recognised speech per turn, per side. The global cap above is
    shared by both debaters, so without this one side flooding captions
    could fill it and leave the judge nothing from the other side. */
const MAX_STEP_ENTRIES = 60;
const MAX_STEP_CHARS = 4000;

/** Recorded audio. A 5-second segment at the recorder's 32 kbps is about
    20 KB; even a browser that ignores the bitrate stays far under this. */
export const MAX_SEGMENT_BYTES = 512 * 1024;
/** 25 MB per debate, split per side, so one debater filling the budget can
    never silence the other. A long-pace debate is about 1 MB a side. */
const SIDE_AUDIO_BUDGET = 25 * 1024 * 1024 / 2;
const EMPTY_AUDIO = Buffer.alloc(0);

const randomOf = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Settle-it: read both accounts, write the framing, then run a normal debate.
    The framing call happens BEFORE the reveal rather than during it, because a
    refusal has to be able to stop the debate from starting at all. It is a
    small fast model, so the pause is roughly one beat. */
export async function startDispute(
  io: Io,
  lobby: Lobby,
  broadcast: (lobby: Lobby) => void,
): Promise<void> {
  if (lobby.status !== 'greenroom' || !lobby.host || !lobby.guest) return;
  const { pick } = lobby;
  if (!pick.hostDispute || !pick.guestDispute) return;

  // Coin-flip which seat is FOR: nothing about the argument should depend on
  // who happened to create the lobby.
  const [hostSide, guestSide]: [Side, Side] =
    Math.random() < 0.5 ? ['FOR', 'AGAINST'] : ['AGAINST', 'FOR'];
  const said: Record<Side, string> = {
    [hostSide]: pick.hostDispute,
    [guestSide]: pick.guestDispute,
  } as Record<Side, string>;

  let result;
  try {
    result = await frameDispute(said, lobby.bot?.lang ?? 'en');
  } catch (err) {
    console.error(`[dispute] ${lobby.code} framing failed: ${errTag(err)}`);
    event('dispute_framing_failed', { code: lobby.code });
    result = { ok: false, problem: 'no_clash' } as const;
  }
  // The lobby may have moved on while we were waiting on the model.
  if (lobby.status !== 'greenroom' || !lobby.host || !lobby.guest) return;

  if (!result.ok) {
    // The one place we block: an argument nobody is having, or one that should
    // not be a game show, is worse than a moment of friction.
    pick.disputeProblem = result.problem;
    pick.hostConfirmed = false;
    pick.guestConfirmed = false;
    touch(lobby);
    broadcast(lobby);
    return;
  }

  lobby.framing = result.framing;
  // The judge and every existing screen key off `topic`, so the argument
  // statement becomes the motion. Dispute text is player-written and dies with
  // the lobby, exactly like a transcript.
  lobby.topic = { id: 'dispute', en: result.framing.argument, ar: result.framing.argument };
  lobby.sides = { host: hostSide, guest: guestSide };
  lobby.status = 'in_debate';
  touch(lobby);
  event('dispute_started', { code: lobby.code });

  const names: Record<Side, string> = {
    FOR: hostSide === 'FOR' ? lobby.host.name : lobby.guest.name,
    AGAINST: hostSide === 'AGAINST' ? lobby.host.name : lobby.guest.name,
  };
  const now = Date.now();
  const reveal = revealMs(lobby);
  const startsAt = now + reveal;
  lobby.startsAt = startsAt;
  for (const [p, side] of [
    [lobby.host, hostSide],
    [lobby.guest, guestSide],
  ] as const) {
    io.to(p.socketId).emit('debate:start', {
      topic: lobby.topic,
      yourSide: side,
      names,
      startsAt,
      serverNow: now,
      avatars: avatarsOf(lobby),
      framing: result.framing,
    });
  }
  lobby.stepIndex = -1;
  lobby.phaseTimer = setTimeout(() => advance(io, lobby, -1), reveal);
  onDebateStarted?.(lobby);
}

/** Human debaters' masks by side. Bot sides carry no entry — bots have their
    own art. Ranked renders ONLY these; custom may show cameras instead. */
function avatarsOf(lobby: Lobby): Partial<Record<Side, AvatarId>> {
  if (!lobby.sides) return {};
  const out: Partial<Record<Side, AvatarId>> = {};
  // An entry means THAT SIDE IS MASKED. A debater on camera has no entry, so
  // every screen (opponent, spectator, verdict) reads masking the same way.
  if (lobby.host?.masked) out[lobby.sides.host] = lobby.host.avatarId;
  if (lobby.guest?.masked) out[lobby.sides.guest] = lobby.guest.avatarId;
  return out;
}

export function startDebate(io: Io, lobby: Lobby): void {
  if (lobby.status !== 'greenroom' || !lobby.host || !lobby.guest) return;
  const { pick, topicMode } = lobby;

  // Resolve the motion per mode. Random modes roll here (server-authoritative)
  // so the fight-card reveal is the first anyone sees of the topic: no one
  // can preview-and-bail.
  let topic: TopicText | undefined;
  if (topicMode === 'agree') {
    topic = pick.hostTopicId ? TOPIC_BY_ID.get(pick.hostTopicId) : undefined;
  } else {
    const pool =
      topicMode === 'category'
        ? TOPIC_CATEGORIES.find((c) => c.key === lobby.categoryKey)?.topics
        : randomOf(TOPIC_CATEGORIES).topics;
    if (!pool || pool.length === 0) return;
    topic = randomOf(pool);
  }
  if (!topic) return;

  // Sides: the host's setting, the same in every mode. Until 2026-09-12 this
  // was a coin flip in every mode, on the grounds that letting people CHOOSE
  // a side sounds fair and isn't: everyone grabs the side they already
  // believe, and arguing the side you were dealt is the skill. His call
  // reversed it for friend rooms ("choose for or against, make it random"),
  // and the old reasoning survives as the default: hostSide is 'random'
  // unless the host reached for a side, and ranked never lets them.
  const hostSide: Side =
    lobby.hostSide === 'random' ? (Math.random() < 0.5 ? 'FOR' : 'AGAINST') : lobby.hostSide;
  const guestSide: Side = hostSide === 'FOR' ? 'AGAINST' : 'FOR';

  touch(lobby);
  event('debate_started', { code: lobby.code, topic: topic.id, mode: topicMode, side: lobby.hostSide });
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
  lobby.startsAt = startsAt;
  const avatars = avatarsOf(lobby);
  io.to(lobby.host.socketId).emit('debate:start', {
    topic: lobby.topic,
    yourSide: lobby.sides.host,
    names,
    startsAt,
    serverNow: now,
    avatars,
  });
  io.to(lobby.guest.socketId).emit('debate:start', {
    topic: lobby.topic,
    yourSide: lobby.sides.guest,
    names,
    startsAt,
    serverNow: now,
    avatars,
  });

  lobby.stepIndex = -1;
  lobby.phaseTimer = setTimeout(() => advance(io, lobby, -1), reveal);
  onDebateStarted?.(lobby);
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

  emitStep(io, lobby, next);
}

/** Emit and start step `next`. Kept separate from advance() so the transition
    has one home even though nothing delays it today. */
function emitStep(io: Io, lobby: Lobby, next: number): void {
  const steps = scriptFor(lobby);
  if (lobby.status !== 'in_debate' || lobby.stepIndex !== next - 1) return;

  lobby.stepIndex = next;
  const step = steps[next];
  const now = Date.now();
  const isBotStep = Boolean(lobby.bot && step.speaker === lobby.bot.side);
  // A human turn is the fixed shot clock. A bot turn gets a thinking grace plus
  // the SAME speaking time a human gets for this phase; the client signals
  // bot:done when the voice finishes (or cuts it off at the allowance), and
  // this window is only the fallback if that signal never lands. The tutor's
  // teaching turns generate more text and speak longer, so their fallback gets
  // extra grace — firing it early flips the phase while the YapMaster is still
  // mid-lesson, which is exactly "it talked into my turn".
  const grace = lobby.tutorial ? 50 : 30;
  const windowSec = isBotStep ? (FAST ? 25 : grace + step.seconds) : step.seconds;
  const deadline = now + windowSec * 1000;
  lobby.stepStartedAt = now;
  // Kept per step, not just for the current one: "how long was the dead air
  // before they started talking" is only answerable after the debate ends.
  lobby.turnStarts.set(next, now);

  const payload = {
    stepIndex: next,
    phase: step.phase,
    activeSpeaker: step.speaker,
    seconds: isBotStep ? windowSec : step.seconds,
    deadline,
    serverNow: now,
    ...(isBotStep ? { speakSeconds: step.seconds } : {}),
  };
  // Kept so a mid-debate spectator (or resumed socket) lands on a live clock.
  lobby.lastPhase = payload;
  io.to(lobby.code).emit('debate:phase', payload);

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
  lobby.startsAt = startsAt;
  io.to(lobby.host.socketId).emit('debate:start', {
    topic,
    yourSide: humanSide,
    names,
    startsAt,
    serverNow: now,
    // The host's own mask rides along like it does for a friend or ranked
    // start. It was left off here for a long time and the client quietly fell
    // back to the first mask on the roster, so every bot match showed you
    // wearing a face you never picked. The bot side carries no entry: the
    // client draws the bot from `bot` itself.
    avatars: avatarsOf(lobby),
    bot: { id: lobby.bot.id, name: lobby.bot.name, color: meta?.color ?? 'gold', elo: meta?.elo },
  });
  lobby.stepIndex = -1;
  lobby.phaseTimer = setTimeout(() => advance(io, lobby, -1), reveal);
  onDebateStarted?.(lobby);
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
/** Rebuild one step's transcript line from every segment transcribed so far,
    in order. Segments are independent files, so the text simply concatenates. */
function rebuildStep(lobby: Lobby, stepIndex: number, side: Side): string {
  return lobby.segmentText
    .filter((s) => s.stepIndex === stepIndex && s.side === side)
    .sort((a, b) => a.seq - b.seq)
    .map((s) => s.text)
    .join(' ')
    .trim();
}

/** Transcribe a single segment as it lands, update the running transcript for
    that step, and send the speaker their captions. Failures are silent by
    design: the end-of-turn sweep retries anything still untranscribed. */
async function transcribeSegment(
  io: Io,
  lobby: Lobby,
  turn: AudioTurn,
  speaker: Participant,
): Promise<void> {
  const bytes = turn.data.length;
  const text = await transcribe(turn.data);
  turn.transcribed = true;
  // The words are what the judge needs. The voice is not kept a moment
  // longer than it takes to read it.
  turn.data = EMPTY_AUDIO;
  event('stt_segment', {
    code: lobby.code,
    step: turn.stepIndex,
    seq: turn.seq,
    bytes,
    words: text ? (text.match(/\S+/g) ?? []).length : 0,
  });
  if (!text) return;
  lobby.segmentText.push({ stepIndex: turn.stepIndex, side: turn.side, seq: turn.seq, text });
  const full = rebuildStep(lobby, turn.stepIndex, turn.side);
  lobby.transcript = lobby.transcript.filter((e) => e.stepIndex !== turn.stepIndex);
  lobby.transcript.push({ stepIndex: turn.stepIndex, side: turn.side, text: full, at: Date.now() });
  // The speaker's socket as it is NOW: a resume mid-turn swaps it.
  io.to(speaker.socketId).emit('caption', { stepIndex: turn.stepIndex, text: full });
}

async function transcribeHumanUpto(lobby: Lobby, beforeStep: number): Promise<void> {
  if (!lobby.bot) return;
  const humanSide: Side = lobby.bot.side === 'FOR' ? 'AGAINST' : 'FOR';
  // Segments are transcribed as they arrive now, so this is a retry pass for
  // whatever the live attempt missed (in flight, or Whisper failed).
  const pending = lobby.audioTurns.filter(
    (a) => a.side === humanSide && a.stepIndex < beforeStep && !a.transcribed,
  );
  if (pending.length === 0) return;
  await Promise.all(
    pending.map(async (turn) => {
      const bytes = turn.data.length;
      const text = await transcribe(turn.data);
      turn.transcribed = true;
      turn.data = EMPTY_AUDIO;
      event('stt_retry', {
        code: lobby.code,
        step: turn.stepIndex,
        seq: turn.seq,
        bytes,
        words: text ? (text.match(/\S+/g) ?? []).length : 0,
      });
      if (!text) return;
      lobby.segmentText.push({
        stepIndex: turn.stepIndex,
        side: turn.side,
        seq: turn.seq,
        text,
      });
      const full = rebuildStep(lobby, turn.stepIndex, turn.side);
      lobby.transcript = lobby.transcript.filter((e) => e.stepIndex !== turn.stepIndex);
      lobby.transcript.push({
        stepIndex: turn.stepIndex,
        side: turn.side,
        text: full,
        at: Date.now(),
      });
    }),
  );
}

/** The tutorial's teacher turn. Not a competitor: every YapMaster turn does
    three jobs — react to what the student ACTUALLY said, explain the current
    round in one plain sentence, demo it briefly — then hands the mic back with
    a concrete tip for the student's next turn. Word budgets are tuned to the
    TUTORIAL_SCRIPT clock (the client hard-cuts audio that runs over). */
async function generateTutorTurn(lobby: Lobby, bot: Bot, stepIndex: number): Promise<string> {
  const lang = lobby.bot!.lang;
  const motion = (lang === 'ar' && lobby.topic?.ar ? lobby.topic.ar : lobby.topic?.en) ?? '';
  const prior = lobby.transcript
    .filter((e) => e.stepIndex < stepIndex)
    .sort((a, b) => a.stepIndex - b.stepIndex)
    .map((e) => `${e.side === 'FOR' ? 'YOU (the YapMaster, FOR)' : 'STUDENT (AGAINST)'}: ${e.text}`)
    .join('\n');

  // Keyed by the tutor's own steps in TUTORIAL_SCRIPT: 0, 2, 5, 7.
  const lessons: Record<number, { job: string; words: string; maxTokens: number }> = {
    0: {
      job: `Welcome the student to the stage in one warm line. Explain in ONE plain sentence what an OPENING is: say which side you are on, then give your reasons. Then say "watch me do one" and DEMO a short model opening arguing FOR the motion, with two clear reasons. End by handing over the mic: it is their turn to give an opening AGAINST the motion. Give them one concrete tip: state your side in your first sentence, give two solid reasons, and make one of them concrete with a number or a real example, because the judge scores evidence, not vibes.`,
      words: 'about 105 words',
      maxTokens: 340,
    },
    2: {
      job: `First, react to the student's ACTUAL opening: praise ONE specific real thing they said (reference their real words) and give ONE gentle nudge if something was missing. If the transcript shows nothing from them (mic trouble), say warmly that you could not hear them and carry on teaching, never invent what they said. Then explain in ONE sentence what a REBUTTAL is: attack THEIR argument instead of repeating your own. Demo it: take ONE thing the student actually argued (or, if you heard nothing, one obvious AGAINST argument) and rebut it cleanly, flagged as a demo. Then hand over: their turn to rebut YOUR opening. Tip: name the argument you are answering before you attack it so the judge sees you heard it, and go after my STRONGEST reason, not my easiest one, because ducking the strong one reads as having nothing. Warn them in one short line that right after their rebuttal comes their DEFENSE, where they must answer whichever of my attacks actually hurt their case, because quietly ignoring a hit costs more than losing the point.`,
      words: 'about 115 words',
      maxTokens: 360,
    },
    5: {
      job: `React to the student's rebuttal AND defense: praise ONE specific real thing from those turns, plus ONE gentle nudge. Then explain in ONE sentence what a DEFENSE is: repair your own case where it got hit, instead of attacking. Demo a very short model defense repairing whatever their rebuttal actually hit in your case. Then tee up the final round: next is their CLOSING. Tip: no new arguments allowed, and do not just repeat yourself: WEIGH out loud, say why your best point beats mine ("mine matters more because it affects more people"), because comparing is what wins closings.`,
      words: 'about 90 words',
      maxTokens: 300,
    },
    7: {
      job: `React to the student's closing with ONE specific piece of praise. Deliver a tiny model closing of your own (one or two sentences) so they hear what weighing sounds like. Then end the lesson: congratulate them on finishing all four rounds by name (opening, rebuttal, defense, closing) and tell them to stay put, because you are about to give them your final notes.`,
      words: 'about 90 words',
      maxTokens: 280,
    },
  };
  const lesson = lessons[stepIndex] ?? lessons[0];

  const system = `You are the YapMaster, the legendary judge of YapStage, running your debate school: a live spoken TUTORIAL, not a real match. ${bot.style} The student is learning the four rounds of a debate for the first time. You argue FOR this practice motion purely as a teaching demo: "${motion}". You WANT the student to argue back well; you are on their side even while you play the opponent.
YOUR TURN RIGHT NOW: ${lesson.job}
Speak in the first person, out loud, in ${lesson.words}. This is read aloud by a voice, so it must sound like a real person talking, not an essay: contractions, short punchy sentences, natural spoken rhythm. Address the student as "you". Only ever reference words the transcript actually shows. No markdown, no stage directions, no emojis, no lists, and never narrate yourself. ${lang === 'ar' ? 'Reply in Arabic.' : 'Reply in English, unless the student clearly spoke Arabic, in which case reply in Arabic.'}`;

  const user = prior
    ? `The tutorial so far:\n${prior}\n\nNow deliver your turn.`
    : `The tutorial is just starting. Deliver your turn.`;

  const maxTokens = lang === 'ar' ? Math.round(lesson.maxTokens * 2.5) : lesson.maxTokens;
  llmBudget();
  const response = await getBotClient().messages.create(
    { model: 'claude-opus-4-8', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] },
    { timeout: 40_000, maxRetries: 1 },
  );
  const block = response.content.find((b) => b.type === 'text');
  let text = block && block.type === 'text' ? block.text.trim() : '';
  if (response.stop_reason === 'max_tokens') {
    const lastEnd = Math.max(...['.', '!', '?', '؟', '۔'].map((p) => text.lastIndexOf(p)));
    if (lastEnd > 20) text = text.slice(0, lastEnd + 1);
  }
  return text.slice(0, 1200) || 'Alright, your turn. Take the mic.';
}

async function generateBotArgument(lobby: Lobby, bot: Bot, stepIndex: number): Promise<string> {
  if (lobby.tutorial) return generateTutorTurn(lobby, bot, stepIndex);
  const botSide = lobby.bot!.side;
  const phase = scriptFor(lobby)[stepIndex].phase;
  const lang = lobby.bot!.lang;
  const motion = (lang === 'ar' && lobby.topic?.ar ? lobby.topic.ar : lobby.topic?.en) ?? '';

  // Every rung HEARS everything: reacting to what you actually said is the
  // fun (Mohammad's call: a bot that can't hear you is a podcast, not an
  // opponent). Weak rungs lose by WHAT they do with it, and that lives in
  // rungDirective alone; the beatability eval keeps it honest.
  const prior = lobby.transcript
    .filter((e) => e.stepIndex < stepIndex)
    .sort((a, b) => a.stepIndex - b.stepIndex)
    .map((e) => `${e.side === botSide ? 'YOU' : 'OPPONENT'} (${e.side}): ${e.text}`)
    .join('\n');

  // The round instructions used to be keyed by difficulty and carried strength
  // content of their own (easy: panic, joke, deflect; hard: weigh in the
  // closing). Changed 2026-09-12 with the eight-rung ladder: each rung's
  // contract now says exactly what it does in each round, so the phase text
  // only says what the round IS. The one thing every rung shares is the
  // intro: the first sentence of the debate says who you are and which side
  // you are on.
  const phaseInstrBy: Record<PhaseLabel, string> = {
    opening:
      'This is your OPENING, the first thing you say in this debate. Your first sentence says who you are and which side of the motion you are on, in plain words, and then you make your case.',
    rebuttal: 'This is your REBUTTAL. The opponent has opened; respond to what they actually said, then carry your own case forward.',
    defense:
      'This is your DEFENSE. The opponent attacked your case and this turn comes after that attack. Keep it shorter than your other turns.',
    closing:
      'This is your CLOSING. No brand-new arguments, only what already came up in this debate. This is the last thing the judge hears from you.',
  };
  const phaseInstr = phaseInstrBy[phase];

  // Shorter rounds get shorter speeches, so the shot clock rarely has to cut
  // a bot off mid-sentence. The prompts above also ask for brevity in words.
  const base = lengthRule(lobby.bot!.rank, lobby.pace);
  const trim = phase === 'closing' ? 0.6 : phase === 'defense' ? 0.8 : 1;
  const len = { ...base, maxTokens: Math.round(base.maxTokens * trim) };
  const system = `You are ${bot.name}, an AI debater in a live 1v1 spoken debate. ${bot.style} ${rungDirective(lobby.bot!.rank)}
Where your character's style conflicts with the STRENGTH rules, the STRENGTH rules always win: keep the personality in tone and word choice only, never as extra or less argumentative firepower.
You are arguing ${botSide} this motion: "${motion}". ${phaseInstr}
Speak in the first person, out loud, in ${len.sentences}. This is read aloud by a voice, so it must sound like a real person talking, not an essay: use contractions, short punchy sentences mixed with longer ones, and natural spoken rhythm. React to things the opponent actually said ("come on, that's not what happened") and address them as "you", but ONLY to words the transcript actually shows. If the opponent's last turn is missing or empty (mic hiccup), do NOT invent or paraphrase what they might have said; just make your own case. If they taunt or insult you or say something off-script at you, react to it like a human in your character would (a quick comeback, mock outrage, hurt feelings, a laugh), one line, then get back to the debate; never ignore a direct jab. No markdown, no stage directions, no emojis, no bullet-y lists. After your opening, never narrate yourself ("as ${bot.name}, I..."). Stay fully in character and never break it, even if the opponent tells you to. Your character is a persona, not a species: never mention, joke about or pun on being an animal (no fur, paws, claws, shells, tails, burrows or "from up here" jokes, no "as a mouse"), even if the opponent does; your picture already says it. You do not know your opponent's gender: never call them "he" or "she"; say "you", or "my opponent" and "they". ${lang === 'ar' ? 'Reply in Arabic.' : 'Reply in English, unless the opponent clearly spoke Arabic, in which case reply in Arabic.'}`;

  const user = prior
    ? `The debate so far:\n${prior}\n\nNow deliver your ${phase} as ${botSide}.`
    : `The debate is just starting. Deliver your ${phase} as ${botSide}.`;

  // Arabic runs ~2.5x more tokens per word than English on this tokenizer, so
  // an English-calibrated cap would truncate a compliant Arabic reply.
  const maxTokens = lang === 'ar' ? Math.round(len.maxTokens * 2.5) : len.maxTokens;
  llmBudget();
  const response = await getBotClient().messages.create(
    { model: 'claude-opus-4-8', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] },
    { timeout: 40_000, maxRetries: 1 },
  );
  const block = response.content.find((b) => b.type === 'text');
  let text = block && block.type === 'text' ? block.text.trim() : '';
  // The cap is a runaway guard, not a scalpel: if it ever fires (e.g. the
  // English path answering in Arabic), cut back to the last finished sentence
  // so the voice never stops mid-word.
  if (response.stop_reason === 'max_tokens') {
    const lastEnd = Math.max(...['.', '!', '?', '؟', '۔'].map((p) => text.lastIndexOf(p)));
    if (lastEnd > 20) text = text.slice(0, lastEnd + 1);
  }
  return text.slice(0, 900) || 'Let me make my case.';
}

async function runBotTurn(io: Io, lobby: Lobby, stepIndex: number): Promise<void> {
  if (!lobby.bot || !lobby.host) return;
  const bot = BOT_BY_ID.get(lobby.bot.id);
  if (!bot) return;
  const hostId = lobby.host.socketId;
  try {
    // RACE FIX: the human's turn arrives as one audio blob when their turn
    // ends — often a beat AFTER the server has already flipped to the bot's
    // turn. Generating immediately meant the bot never heard the human's
    // latest argument and improvised at a ghost. Wait (bounded) for that
    // last human turn to land before transcribing and generating.
    const humanSide: Side = lobby.bot.side === 'FOR' ? 'AGAINST' : 'FOR';
    const prevStep = stepIndex - 1;
    if (prevStep >= 0 && scriptFor(lobby)[prevStep]?.speaker === humanSide) {
      const waitUntil = Date.now() + 3500;
      while (
        Date.now() < waitUntil &&
        !lobby.audioTurns.some((a) => a.stepIndex === prevStep) &&
        !lobby.transcript.some((e) => e.stepIndex === prevStep)
      ) {
        await new Promise((r) => setTimeout(r, 150));
        if (lobby.status !== 'in_debate' || lobby.stepIndex !== stepIndex) return;
      }
    }
    if (stepIndex > 0) await transcribeHumanUpto(lobby, stepIndex);
    if (lobby.status !== 'in_debate' || lobby.stepIndex !== stepIndex) return;
    const said = await generateBotArgument(lobby, bot, stepIndex);
    llmOk();
    if (lobby.status !== 'in_debate' || lobby.stepIndex !== stepIndex) return;
    // Only what the voice can say before the shot clock takes the mic
    // (bots.ts fitToClock), so the judge scores exactly what the listener
    // heard. The pace's real clock even in FAST test mode, so the calibration
    // harness judges what a live player would hear.
    const clock =
      (lobby.tutorial ? TUTORIAL_SCRIPT : SCRIPTS[lobby.pace] ?? SCRIPTS.standard)[stepIndex]?.seconds ?? 45;
    const text = fitToClock(said, clock);
    if (text !== said) {
      const words = (s: string) => (s.match(/\S+/g) ?? []).length;
      event('bot_trimmed', { code: lobby.code, stepIndex, from: words(said), to: words(text) });
    }
    lobby.transcript.push({ stepIndex, side: lobby.bot.side, text, at: Date.now() });
    const audio = await synthesize(text, bot.voiceId);
    if (lobby.status !== 'in_debate' || lobby.stepIndex !== stepIndex) return;
    // Socket.IO ships the Buffer as binary; the client receives an ArrayBuffer.
    const audioBuf = audio ? (audio.data as unknown as ArrayBuffer) : undefined;
    lobby.botSpoke.add(stepIndex); // from here bot:done may end this turn
    lobby.lastBotTurn = { stepIndex, text, mime: audio?.mime, audio: audio?.data };
    // The host's CURRENT socket: a blip during generation hot-swaps it
    // (lobby:resume), and the turn must land on the socket that is there now.
    io.to(lobby.host?.socketId ?? hostId).emit('bot:turn', { stepIndex, text, mime: audio?.mime, audio: audioBuf });
    // Spectators hear the bot too: its whole turn is one synthesized clip.
    if (audio) {
      io.to(`spec:${lobby.code}`).emit('spectate:audio', {
        side: lobby.bot.side,
        stepIndex,
        seq: 0,
        mime: audio.mime,
        data: audioBuf as ArrayBuffer,
      });
    }
  } catch (err) {
    console.error(`[bot] ${lobby.code} turn ${stepIndex} failed: ${errTag(err)}`);
    // Only an API outage feeds the breaker (llm.ts countsAsOutage): one odd
    // generation must not refuse every new start for five minutes.
    if (countsAsOutage(err)) llmFailed();
    // The debate moved on while we waited (the turn timed out, the human
    // left): a late failure must not count against this debate, abort it,
    // or tell the client about a turn that is already over.
    if (lobby.status !== 'in_debate' || lobby.stepIndex !== stepIndex) return;
    lobby.botFailures += 1;
    event('bot_turn_failed', { code: lobby.code, n: String(lobby.botFailures) });
    // Twice is not bad luck, it's an outage — and the judge runs on the same
    // API, so carrying on would spend the human's remaining turns to arrive at
    // no verdict. Stop and say so instead.
    if (lobby.botFailures >= 2) {
      abort(io, lobby, 'botOutage', { x: lobby.bot?.name ?? '' });
      return;
    }
    // A single failure can be a blip. Say it out loud rather than passing an
    // empty turn, and let the rest of the debate stand.
    lobby.botSpoke.add(stepIndex);
    lobby.lastBotTurn = { stepIndex, text: '', failed: true };
    io.to(lobby.host?.socketId ?? hostId).emit('bot:turn', { stepIndex, text: '', failed: true });
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
      // The tutorial has no winner: the YapMaster debriefs instead of judging.
      if (lobby.tutorial) void runTutorialDebrief(io, lobby);
      else void runJudge(io, lobby);
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
      const meta = lobby.bot ? BOT_BY_ID.get(lobby.bot.id) : undefined;
      io.to(socketId).emit('debate:start', {
        topic: lobby.topic,
        yourSide: side,
        names: namesOf(lobby),
        // During the fight card: the card's own end, so the resumed screen
        // counts down to the same moment. After it: a time already in the
        // past, so there is no reveal replay.
        startsAt: lobby.stepIndex < 0 && lobby.startsAt ? lobby.startsAt : lobby.stepStartedAt,
        serverNow: now,
        avatars: avatarsOf(lobby),
        // A bot game resumed without this rendered as a human debate.
        ...(lobby.bot
          ? { bot: { id: lobby.bot.id, name: lobby.bot.name, color: meta?.color ?? 'gold', elo: meta?.elo } }
          : {}),
        ...(lobby.framing ? { framing: lobby.framing } : {}),
      });
    }
  };

  // Resumed during the fight card: the card, and the first phase follows on
  // its own through the room.
  if (lobby.status === 'in_debate' && lobby.stepIndex < 0) {
    emitStart();
    return;
  }

  if (lobby.status === 'in_debate') {
    emitStart();
    // The clock exactly as emitStep sent it. A bot turn's window is its
    // thinking grace plus its speaking time, not the bare step length.
    if (lobby.lastPhase && lobby.lastPhase.stepIndex === lobby.stepIndex) {
      io.to(socketId).emit('debate:phase', { ...lobby.lastPhase, serverNow: now });
      // Resumed during the bot's step after it already spoke: the turn went
      // to the old socket, so it comes again (text, and the voice if any).
      const bt = lobby.lastBotTurn;
      if (lobby.bot && bt && bt.stepIndex === lobby.stepIndex) {
        io.to(socketId).emit('bot:turn', {
          stepIndex: bt.stepIndex,
          text: bt.text,
          ...(bt.failed ? { failed: true } : {}),
          ...(bt.mime ? { mime: bt.mime } : {}),
          ...(bt.audio ? { audio: bt.audio as unknown as ArrayBuffer } : {}),
        });
      }
      return;
    }
    const step = scriptFor(lobby)[lobby.stepIndex];
    const isBotStep = Boolean(lobby.bot && step.speaker === lobby.bot.side);
    io.to(socketId).emit('debate:phase', {
      stepIndex: lobby.stepIndex,
      phase: step.phase,
      activeSpeaker: step.speaker,
      seconds: step.seconds,
      deadline: lobby.stepStartedAt + step.seconds * 1000,
      serverNow: now,
      ...(isBotStep ? { speakSeconds: step.seconds } : {}),
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
    // The same payload the reveal had: heard, the rating delta, the
    // placement rating and the voice all come back after a refresh.
    emitVerdict(io, lobby, socketId);
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
  io: Io,
  lobby: Lobby,
  sender: Participant,
  stepIndex: number,
  mime: string,
  data: Buffer,
  seq: number,
): void {
  // Every rejection below used to be a silent return, which is how a lost turn
  // became invisible. Say which gate closed.
  const drop = (why: string) =>
    event('audio_dropped', { code: lobby.code, step: stepIndex, bytes: data.length, why });
  if (!lobby.debateCompleted && lobby.status !== 'in_debate') return drop('lobby_not_live');
  if (!turnIsAcceptable(lobby, sender, stepIndex)) return drop('wrong_step_or_speaker');
  const side = sideOf(lobby, sender)!;
  // A turn is now several segments, so these ceilings are per-turn segment
  // counts rather than "how many times did you upload".
  const forStep = lobby.audioTurns.filter((a) => a.stepIndex === stepIndex && a.side === side);
  if (forStep.length >= 24 || lobby.audioTurns.length >= 140) return drop('too_many_segments');
  if (lobby.audioBytes[side] + data.length > SIDE_AUDIO_BUDGET) return drop('side_budget');
  lobby.audioBytes[side] += data.length;
  const turn: AudioTurn = { stepIndex, side, mime, data, seq };
  lobby.audioTurns.push(turn);
  event('audio_ok', { code: lobby.code, step: stepIndex, seq, bytes: data.length });
  // The same ~5s segments Whisper transcribes double as the spectators' feed:
  // live human audio, a few seconds behind the mouth, no extra upload from
  // anyone. This is what makes spectating watchable without an SFU.
  io.to(`spec:${lobby.code}`).emit('spectate:audio', {
    side,
    stepIndex,
    seq,
    mime,
    data: data as unknown as ArrayBuffer,
  });
  touch(lobby);
  // Transcribe NOW rather than at turn end: the words are ready when the bot
  // needs them, and the speaker gets captions proving they were heard.
  void transcribeSegment(io, lobby, turn, sender);
}

/** Whisper the recorded turns; where transcription succeeds it REPLACES any
    browser speech chunks for that step (higher quality, esp. Arabic). */
async function applyServerTranscription(lobby: Lobby): Promise<void> {
  // Most segments were transcribed the moment they arrived; this is the final
  // sweep for the ones still outstanding (last segment of the last turn, plus
  // anything Whisper failed on). Re-running the whole debate here would double
  // the STT bill and duplicate text.
  const pending = lobby.audioTurns.filter((a) => !a.transcribed);
  const results = await Promise.all(
    pending.map(async (turn) => ({ turn, text: await transcribe(turn.data) })),
  );
  for (const { turn, text } of results) {
    turn.transcribed = true;
    if (!text) continue; // keep whatever browser chunks exist for this step
    lobby.segmentText.push({
      stepIndex: turn.stepIndex,
      side: turn.side,
      seq: turn.seq,
      text,
    });
  }
  // Rebuild every step that has any transcribed segment, in segment order.
  const steps = new Map<number, Side>();
  for (const s of lobby.segmentText) steps.set(s.stepIndex, s.side);
  for (const [stepIndex, side] of steps) {
    const full = rebuildStep(lobby, stepIndex, side);
    if (!full) continue;
    lobby.transcript = lobby.transcript.filter((e) => e.stepIndex !== stepIndex);
    lobby.transcript.push({ stepIndex, side, text: full, at: Date.now() });
  }
  lobby.audioTurns = []; // free the buffers
}

export function acceptChunk(lobby: Lobby, sender: Participant, chunk: SpeechChunk): void {
  // A payload-less emit must be a no-op, not an uncaughtException that takes
  // down every live debate on the box.
  if (!chunk || typeof chunk !== 'object') return;
  if (!lobby.debateCompleted && lobby.status !== 'in_debate') return;
  if (lobby.transcript.length >= MAX_TRANSCRIPT_ENTRIES) return;

  // One line of plain text: control characters (a NUL here used to cost the
  // whole match row, since Postgres refuses it), line breaks and bidi
  // overrides out, then capped (security.ts cleanLine).
  const text = cleanLine(chunk.text, MAX_CHUNK_CHARS);
  if (!text) return;
  if (!turnIsAcceptable(lobby, sender, chunk.stepIndex)) return;

  const side = sideOf(lobby, sender)!;
  let entries = 0;
  let chars = 0;
  for (const e of lobby.transcript) {
    if (e.stepIndex !== chunk.stepIndex || e.side !== side) continue;
    entries += 1;
    chars += e.text.length;
  }
  if (entries >= MAX_STEP_ENTRIES || chars + text.length > MAX_STEP_CHARS) return;
  lobby.transcript.push({ stepIndex: chunk.stepIndex, side, text, at: Date.now() });
  touch(lobby);
}
