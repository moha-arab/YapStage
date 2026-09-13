// Shared protocol types — single source of truth for client and server.
// The client imports this file with `import type` only, so no server code
// ever enters the browser bundle.

export type Side = 'FOR' | 'AGAINST';
export type Role = 'host' | 'guest';
export type PhaseLabel = 'opening' | 'rebuttal' | 'defense' | 'closing';

/** The host's side setting for a friend room or a bot game: a fixed side,
    or 'random' for the coin. The coin is the default and stays the norm
    (arguing the side you were dealt is the skill); a chosen side is for the
    host who wants to practise one argument, or who set the motion knowing
    which half of it they want. */
export type SidePick = Side | 'random';

// How the debate's topic gets decided (host chooses):
//  agree:    the host names the exact motion from the deck
//  category: host picks a category; server rolls a random topic from it
//  random:   server rolls category and topic
//  dispute:  settle-it mode: you both describe a REAL argument you're having
//            in your own words, and the judge rules who's right, not who
//            argued a motion better.
// Sides are a separate setting (SidePick), the same in every mode.
export type TopicMode = 'agree' | 'category' | 'random' | 'dispute';

export type Difficulty = 'easy' | 'medium' | 'hard';

// Debate pacing, the same four-round format at three sizes. Turn lengths are
// maximums everywhere: "pass the mic" ends a turn early.
// Blitz and long are for friend rooms only. Ranked is STANDARD ONLY (his call
// 2026-09-12: "make all the people play one mode so that we have as many
// players as possible"); the per-pace ladders from 2026-09-04 still exist in
// the database but nothing enters them any more.
export const PACES = ['standard', 'blitz', 'long'] as const;
export type Pace = (typeof PACES)[number];

/* No tiers. The ladder used to name eight metals (Iron to Headliner) with a
   bot at every boundary; he cut them 2026-09-12 ("remove the ranks, only
   numbers"). A rating is the whole rank now: yours is a number, a bot is a
   number, and the roster is the numbers in order. git has the tier code
   (protocol TIERS, client TierBadge.tsx) if a badge ever comes back. */

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

/** Pregame picks (topic ids). The host names the topic and the server
    mirrors it, so the two ids only differ for a moment; the debate starts
    when both have confirmed. Sides live on LobbyUpdate.hostSide, not here:
    they are one host setting, not a pick per seat. */
export interface PickState {
  yourTopicId: string | null;
  peerTopicId: string | null;
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
    follow the same nearest-survivor rule (mask_roster_basic).
    THE CAST 2026-09-12: the roster is fourteen characters drawn as busts
    (client/src/cast.ts), his pick over a build-your-own character. Six of
    the old masks were redrawn as busts under new names (oni to shuten,
    calavera to marisol, gamer to quip, huckster to bally, plague to corvin,
    alien to garn), and the ninja and the climber were drawn as busts the
    same night under new names (fuma, crux). Saved lockers follow in
    store.ts (mask_roster_cast). */
export const AVATAR_IDS = [
  'napoleon',
  'socrates',
  'aristotle',
  'diogenes',
  'athena',
  'lincoln',
  'dracula',
  'humpty',
  'bally',
  'shuten',
  'marisol',
  'quip',
  'corvin',
  'garn',
  'fuma',
  'crux',
] as const;
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
  /** The host's side, or 'random' for the coin (the default). The guest
      argues the other one. Ranked never leaves 'random'. */
  hostSide: SidePick;
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

/** One row of the lobby's browse list: a live ranked debate anyone can watch.
    Only what a spectator gets anyway (spectateStateFor); no player ids. */
export interface LiveMatch {
  code: string;
  topic: TopicText;
  /** The deck category the motion came from. Ranked rolls a category first
      and keeps categoryKey null, so this is read back from the topic id. */
  category: string | null;
  names: Record<Side, string>;
  avatars: Partial<Record<Side, AvatarId>>;
  /** Null during the reveal countdown, before step 0. */
  phase: PhaseLabel | null;
  stepIndex: number; // -1 during the reveal countdown
  watchers: number;
  /** Server clock at step 0, so the lobby can tick "how far in" against
      serverNow the same way the shot clock does. Null during the reveal. */
  startedAt: number | null;
}

/** GET /live: what the lobby's watch mode shows. `featured` is the first
    open bout, kept so the stage can stand two real faces on it. */
export interface LiveList {
  live: number;
  watchable: number;
  featured: {
    code: string;
    names: Record<Side, string>;
    avatars: Partial<Record<Side, AvatarId>>;
    phase: PhaseLabel | null;
    watchers: number;
  } | null;
  matches: LiveMatch[];
  /** The deck's categories, so the filter chips need no second fetch. */
  categories: { key: string; label: { en: string; ar: string } }[];
  serverNow: number;
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
  | 'self'
  /** Ranked needs an account: the queue and the placement match both refuse
      a signed-out socket wherever Google sign-in is configured. */
  | 'signed_out'
  /** The placement match is one shot, and this player has already played it. */
  | 'placed';

export type CreateResult =
  | { ok: true; update: LobbyUpdate }
  | { ok: false; error: JoinError };

export interface ClientToServer {
  /** playerId is the device id a guest plays under (a signed-in socket's
      comes from the cookie instead), so the game can be filed for them. */
  'lobby:create': (
    p: { sessionId: string; name: string; playerId?: string },
    cb: (res: CreateResult) => void,
  ) => void;
  'lobby:join': (
    p: { code: string; sessionId: string; name: string; playerId?: string },
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
  'pick:topic': (topicId: string) => void; // host only: the exact motion (by id)
  /** Dispute mode: describe the argument in YOUR own words (≤400 chars). */
  'pick:dispute': (text: string) => void;
  /** Host only, any topic mode: which side the host argues, or 'random' for
      the coin. Used to be a per-seat pick that nothing read. */
  'pick:side': (side: SidePick) => void;
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
      is accepted from older clients and ignored: ranked is standard only,
      one queue and one ladder, so everyone who wants a game is in the same
      line. Signed out is refused ('signed_out') wherever sign-in exists. */
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
      /** The placement match: one game against the roster bot nearest 1400
          that sets an unplaced player's starting rating. The server picks
          the bot, the topic and the sides itself (botId, topicMode and side
          are ignored) and refuses a player who is already placed. */
      placement?: boolean;
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
    /** Ranked only: what the match did to each side's rating. */
    elo?: Record<Side, { before: number; after: number }>;
    /** The placement match only: the starting rating it set. Absent when
        the store was down or the player was barely heard, in which case
        nothing was set and they are still unplaced. */
    placement?: { rating: number };
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
  /** Ranked queue heartbeat: how many are waiting, your rating, and the pace
      (always standard now; kept so older waiting screens still render). */
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
  'deleted', 'anonymous',
  // the bots on the ladder since 2026-09-12
  'nib', 'moss', 'dodger', 'clover', 'prudence', 'rocco', 'sterling', 'vesper',
  // names retired later that day (the tortoise, the raccoon, the cat)
  'wendell', 'jinx', 'sable',
  // the cast before that, kept so old match history cannot be impersonated
  'pip', 'cappy', 'vivi', 'nora', 'ozzy', 'brutus', 'vera', 'gigi',
]);

export type NameProblem = 'bad_name' | 'reserved' | null;

/** Server and client run the SAME check, so the claim screen never promises a
    name the server will refuse. */
export function nameProblem(raw: string): NameProblem {
  const name = raw.normalize('NFKC').trim();
  if (!NAME_RE.test(name)) return 'bad_name';
  const fold = foldName(name);
  if (RESERVED.has(fold)) return 'reserved';
  // "Guest4821" is what a signed-out device is called (client/src/guest.ts).
  // No account may claim that pattern, so a guest and a player are never
  // mistaken for each other. Guests' own names are checked by NAME_RE only.
  if (/^guest\d*$/.test(fold)) return 'reserved';
  // "___" is not a name; require something readable in there.
  if (!/[A-Za-z0-9]{2,}/.test(name)) return 'bad_name';
  return null;
}
