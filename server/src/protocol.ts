// Shared protocol types — single source of truth for client and server.
// The client imports this file with `import type` only, so no server code
// ever enters the browser bundle.

export type Side = 'FOR' | 'AGAINST';
export type Role = 'host' | 'guest';
export type PhaseLabel = 'opening' | 'rebuttal' | 'defense' | 'closing';

// How the debate's topic gets decided (host chooses):
//  agree    — both pick the exact topic + sides (the negotiated flow)
//  category — host picks a category; server rolls a random topic + sides from it
//  random   — server rolls category, topic, and sides
//  dispute  — settle-it mode: you both describe a REAL argument you're having
//             in your own words, and the judge rules who's right, not who
//             argued a motion better.
export type TopicMode = 'agree' | 'category' | 'random' | 'dispute';

export type Difficulty = 'easy' | 'medium' | 'hard';

// Debate pacing — the same four-round format at three sizes. Turn lengths are
// maximums everywhere: "pass the mic" ends a turn early.
// Each pace is ALSO its own ladder, the way chess keeps bullet, blitz and
// classical apart: a rating, a record and a placement run per pace.
export const PACES = ['standard', 'blitz', 'long'] as const;
export type Pace = (typeof PACES)[number];

/** Tiers, and every boundary is a bot.
    A number is a rank among twenty strangers and carries a ±200 error bar.
    A tier is a falsifiable claim with a named opponent you can go fight right
    now: "Contender" means you can take Vivi, and the way to argue with it is
    to go and beat Vivi. That is the one thing a debate app with six calibrated
    bots can say that no generic Bronze/Silver ladder can. */
/* Renamed to the metal ladder 2026-08-22, his call: the invented names read
   as jargon to anyone arriving from a game with ranks, and iron-to-master is
   a vocabulary every gamer already speaks. The one brand word survives at the
   summit — above Master there is HEADLINER, the name on the marquee. The
   bot-anchoring stayed: every boundary up to Master is still a bot you can
   actually go fight, which no generic ladder can claim. */
export const TIERS = [
  { min: 0, key: 'iron', beats: null },
  { min: 650, key: 'bronze', beats: 'Pip' },
  { min: 850, key: 'silver', beats: 'Cappy' },
  { min: 1000, key: 'gold', beats: 'Vivi' },
  { min: 1200, key: 'platinum', beats: 'Ozzy' },
  { min: 1350, key: 'diamond', beats: 'Brutus' },
  { min: 1500, key: 'master', beats: 'Gigi' },
  { min: 1700, key: 'headliner', beats: null },
] as const;

export type Tier = (typeof TIERS)[number];
export type TierKey = Tier['key'];

export function tierFor(rating: number): Tier {
  let out: Tier = TIERS[0];
  for (const t of TIERS) if (rating >= t.min) out = t;
  return out;
}

/** The next tier up and how far away it is, for "40 points to Closer". */
export function nextTier(rating: number): { tier: Tier; away: number } | null {
  const up: Tier | undefined = TIERS.find((t) => t.min > rating);
  return up ? { tier: up, away: up.min - rating } : null;
}

/** Public bot info for the pick screen (no prompt/voice secrets). */
export interface BotInfo {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  color: string;
  rank: number; // 1 = easiest, ascending
  skill: string; // short strength label
  elo: number; // fixed published rating, calibrated against the judge
}

// Structural stand-ins for DOM WebRTC types (server tsconfig has no DOM lib).
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface SessionDescription {
  type: string;
  sdp?: string;
}

export interface IceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalPayload =
  | { description: SessionDescription }
  | { candidate: IceCandidate };

/** A topic in both languages; players match on the id. */
export interface TopicText {
  id: string;
  en: string;
  ar: string;
}

export interface TopicCategory {
  key: string;
  label: { en: string; ar: string };
  topics: TopicText[];
}

/** Pregame picks (topic ids). The debate starts only when both players
    picked the same topic, opposite sides, and both confirmed. */
export interface PickState {
  yourTopicId: string | null;
  peerTopicId: string | null;
  yourSide: Side | null;
  peerSide: Side | null;
  youConfirmed: boolean;
  peerConfirmed: boolean;
  /** Dispute mode: your own account of the argument, in your own words. You
      never see or edit theirs — nobody describes anybody else. */
  yourDispute: string | null;
  /** Whether the other person has written theirs yet (not the text itself). */
  peerDisputeReady: boolean;
  /** Set when their two accounts don't actually disagree, so the debate would
      be two people talking past each other. The only place we block. */
  disputeProblem: 'no_clash' | 'too_serious' | 'failed' | null;
}

/** What the AI made of the two accounts: one statement of the argument, and a
    position for each side. Generated, never self-written — people write
    grievances, not positions, and a single author keeps both sides phrased at
    the same level of charity. */
export interface Framing {
  argument: string;
  positions: Record<Side, string>;
  /** Each person's own words, kept so the merged version never erases them. */
  said: Record<Side, string>;
}

/** The mask set — humans wear masks, bots are animals, so who's a machine is
    legible at a glance. Ids are the shared contract; the art lives
    client-side. CUT FROM EIGHT TO FOUR 2026-08-22, his picks: the weak
    drawings (masque, boxer) diluted the strong ones, and knight read as a
    robot, which broke the humans-wear-masks rule from the other side.
    Accounts that saved a removed mask are migrated in store.ts
    (mask_roster_4) — do not re-add an id here without art for it.
    TURNED OVER AGAIN 2026-09-04: goggles, hoodie and wrap came in; the oni and the
    calavera went to the vault, art intact, for a later drop. Saved lockers
    follow the same nearest-survivor rule (mask_roster_basic). */
export const AVATAR_IDS = ['ninja', 'goggles', 'hoodie', 'wrap'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export interface LobbyUpdate {
  code: string;
  role: Role;
  yourName: string;
  peerName?: string;
  participantCount: 1 | 2;
  locked: boolean;
  deck: TopicCategory[];
  topicMode: TopicMode;
  /** In 'category' mode, the host-chosen category key (else null). */
  categoryKey: string | null;
  pace: Pace;
  pick: PickState;
  iceServers: IceServer[];
  /** Server-side Whisper transcription available: any browser works. */
  sttAvailable: boolean;
  /** Ranked match: paired from the queue, random topic, fixed pace, no picks,
      ratings on the line. */
  ranked?: boolean;
  /** Everyone always has a mask (ranked shows ONLY masks; custom may show
      cameras instead, each player's own choice). */
  yourAvatar: AvatarId;
  peerAvatar?: AvatarId;
  /** Behind the mask (no camera) or on camera. SERVER state, not local: your
      opponent has to see the mask you picked. Ranked forces true. */
  yourMasked: boolean;
  peerMasked?: boolean;
  /** Custom only, host-controlled: whether the code admits watchers. */
  spectatorsAllowed: boolean;
}

/** Everything a spectator needs to watch a debate they are not in. */
export interface SpectateState {
  code: string;
  status: 'waiting' | 'greenroom' | 'in_debate' | 'judging' | 'verdict';
  topic?: TopicText;
  names?: Record<Side, string>;
  /** Present when one side is a bot (spectating a training bout). */
  bot?: { id: string; name: string; color: string; side: Side };
  /** The current phase, so a mid-debate joiner lands on a live clock. */
  phase?: PhaseUpdate;
  watchers: number;
  /** Human debaters' masks by side (bots use their own art). Spectators see
      masks unless the debate is camera-on custom with video relay (SFU, later). */
  avatars?: Partial<Record<Side, AvatarId>>;
}

export interface DebateStart {
  topic: TopicText;
  yourSide: Side;
  names: Record<Side, string>;
  startsAt: number; // epoch ms: reveal countdown ends and step 0 begins
  serverNow: number;
  /** Present only in bots mode — the opponent is this AI, not a human peer.
      `elo` rides along so the verdict can explain the size of the movement. */
  bot?: { id: string; name: string; color: string; elo?: number };
  /** Human debaters' masks by side. In ranked these are the only faces. */
  avatars?: Partial<Record<Side, AvatarId>>;
  /** Dispute mode only: the argument and each side's position, shown instead of
      FOR/AGAINST. Written during the reveal countdown, so it costs no waiting. */
  framing?: Framing;
}

export interface PhaseUpdate {
  stepIndex: number; // 0..5
  phase: PhaseLabel;
  activeSpeaker: Side;
  seconds: number; // full duration of this step
  deadline: number; // epoch ms, server clock
  serverNow: number; // epoch ms at send time — client derives clock offset
  /** Bot steps only: the bot's SPEAKING allowance (same as a human turn of
      this phase). The client starts a visible countdown when audio begins and
      hard-cuts the voice when it expires. `seconds` on bot steps is the wider
      server fallback window (thinking + speaking), not the visible clock. */
  speakSeconds?: number;
}

export interface SpeechChunk {
  stepIndex: number;
  text: string; // FINAL speech-recognition results only
}

export interface CategoryScores {
  argument: number; // 0-30
  evidence: number; // 0-20
  clash: number; // 0-30
  delivery: number; // 0-20
}

/** Dispute mode's verdict: a court-show ruling rather than a scorecard. The
    category scores still exist underneath so the coaching survives. */
export interface Ruling {
  /** Percentages of who is right, clamped to sum to 100. */
  split: Record<Side, number>;
  /** One line, spoken aloud: the sentencing moment. */
  decree: string;
  /** What each of them actually has to do now. */
  orders: string[];
}

export interface Verdict {
  winner: Side;
  summary: string; // one-line hype ruling, read aloud at the reveal
  scores: Record<Side, CategoryScores>;
  bestQuote: Record<Side, string>;
  feedback: Record<Side, string[]>; // 2 bullets each
  injectionDetected: boolean;
  /** Dispute mode only. */
  ruling?: Ruling;
}

export type JoinError =
  | 'not_found'
  | 'full'
  | 'in_progress'
  | 'bad_name'
  | 'rate_limited'
  | 'locked'
  | 'self';

export type CreateResult =
  | { ok: true; update: LobbyUpdate }
  | { ok: false; error: JoinError };

export interface ClientToServer {
  'lobby:create': (
    p: { sessionId: string; name: string },
    cb: (res: CreateResult) => void,
  ) => void;
  'lobby:join': (
    p: { code: string; sessionId: string; name: string },
    cb: (res: CreateResult) => void,
  ) => void;
  'lobby:resume': (
    p: { code: string; sessionId: string },
    cb: (res: { ok: boolean }) => void,
  ) => void;
  'pick:mode': (mode: TopicMode) => void; // host only: how the topic is decided
  'pick:category': (key: string) => void; // host only: category for 'category' mode
  'pick:pace': (pace: Pace) => void; // host only: turn lengths
  'pick:avatar': (id: string) => void; // any seat, pre-debate: choose your mask
  'pick:mask': (on: boolean) => void; // any seat, custom only: mask instead of camera
  'pick:spectators': (allowed: boolean) => void; // host only, custom: open the door to watchers
  'pick:topic': (topicId: string) => void; // set YOUR topic choice (by id)
  /** Dispute mode: describe the argument in YOUR own words (≤400 chars). */
  'pick:dispute': (text: string) => void;
  'pick:side': (side: Side) => void; // set YOUR side
  'pick:confirm': () => void; // second confirm (with matching picks) starts the debate
  'rtc:ready': () => void;
  'rtc:signal': (p: SignalPayload) => void;
  'speech:chunk': (p: SpeechChunk) => void;
  /** End YOUR OWN current turn early — the mic passes immediately. */
  'turn:done': (p: { stepIndex: number }) => void;
  /** One self-contained audio SEGMENT of a speaking turn (server-STT mode).
      `seq` orders segments within the turn; a turn is several of these, sent
      while you speak rather than one blob at the end. */
  'audio:turn': (p: {
    stepIndex: number;
    mime: string;
    data: ArrayBuffer;
    seq?: number;
  }) => void;
  'verdict:retry': () => void;
  'rematch': () => void; // want to run it back with the same person
  /** Ranked: enter the matchmaking queue. playerId is a persistent per-device
      identity (localStorage), which is what the rating is keyed to. `pace`
      picks WHICH queue you stand in and which ladder the result moves; a
      pace only ever pairs with itself. Absent or unknown means standard. */
  'queue:join': (
    p: { sessionId: string; playerId: string; name: string; pace?: Pace },
    cb: (res: { ok: boolean; error?: JoinError }) => void,
  ) => void;
  'queue:leave': () => void;
  /** Watch a live lobby by its code. Spectators are not participants: no
      camera, no mic, no seat — they receive state and audio only. */
  'spectate:join': (
    p: { code: string },
    cb: (res: { ok: boolean; error?: 'not_found' | 'full' | 'rate_limited' }) => void,
  ) => void;
  /** Anti-cheat: you left the tab for `ms` while it was your turn to speak. */
  'turn:away': (p: { ms: number }) => void;
  /** Walk out of a room before the debate starts. */
  'lobby:leave': () => void;
  'spectate:leave': () => void;
  /** Push your room code to a friend who is online right now. Friends only,
      checked server-side. */
  'friend:invite': (
    p: { username: string; code: string },
    cb: (res: {
      ok: boolean;
      error?: 'signed_out' | 'rate_limited' | 'bad_request' | 'not_friends' | 'offline';
    }) => void,
  ) => void;
  /** Which of your friends have a tab open. */
  'friend:presence': (
    p: Record<string, never>,
    cb: (res: { ok: boolean; online: string[] }) => void,
  ) => void;
  /** Ask for a shareable link to this verdict. The whole card is encoded in
      the returned URL — nothing is stored server-side. */
  'share:link': (cb: (res: { url: string } | null) => void) => void;
  /** Say anything to the YapMaster about YOUR debate. It coaches when asked and
      defends its ruling when challenged; the score never moves either way. */
  'coach:ask': (p: { question: string }) => void;
  'bot:start': (
    p: {
      sessionId: string;
      name: string;
      botId: string; // the character IS the difficulty
      topicMode: TopicMode;
      categoryKey?: string;
      topicId?: string;
      side?: Side | 'random';
      lang?: 'en' | 'ar';
      pace?: Pace;
      /** Campaign identity: bots above your unlocked level are refused
          ('locked'). Absent (old clients) or store-down means no gate. */
      playerId?: string;
      /** Default true: the ladder counts. false = sparring, unrated. */
      rated?: boolean;
    },
    cb: (res: {
      ok: boolean;
      error?: JoinError;
      /** Whether this debate will move your rating, decided before it starts. */
      rated?: boolean;
      reason?: 'account' | 'cap' | 'spar' | 'quiet';
    }) => void,
  ) => void;
  /** Where this player's campaign stands: the highest bot rank they may face.
      level 0 = only the tutorial; null = the store is down (client fails open). */
  'campaign:get': (p: { playerId: string }, cb: (res: { level: number | null }) => void) => void;
  /** Report your human opponent (custom or ranked; bots can't be reported).
      Stores the debate's transcript for review — the one deliberate exception
      to "transcripts die with the lobby". ok:false = not recorded, be honest. */
  'report': (p: { reason: string }, cb: (res: { ok: boolean }) => void) => void;
  'bot:done': (p: { stepIndex: number }) => void; // the bot finished speaking its turn
  /** Start the interactive tutorial: the YapMaster demos each round, then the
      student tries it. No judge at the end — a debrief instead. */
  'tutorial:start': (
    p: { sessionId: string; name: string; lang?: 'en' | 'ar'; playerId?: string },
    cb: (res: { ok: boolean; error?: JoinError }) => void,
  ) => void;
}

export interface ServerToClient {
  'lobby:update': (u: LobbyUpdate) => void;
  /** Your friends list changed (request, accept, or removal): refetch it. */
  'friend:changed': () => void;
  /** A friend called you out: their room is open and waiting for you. */
  'friend:invited': (p: { from: string; code: string }) => void;
  'lobby:closed': (p: { reason: string; vars?: Record<string, string> }) => void;
  'rtc:go': () => void; // sent to HOST only when both peers are rtc-ready
  'rtc:signal': (p: SignalPayload) => void;
  'debate:start': (p: DebateStart) => void;
  'debate:phase': (p: PhaseUpdate) => void;
  'debate:ended': () => void;
  'debate:aborted': (p: { reason: string; vars?: Record<string, string> }) => void;
  'peer:connection': (p: { state: 'lost' | 'restored'; graceDeadline?: number }) => void;
  'verdict:status': (p: { state: 'pending' | 'failed'; message?: string; terminal?: boolean }) => void;
  /** The ruling. `audio` is the YapMaster reading `verdict.summary` in their
      own voice; absent when TTS is off or failed, and the client falls back to
      the browser's built-in speech. */
  'verdict:result': (p: {
    verdict: Verdict;
    names: Record<Side, string>;
    mime?: string;
    audio?: ArrayBuffer;
    /** Words the judge actually received from each side. Zero means we never
        heard them — which must be said out loud, not left to look like a
        crushing defeat they earned. */
    heard?: Record<Side, number>;
    /** Ranked only: what the match did to each side's rating on the ladder
        of the pace it was played at (the lobby's pace). */
    elo?: Record<Side, { before: number; after: number }>;
  }) => void;
  /** Rematch handshake state (per recipient's own view). */
  'rematch:update': (p: { youWant: boolean; peerWant: boolean; peerLeft: boolean }) => void;
  /** Both agreed — reset to the green room for a fresh debate. */
  'rematch:go': () => void;
  /** The YapMaster's coaching answer (sent only to the asker). */
  'coach:reply': (p: { text: string; error?: boolean; done?: boolean }) => void;
  /** What we have transcribed of YOUR current turn so far. Sent only to the
      speaker. Proof, while you talk, that the judge is receiving you. */
  'caption': (p: { stepIndex: number; text: string }) => void;
  /** Ranked queue heartbeat: how many are waiting IN YOUR PACE (the other
      queues are invisible to you), your rating on that pace's ladder, and
      the pace itself so the waiting screen can name it. */
  'queue:update': (p: { waiting: number; rating: number; pace: Pace }) => void;
  /** Paired: both players land in a ranked green room together. */
  'queue:matched': (p: { update: LobbyUpdate }) => void;
  /** Snapshot for a spectator (sent on join and on debate start). Live updates
      after this arrive through the normal room events (debate:phase, verdicts). */
  'spectate:state': (p: SpectateState) => void;
  /** One chunk of live debate audio for spectators: the bot's whole turn, or a
      ~5s segment of a human turn (the same segments Whisper transcribes). */
  'spectate:audio': (p: {
    side: Side;
    stepIndex: number;
    seq: number;
    mime: string;
    data: ArrayBuffer;
  }) => void;
  /** Watcher count, sent to debaters AND spectators whenever it changes.
      Debaters must always know they have an audience. */
  'spectate:count': (p: { n: number }) => void;
  /** The bot's spoken turn: its argument text + optional synthesized audio.
      `failed` means generation broke on our side (API down, out of credits).
      Without it an empty text is indistinguishable from a bot that chose to
      say nothing, which is how an outage once looked like "the bot is mute". */
  'bot:turn': (p: {
    stepIndex: number;
    text: string;
    mime?: string;
    audio?: ArrayBuffer;
    failed?: boolean;
  }) => void;
  /** End of the tutorial: no winner, a debrief. One thing the student did
      well, the one fix that matters most, and a send-off. `audio` is the
      YapMaster speaking it. */
  'tutorial:debrief': (p: {
    praise: string;
    fix: string;
    next: string;
    mime?: string;
    audio?: ArrayBuffer;
  }) => void;
  /** Campaign frontier moved: `level` is the newly unlocked bot rank,
      `unlocked` its name — null once the whole ladder is conquered. */
  'campaign:up': (p: { level: number; unlocked: string | null }) => void;
}

export interface SocketData {
  code?: string;
  role?: Role;
  /** Set from the session cookie at connect: a signed-in socket argues under
      its account's name and player id, whatever the payload claims. */
  account?: { sub: string; playerId: string; name: string };
  /** The account's saved mask preference, applied to every seat they take. */
  locker?: { mask: string | null; maskDefault: boolean };
}

// Unicode letters (Arabic mode means Arabic names), digits, underscore.
// ASCII only, deliberately. This used to be \p{L}\p{N} (any script) for the
// Arabic build; with Arabic parked, ASCII is both honest about the audience and
// strictly safer: it removes every non-Latin homoglyph at once AND makes
// bidirectional override characters unrepresentable — those can visually
// REVERSE a name on a scoreboard, which no amount of folding fixes.
export const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

// ---- claimed yap names (accounts) ----
// A guest name only has to be typeable. A CLAIMED name is an identity other
// people read on a scoreboard, so it has to survive three attacks a plain
// regex doesn't see: lookalike letters, reserved names, and pure punctuation.

/** Latin letters that Cyrillic and Greek have identical-looking twins for.
    Without folding these, "уapking" (Cyrillic у) is a different row that
    renders pixel-identical to "yapking" — free impersonation. */
const CONFUSABLES: Record<string, string> = {
  а: 'a', в: 'b', с: 'c', е: 'e', һ: 'h', і: 'i', ј: 'j', к: 'k', м: 'm',
  о: 'o', р: 'p', ѕ: 's', т: 't', и: 'u', х: 'x', у: 'y', ѐ: 'e', ї: 'i',
  α: 'a', β: 'b', ε: 'e', ι: 'i', κ: 'k', ο: 'o', ρ: 'p', τ: 't', υ: 'u',
  ν: 'v', χ: 'x', γ: 'y', ζ: 'z', '０': '0', '１': '1',
};

/** The key uniqueness is decided on. Two names that fold the same cannot both
    exist, even though each keeps the capitalisation its owner typed. */
export function foldName(name: string): string {
  return name
    .normalize('NFKC') // ligatures and full-width letters collapse to plain ones
    .toLowerCase()
    .split('')
    .map((ch) => CONFUSABLES[ch] ?? ch)
    .join('');
}

/** Names nobody gets to wear: the judge, the bots, and anything that reads as
    staff. Impersonating the YapMaster in an app where the YapMaster SPEAKS is
    the one name collision that could actually fool someone. */
const RESERVED = new Set([
  'yapmaster', 'yapstage', 'admin', 'administrator', 'moderator', 'mod',
  'staff', 'support', 'official', 'judge', 'system', 'root', 'null',
  'deleted', 'anonymous', 'pip', 'cappy', 'vivi', 'ozzy', 'brutus', 'gigi',
]);

export type NameProblem = 'bad_name' | 'reserved' | null;

/** Server and client run the SAME check, so the claim screen never promises a
    name the server will refuse. */
export function nameProblem(raw: string): NameProblem {
  const name = raw.normalize('NFKC').trim();
  if (!NAME_RE.test(name)) return 'bad_name';
  const fold = foldName(name);
  if (RESERVED.has(fold)) return 'reserved';
  // "___" is not a name; require something readable in there.
  if (!/[A-Za-z0-9]{2,}/.test(name)) return 'bad_name';
  return null;
}
