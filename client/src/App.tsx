import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type {
  DebateStart,
  LobbyUpdate,
  PhaseUpdate,
  Side,
  SpectateState,
  Verdict as VerdictData,
} from '../../server/src/protocol';
import { GUEST_AVATAR } from '../../server/src/protocol';
import { forgetRoom, session, socket } from './socket';
import {
  attemptIceRestart,
  beginOffer,
  ensureLocalStream,
  handleSignal,
  reacquireMedia,
  releaseMedia,
  setMicEnabled,
  setAudioOnly,
  setRankedRoom,
  setTrackHealthHandlers,
  setupPeer,
  teardownPeer,
} from './webrtc';
import { setOnChunk, setSpeechLang, speechSupported, startTurn, stopTurn } from './speech';
import { recordingSupported, setOnRecordingActive, startTurnRecording, stopTurnRecording } from './recorder';
import { saveReceipt } from './history';
import { playerId, whoAmI, type Account } from './player';
import { LangToggle, useI18n } from './i18n';
import Home, { type LobbyMode } from './screens/Home';
import type { BotStartConfig, StartResult } from './screens/BotSelect';
import type { DebriefInfo } from './screens/TutorialDone';
import Splash, { splashWanted } from './Splash';

// The lobby is the first screen almost everyone sees, so it ships in the entry
// chunk. Every other screen loads on demand (main.tsx warms them once the page
// is idle, so a tap into a debate does not wait on the network).
const GreenRoom = lazy(() => import('./screens/GreenRoom'));
const Debate = lazy(() => import('./screens/Debate'));
const VerdictScreen = lazy(() => import('./screens/Verdict'));
const BotSelect = lazy(() => import('./screens/BotSelect'));
const Spectate = lazy(() => import('./screens/Spectate'));
const TutorialIntro = lazy(() => import('./screens/TutorialIntro'));
const TutorialDone = lazy(() => import('./screens/TutorialDone'));
const ClaimName = lazy(() => import('./screens/ClaimName'));
const Matches = lazy(() => import('./screens/Matches'));
const Drill = lazy(() => import('./screens/Drill'));
import { MASK_IDS } from './Mask';
import { playBotTurn, stopBotVoice, unlockBotVoice } from './botvoice';
import { initAudio } from './sound';

interface VerdictInfo {
  verdict: VerdictData;
  names: Record<Side, string>;
  /** The YapMaster reading the ruling. Absent when TTS is off or failed. */
  mime?: string;
  audio?: ArrayBuffer;
  /** Words the judge actually received from each side. */
  heard?: Record<Side, number>;
  /** Ranked only: what the match did to each side's rating. */
  elo?: Record<Side, { before: number; after: number }>;
  /** The placement match only: the starting rating it set. */
  placement?: { rating: number };
}

interface AbortInfo {
  key: string;
  vars?: Record<string, string>;
}

// Post-debate refresh recovery: once the debate has ENDED, resuming is safe
// (nothing live to hijack), so we remember just enough to fetch the verdict.
const RESUME_KEY = 'yap.resume';

// index.html's title, which the lobby keeps (it is the page people land on).
const BASE_TITLE = document.title || 'YapStage';

/** `ranked` rides along because a boot-resumed verdict has no LobbyUpdate to
    say so, and a ranked verdict must not offer a rematch. */
function storeResume(code: string | null | undefined, ranked = false): void {
  if (!code) return;
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({ code, sid: session.id, ranked }));
  } catch {
    // storage blocked — refresh recovery just won't happen
  }
}

/** Hand back the room this socket still holds on the server: a bot game, a
    placement, the lesson, or a finished friend room. The server refuses a new
    start from a socket that still sits in an old game, so every way out
    says so first. Harmless when there is nothing to leave. */
function leaveRoom(): void {
  socket.emit('lobby:leave');
}

function clearResume(): void {
  try {
    sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // ignore
  }
}

// A LIVE debate or green room survives a reload of this tab (QA 2026-09-13:
// a reload threw the game away without a word, and in ranked the server's
// grace ran out into a walk-out loss). What lobby:resume needs is kept for
// this tab alone, and it only counts once the page has really unloaded:
// pagehide stamps it. A duplicated tab copies sessionStorage but never
// unloaded, so it cannot take the seat from the tab it was copied from.
const LIVE_KEY = 'yap.live';
/** The server holds a dropped seat for 15 seconds (index.ts GRACE_MS). */
const LIVE_RESUME_MS = 20_000;
/** Older than this it is a tab restored long after, not a reload: say nothing. */
const LIVE_NOTICE_MS = 10 * 60_000;

interface LiveRecord {
  code: string;
  sid: string;
  bot: boolean;
  /** Friend and ranked rooms: the room as last seen. The server resends the
      debate on a resume but not the room, and the call is rebuilt from it. */
  lobby: LobbyUpdate | null;
  /** In the debate itself rather than the green room (picks the line shown
      when the seat is gone). */
  debating: boolean;
  /** When the page unloaded. */
  at?: number;
}

function saveLive(rec: LiveRecord): void {
  try {
    sessionStorage.setItem(LIVE_KEY, JSON.stringify(rec));
  } catch {
    // storage blocked: a reload ends the game, as it always did
  }
}

function clearLive(): void {
  try {
    sessionStorage.removeItem(LIVE_KEY);
  } catch {
    // ignore
  }
}

function stampLive(): void {
  try {
    const raw = sessionStorage.getItem(LIVE_KEY);
    if (!raw) return;
    sessionStorage.setItem(LIVE_KEY, JSON.stringify({ ...(JSON.parse(raw) as LiveRecord), at: Date.now() }));
  } catch {
    // ignore
  }
}

/** Read once and forget: a record is good for one try. */
function takeLive(): LiveRecord | null {
  try {
    const raw = sessionStorage.getItem(LIVE_KEY);
    sessionStorage.removeItem(LIVE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as LiveRecord;
    return rec && typeof rec.code === 'string' && typeof rec.sid === 'string' ? rec : null;
  } catch {
    return null;
  }
}

// The in-app screens that get an entry of their own in the browser history,
// so Back (and Android's back gesture) returns to the lobby instead of
// leaving YapStage. The debate keeps its own rule: no entry, and the unload
// warning when you try to leave it.
type Overlay = 'drill' | 'matches' | 'spectate';

function overlayEntry(): string | undefined {
  try {
    return (history.state as { yap?: string } | null)?.yap;
  } catch {
    return undefined;
  }
}

function pushOverlay(kind: Overlay): void {
  try {
    if (overlayEntry() !== kind) history.pushState({ yap: kind }, '');
  } catch {
    // no history API: Back leaves, as before
  }
}

/** Closed from inside the app: step back over its entry, so the next Back
    leaves the lobby the ordinary way instead of landing on a dead entry. The
    popstate that follows finds nothing open and does nothing. */
function dropOverlayEntry(): void {
  try {
    if (overlayEntry()) history.back();
  } catch {
    // ignore
  }
}

export default function App() {
  const { lang, t } = useI18n();
  const [lobby, setLobby] = useState<LobbyUpdate | null>(null);
  const [start, setStart] = useState<DebateStart | null>(null);
  const [phase, setPhase] = useState<PhaseUpdate | null>(null);
  const [ended, setEnded] = useState(false);
  const [verdictInfo, setVerdictInfo] = useState<VerdictInfo | null>(null);
  const [judgeStatus, setJudgeStatus] = useState<{
    state: 'pending' | 'failed';
    message?: string;
    terminal?: boolean;
  } | null>(null);
  const [abortInfo, setAbortInfo] = useState<AbortInfo | null>(null);
  const [rematch, setRematch] = useState<{ youWant: boolean; peerWant: boolean; peerLeft: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [peerLostUntil, setPeerLostUntil] = useState<number | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteVideoDead, setRemoteVideoDead] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaRetry, setMediaRetry] = useState(0);
  const [rtcState, setRtcState] = useState<RTCPeerConnectionState | null>(null);
  const [speechHeard, setSpeechHeard] = useState(false);
  const [botPicking, setBotPicking] = useState(false);
  // Tutorial: the intro screen, then (after the lesson) the YapMaster's notes.
  const [tutoring, setTutoring] = useState(false);
  const [viewingMatches, setViewingMatches] = useState(false);
  const [viewingDrill, setViewingDrill] = useState(false);
  // Guest play is BACK (his call 2026-09-12: "you don't need an account for
  // anything but ranked"), reversing 2026-08-22 when playing required a
  // Google account, full stop. A signed-out visitor lands in the lobby and
  // can play bots, a friend, watch and drill under a name they type once;
  // ranked alone asks for the account, on its own stage (Home.tsx). The
  // Welcome pitch that used to intercept every signed-out visitor went with
  // this: its standing rule was one action, and a second door would have
  // broken it, so the lobby bar carries the quiet sign-in instead.
  const [debrief, setDebrief] = useState<DebriefInfo | null>(null);
  // The lobby tab to open on next time it mounts (after the lesson: bots).
  const [homeMode, setHomeMode] = useState<LobbyMode | undefined>(undefined);
  // The verdict came back through the boot resume and it was a ranked one.
  const [bootRanked, setBootRanked] = useState(false);
  // Campaign: a win at the frontier unlocked the next opponent.
  const [unlocked, setUnlocked] = useState<{ level: number; unlocked: string | null } | null>(null);
  // Spectating a lobby by code (state + the latest server snapshot for it).
  const [spectating, setSpectating] = useState<string | null>(null);
  // Arrived through the ranked feed (vs a friend's code): only the feed offers
  // a 'next debate', because a custom lobby is one room, not a channel. The
  // feed remembers the tab it was opened from, so "next" stays in it.
  const [specFeed, setSpecFeed] = useState<{ category: string | null } | null>(null);
  const [specState, setSpecState] = useState<SpectateState | null>(null);
  // How many people are watching MY debate (shown to debaters).
  const [watchers, setWatchers] = useState(0);
  const [botName, setBotName] = useState('');
  const [botTurn, setBotTurn] = useState<{ stepIndex: number; text: string } | null>(null);
  const [botSpeaking, setBotSpeaking] = useState(false);
  // Epoch ms when the bot must yield the mic — drives its visible shot clock.
  const [botSpeakDeadline, setBotSpeakDeadline] = useState<number | null>(null);
  // The bot's turn failed to generate (our outage, not its silence).
  const [botFailed, setBotFailed] = useState(false);
  // How many of your words the judge has actually received this turn. Kept as a
  // COUNT, not text: captions turned a debate into a dictation app.
  const [heardWords, setHeardWords] = useState(0);
  // A fresh account has no yap name yet, and a name is the identity everyone
  // else sees — so nothing else renders until it is claimed.
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    void whoAmI().then(setAccount);
  }, []);
  // The opening: the mark drawn over the boot, once per tab. It lives ABOVE
  // `content`, never in place of it, so the /auth/me fetch and the socket
  // handlers below start on the first render exactly as they did before.
  const [splash, setSplash] = useState(splashWanted);
  const endSplash = useCallback(() => setSplash(false), []);

  // Server-STT availability (for bot mode, which has no LobbyUpdate to carry it).
  const sttGlobalRef = useRef(false);
  useEffect(() => {
    fetch('/healthz')
      .then((r) => r.json())
      .then((h) => {
        sttGlobalRef.current = h.stt === 'cloudflare';
      })
      .catch(() => {});
  }, []);

  const lobbyRef = useRef<LobbyUpdate | null>(null);
  lobbyRef.current = lobby;
  const startedRef = useRef(false);
  startedRef.current = Boolean(start);
  const startDataRef = useRef<DebateStart | null>(null);
  startDataRef.current = start;
  const phaseRef = useRef<PhaseUpdate | null>(null);
  phaseRef.current = phase;
  const endedRef = useRef(false);
  endedRef.current = ended;
  const localStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = localStream;
  const settledRef = useRef(false); // verdict/debrief shown or aborted — nothing to resume
  settledRef.current = Boolean(verdictInfo) || Boolean(abortInfo) || Boolean(debrief);
  // "Play again" from a bot verdict. The last bot match's setup, so the same
  // bot can be asked for again, and a flag that keeps the old result on
  // screen until the new match's debate:start replaces it in one render
  // (no flash of the lobby in between). Same socket is safe: the judge lets
  // the finished lobby's room go silently ten minutes after the verdict.
  const lastBotRef = useRef<{ who: string; c: BotStartConfig } | null>(null);
  const replayRef = useRef(false);
  // One bot or lesson start in flight at a time (a double tap is two
  // debates otherwise). Cleared by a failed ack or by debate:start.
  const startingRef = useRef(false);
  // A bot game has no LobbyUpdate, so its room code comes back in the start
  // ack and is kept here: a socket blip resumes it with lobby:resume.
  const botCodeRef = useRef<string | null>(null);
  // A bot game whose socket never comes back is called after a while.
  const dropTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // This page's own socket is down (every mode says so on the match screen).
  const [offline, setOffline] = useState(false);
  // The green room's line about the room itself (lobby:notice), e.g. the
  // host being told the guest left and the code still works.
  const [roomNotice, setRoomNotice] = useState<{ key: string; x?: string } | null>(null);
  // A reload is getting its seat back (yap.live): hold the boot lockup rather
  // than drawing a lobby that would start opening rooms.
  const [resuming, setResuming] = useState(false);
  // Watching someone else's room. A ref as well, because the room's debate
  // events reach this socket too and the handlers below must ignore them.
  const spectatingRef = useRef<string | null>(null);

  const resetToHome = useCallback((message: string | null, opts?: { keepNotice?: boolean }) => {
    releaseMedia();
    stopTurn();
    stopBotVoice();
    clearResume();
    clearLive();
    setRoomNotice(null);
    // A watcher sent home by lobby:closed still has the watching screen's
    // history entry under them.
    if (spectatingRef.current) dropOverlayEntry();
    spectatingRef.current = null;
    replayRef.current = false;
    startingRef.current = false;
    // A finished bot game's room would otherwise block the next start.
    if (botCodeRef.current) leaveRoom();
    botCodeRef.current = null;
    clearTimeout(dropTimer.current);
    setBootRanked(false);
    setLobby(null);
    setStart(null);
    setPhase(null);
    setEnded(false);
    setVerdictInfo(null);
    setJudgeStatus(null);
    setAbortInfo(null);
    setRematch(null);
    setPeerLostUntil(null);
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteVideoDead(false);
    setMediaError(null);
    setBotPicking(false);
    setTutoring(false);
    setDebrief(null);
    setUnlocked(null);
    setBotTurn(null);
    setBotSpeaking(false);
    setBotSpeakDeadline(null);
    // A watcher too: lobby:closed reaches the spectator room as well, and
    // before this a swept debate left the watching screen up with a dead code.
    setSpectating(null);
    setSpecState(null);
    setSpecFeed(null);
    if (!opts?.keepNotice) setNotice(message);
  }, []);

  useEffect(() => {
    // A watcher's socket sits in the room it watches, so that room's debate
    // events reach it too. They belong to the Spectate screen, which has its
    // own listeners; App's are for the debaters. Taking them turned a
    // watcher's "stop watching" into a phantom verdict (QA 2026-09-13).
    const forMe = () =>
      !spectatingRef.current && (startedRef.current || Boolean(lobbyRef.current) || Boolean(botCodeRef.current));
    socket.on('lobby:update', (u) => {
      // A one-seat update with no lobby set is the host's own settings echo
      // from the stage (Home listens for those). Taking it would flip the
      // host into the green room's waiting view on the first chip tap. Every
      // real entry still lands: the guest is seated by the join ack, the host
      // sees two seats when the friend walks in, ranked comes by queue:matched,
      // and a guest leaving the green room happens while the lobby is set.
      if (!lobbyRef.current && u.participantCount === 1) return;
      // The watcher count rides in the room since 2026-09-13; spectate:count
      // keeps it live from there.
      if (typeof u.watchers === 'number') setWatchers(u.watchers);
      // A friend walked back in: the "they left" line is old news.
      if (u.participantCount === 2) setRoomNotice(null);
      setLobby(u);
    });
    // Spectator plumbing: the snapshot (kept here so the Spectate screen can
    // mount with it instead of racing the event) and the watcher count that
    // debaters must always see.
    socket.on('spectate:state', (s) => setSpecState(s));
    socket.on('spectate:count', (p) => setWatchers(p.n));
    socket.on('lobby:closed', ({ reason }) => {
      // A watcher gets the room's closing too. Theirs is one plain line, not
      // a reason written to one of the players.
      // The host shutting the door ("Just us") has its own words.
      if (spectatingRef.current) {
        return resetToHome(reason === 'closedWatchersOff' ? 'closedWatchersOff' : 'specRoomClosed');
      }
      // An empty reason is the server confirming a leave this player just
      // made (a bot game's "End it" included). The screen already says why
      // ("You left the debate."), so keep that line instead of blanking it
      // a few milliseconds later (2026-09-13 retest).
      if (!reason) return resetToHome(null, { keepNotice: true });
      // The server tells whoever stayed 'closedPeerLeft' whichever seat left
      // (index.ts lobby:leave). To a friend room's guest the one who left is
      // the host, and the host line says what to do next.
      const u = lobbyRef.current;
      resetToHome(reason === 'closedPeerLeft' && u?.role === 'guest' && !u.ranked ? 'closedHostLeft' : reason);
    });
    // Signalling can fail (a closed connection, keys the other side refuses).
    // A bare `void` here left those as unhandled rejections.
    socket.on('rtc:go', () => {
      beginOffer().catch((err) => console.warn('[rtc] offer failed', err));
    });
    socket.on('rtc:signal', (p) => {
      handleSignal(p).catch((err) => console.warn('[rtc] signal failed', err));
    });
    socket.on('debate:start', (p) => {
      startingRef.current = false;
      // Set here as well as on render: a resumed page gets debate:start and
      // the phase (or the verdict) back to back, and forMe() below must
      // already know it is in a debate when the second one lands.
      startDataRef.current = p;
      startedRef.current = true;
      // Play again from a bot verdict: the finished match clears in the same
      // render the new one arrives. The verdict released the mic, and start.bot
      // staying true would not re-run the media effect, so ask for it again.
      if (replayRef.current) {
        replayRef.current = false;
        setPhase(null);
        setEnded(false);
        setVerdictInfo(null);
        setJudgeStatus(null);
        setUnlocked(null);
        setMediaRetry((n) => n + 1);
      }
      setStart(p);
    });
    socket.on('debate:phase', (p) => {
      if (!forMe()) return;
      setBotFailed(false); // a new turn clears the last one's error
      setHeardWords(0);
      // Backstop: if the server force-advanced past the bot (its fallback
      // timer), the voice must never carry into the human's turn.
      if (startDataRef.current?.bot && p.activeSpeaker === startDataRef.current.yourSide) {
        stopBotVoice();
        setBotSpeaking(false);
        setBotSpeakDeadline(null);
      }
      setPhase(p);
    });
    // Proof the judge is receiving you, reduced to a count.
    socket.on('caption', (p) => {
      if (!forMe()) return;
      if (phaseRef.current && p.stepIndex !== phaseRef.current.stepIndex) return;
      setHeardWords((p.text.match(/\S+/g) ?? []).length);
    });
    socket.on('debate:ended', () => {
      if (!forMe()) return;
      clearLive(); // from here a reload recovers the verdict (yap.resume) instead
      setEnded(true);
      stopTurn();
      stopTurnRecording(); // flushes the final turn's audio upload
      stopBotVoice();
      setBotTurn(null);
      setBotSpeaking(false);
      setBotSpeakDeadline(null);
      if (startDataRef.current?.bot) {
        // Bot debates: no peer to stay live for — camera and mic OFF at the
        // verdict. (An active camera with no self-view on screen is exactly
        // the invisible-mic problem we swore off.)
        releaseMedia();
        setLocalStream(null);
      } else {
        setMicEnabled(true); // friend mode: free chat while the judge deliberates
      }
      // A refresh may now safely resume (a bot game by its ack's code).
      storeResume(lobbyRef.current?.code ?? botCodeRef.current, Boolean(lobbyRef.current?.ranked));
    });
    socket.on('bot:turn', (p) => {
      // Generation broke on our side. Say so on screen and move on after a beat
      // rather than passing a silent turn that looks like the bot is mute.
      if (p.failed) {
        setBotFailed(true);
        setBotSpeaking(false);
        setBotSpeakDeadline(null);
        setTimeout(() => socket.emit('bot:done', { stepIndex: p.stepIndex }), 2600);
        return;
      }
      // The bot's spoken turn: show its text, animate the avatar, and speak it.
      // It gets the same shot clock a human gets for this phase (speakSeconds):
      // finish early and the turn passes early; run over and the voice is cut.
      const speakSec = phaseRef.current?.speakSeconds ?? 60;
      setBotTurn({ stepIndex: p.stepIndex, text: p.text });
      setBotSpeaking(true);
      setBotSpeakDeadline(Date.now() + speakSec * 1000);
      playBotTurn(
        p.text,
        p.audio,
        p.mime,
        langRef.current,
        () => {
          setBotSpeaking(false);
          setBotSpeakDeadline(null);
          socket.emit('bot:done', { stepIndex: p.stepIndex });
        },
        speakSec * 1000,
      );
    });
    socket.on('debate:aborted', ({ reason, vars }) => {
      if (!forMe()) return;
      clearLive();
      stopTurn();
      stopTurnRecording();
      stopBotVoice();
      releaseMedia(); // camera light off on the cancelled screen
      clearResume();
      setLocalStream(null);
      setRemoteStream(null);
      setBotTurn(null);
      setBotSpeakDeadline(null);
      setAbortInfo({ key: reason, vars });
    });
    socket.on('peer:connection', (p) =>
      setPeerLostUntil(p.state === 'lost' ? (p.graceDeadline ?? Date.now() + 15000) : null),
    );
    socket.on('verdict:status', (p) => {
      if (!forMe()) return;
      stopTurn(); // never leave the recognizer running past the debate
      setJudgeStatus(p);
    });
    socket.on('verdict:result', (p) => {
      if (!forMe()) return;
      stopTurn();
      clearResume(); // don't re-fetch (and re-save the receipt) on a later refresh
      setVerdictInfo(p);
      setJudgeStatus(null);
      // Device-local history only. The server still remembers nothing.
      const s = startDataRef.current;
      if (s) {
        const mySide = s.yourSide;
        const theirSide = mySide === 'FOR' ? 'AGAINST' : 'FOR';
        const sum = (x: { argument: number; evidence: number; clash: number; delivery: number }) =>
          x.argument + x.evidence + x.clash + x.delivery;
        saveReceipt({
          at: Date.now(),
          topic: s.topic[langRef.current],
          me: s.names[mySide],
          them: s.names[theirSide],
          won: p.verdict.winner === mySide,
          myTotal: sum(p.verdict.scores[mySide]),
          theirTotal: sum(p.verdict.scores[theirSide]),
          // Kept so the home screen can tell you what you are ALWAYS weak at,
          // which one verdict can never show you.
          scores: p.verdict.scores[mySide],
        });
      }
    });
    // End of the tutorial: the YapMaster's notes instead of a verdict.
    socket.on('tutorial:debrief', (p) => {
      stopTurn();
      clearResume();
      setJudgeStatus(null);
      setDebrief(p);
    });
    socket.on('campaign:up', (p) => setUnlocked(p));
    socket.on('rematch:update', (p) => setRematch(p));
    socket.on('rematch:go', () => {
      // Both agreed: drop the finished-debate state and fall back to the green
      // room. The call starts over on BOTH sides. The server clears both
      // rtc:ready marks for the rematch (index.ts resetForRematch) and sends
      // the host rtc:go only once each side has said rtc:ready again, so each
      // side closes whatever connection it had (a live one, one left 'failed'
      // by the other pressing "Leave the call", or none) and the bump re-runs
      // the media effect (the mic comes back if this side left the call) and
      // the peer effect, whose setupPeer says rtc:ready on a fresh connection.
      // Only the side that had left used to say it again; the other kept its
      // dead connection, no offer was ever made, and both green rooms sat on
      // "Connecting..." for good (QA 2026-09-13).
      teardownPeer();
      setRemoteStream(null);
      setRemoteVideoDead(false);
      setRtcState(null);
      setMediaRetry((n) => n + 1);
      startedRef.current = false;
      startDataRef.current = null;
      setStart(null);
      setPhase(null);
      setEnded(false);
      setVerdictInfo(null);
      setJudgeStatus(null);
      setAbortInfo(null);
      setRematch(null);
      setUnlocked(null);
      clearResume();
    });
    // Losing the socket mid-debate is the honest place to handle a server that
    // went away, and it covers every cause: a deploy, a crash, or bad wifi. The
    // server cannot be relied on to say goodbye — Railway kills the container
    // without a shutdown signal, which was verified rather than assumed.
    // The host of a friend room hears when the guest walks out: the room
    // waits again under the same code (index.ts reopenAfterGuestLeft).
    socket.on('lobby:notice', (p) => setRoomNotice({ key: p.reason, x: p.vars?.x }));
    socket.on('disconnect', () => {
      setOffline(true);
      if (!startedRef.current || endedRef.current || settledRef.current) return;
      // A bot debate is resumed by the room code its start ack carried (the
      // 'connect' handler below), so a blip is not the end of it. Only a
      // game with no code (an older server), or a connection that stays
      // gone, is called. Friend debates are resumed the same way.
      if (startDataRef.current?.bot) {
        stopTurn();
        stopTurnRecording();
        if (!botCodeRef.current) {
          stopBotVoice();
          setAbortInfo({ key: 'debateStopped' });
          return;
        }
        clearTimeout(dropTimer.current);
        dropTimer.current = setTimeout(() => {
          if (socket.connected || settledRef.current) return;
          stopBotVoice();
          setAbortInfo({ key: 'debateStopped' });
        }, 20_000);
      }
    });
    socket.on('connect', () => {
      setOffline(false);
      clearTimeout(dropTimer.current);
      // Transient reconnect at ANY stage: try to reclaim our seat. A refreshed
      // page has a new sessionId so this only fires for true network blips.
      const botCode = lobbyRef.current ? null : botCodeRef.current;
      const code = lobbyRef.current?.code ?? botCode;
      if (!code || settledRef.current) return;
      socket.emit('lobby:resume', { code, sessionId: session.id }, (res) => {
        if (res.ok) return;
        if (botCode) {
          // The bot game is gone (a deploy took the server's memory with it).
          stopTurn();
          stopTurnRecording();
          stopBotVoice();
          if (!startedRef.current) return resetToHome('debateStopped');
          setAbortInfo({ key: endedRef.current ? 'verdictLost' : 'debateStopped' });
          return;
        }
        if (startedRef.current) {
          // Post-debate the honest story is "the server lost the verdict",
          // not "your connection died".
          setAbortInfo({ key: endedRef.current ? 'verdictLost' : 'connDied' });
          return;
        }
        // Green room: our seat is gone but the lobby may still be alive
        // (guest drops return it to 'waiting') — rejoin before giving up.
        const u = lobbyRef.current;
        if (u?.code && u.yourName) {
          socket.emit(
            'lobby:join',
            { code: u.code, sessionId: session.id, name: u.yourName, playerId: playerId() },
            (res2) => {
              if (res2.ok) setLobby(res2.update);
              else resetToHome('lostLobby');
            },
          );
        } else {
          resetToHome('lostLobby');
        }
      });
    });

    return () => {
      socket.off('lobby:update');
        socket.off('lobby:closed');
      socket.off('rtc:go');
      socket.off('rtc:signal');
      socket.off('debate:start');
      socket.off('debate:phase');
      socket.off('debate:ended');
      socket.off('debate:aborted');
      socket.off('peer:connection');
      socket.off('verdict:status');
      socket.off('verdict:result');
      socket.off('rematch:update');
      socket.off('rematch:go');
      socket.off('bot:turn');
      socket.off('tutorial:debrief');
      socket.off('campaign:up');
      socket.off('spectate:state');
      socket.off('spectate:count');
      socket.off('caption');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('lobby:notice');
    };
  }, [resetToHome]);

  // Boot-time verdict recovery: if the page died between debate end and the
  // verdict, adopt the pre-refresh session identity and resume — the server
  // re-sends the whole end-state (names, verdict or judge status).
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(RESUME_KEY);
      sessionStorage.removeItem(RESUME_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const { code, sid, ranked } = JSON.parse(raw) as { code?: string; sid?: string; ranked?: boolean };
      if (!code || !sid) return;
      session.id = sid;
      if (ranked) setBootRanked(true);
      const attempt = () => {
        socket.emit('lobby:resume', { code, sessionId: sid }, () => {
          // On success the resent events drive the UI; on failure stay Home.
        });
      };
      if (socket.connected) attempt();
      else socket.once('connect', attempt);
    } catch {
      // corrupt entry — ignore
    }
  }, []);

  // A reload in the middle of a game (yap.live, stamped on pagehide): take
  // the seat back under the old session id. The server resends the debate
  // (or the green room) itself; the room comes back from the record, so the
  // call can be rebuilt. If the seat is gone, one plain line on the lobby
  // instead of silence.
  useEffect(() => {
    const rec = takeLive();
    if (!rec?.at) return;
    const age = Date.now() - rec.at;
    const lost = rec.debating ? 'reloadEnded' : 'reloadRoomClosed';
    if (age > LIVE_RESUME_MS) {
      // The server has let the seat go. Long ago, it is a restored tab and
      // there is nothing worth saying.
      if (age < LIVE_NOTICE_MS) setNotice(lost);
      return;
    }
    session.id = rec.sid;
    if (rec.lobby) setRankedRoom(Boolean(rec.lobby.ranked));
    setResuming(true);
    let done = false;
    const finish = (key: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      setResuming(false);
      if (key) setNotice(key);
    };
    const attempt = () => {
      socket.emit('lobby:resume', { code: rec.code, sessionId: rec.sid }, (res) => {
        if (done) return;
        if (res.ok) {
          // Before the resent events land (they follow this ack), so the
          // handlers above treat them as this page's.
          if (rec.bot) botCodeRef.current = rec.code;
          else if (rec.lobby && !lobbyRef.current) {
            lobbyRef.current = rec.lobby;
            setLobby(rec.lobby);
          }
          // A reloaded page may not play sound until it is touched (autoplay
          // rules): the first tap anywhere unlocks the voices again.
          window.addEventListener(
            'pointerdown',
            () => {
              initAudio();
              unlockBotVoice();
            },
            { once: true, capture: true },
          );
          return finish(null);
        }
        // A friend room's guest seat is freed the moment its tab goes (the
        // room waits again under the same code), so walk back in.
        const u = rec.lobby;
        if (!rec.debating && u && u.role === 'guest' && !u.ranked) {
          socket.emit(
            'lobby:join',
            { code: u.code, sessionId: session.id, name: u.yourName, playerId: playerId() },
            (again) => {
              if (!again.ok) return finish(lost);
              lobbyRef.current = again.update;
              setLobby(again.update);
              finish(null);
            },
          );
          return;
        }
        finish(lost);
      });
    };
    // No answer at all (the server cannot be reached): stop holding the lockup.
    const timer = setTimeout(() => finish(lost), 10_000);
    if (socket.connected) attempt();
    else socket.once('connect', attempt);
  }, []);

  // Keep yap.live in step with what a reload would have to come back to: a
  // green room, or a debate until it ends (yap.resume takes the verdict).
  useEffect(() => {
    const code = lobby?.code ?? (start ? botCodeRef.current : null);
    if (!code || ended || verdictInfo || abortInfo || debrief || spectating) {
      clearLive();
      return;
    }
    saveLive({ code, sid: session.id, bot: !lobby, lobby, debating: Boolean(start) });
  }, [lobby, start, ended, verdictInfo, abortInfo, debrief, spectating]);

  useEffect(() => {
    window.addEventListener('pagehide', stampLive);
    return () => window.removeEventListener('pagehide', stampLive);
  }, []);

  // The lobby's waiting room (socket.ts yap.room) is done with once this
  // page holds a room of its own: the friend walked in, or it is another
  // room altogether. From here yap.live brings a reload back instead, and a
  // stale record must never take this session back into a finished game.
  const inRoom = Boolean(lobby);
  useEffect(() => {
    if (inRoom) forgetRoom();
  }, [inRoom]);

  // A connection that goes quiet without closing (wifi that stops passing
  // packets) only reaches the socket's disconnect once the server's ping and
  // its timeout have both run out (index.ts: 10 s and 15 s). The server pings
  // every ten seconds, so a live debate that has heard nothing at all for a
  // ping and a few seconds more shows the reconnecting state early. Anything
  // from the server clears it; a real disconnect takes over from there.
  const [stalled, setStalled] = useState(false);
  const liveDebate = Boolean(start) && !ended && !verdictInfo && !abortInfo && !debrief;
  useEffect(() => {
    if (!liveDebate) return;
    // The interval the server announced in its handshake (a private field,
    // hence the fallback to the library default).
    const engine = socket.io.engine as unknown as { _pingInterval?: number } | undefined;
    const every = engine?._pingInterval && engine._pingInterval > 0 ? engine._pingInterval : 25_000;
    const limit = Math.max(12_000, every + 4_000);
    let last = Date.now();
    let flagged = false;
    const heard = () => {
      last = Date.now();
      if (flagged) {
        flagged = false;
        setStalled(false);
      }
    };
    // A phone that slept heard nothing through no fault of the line: the
    // count starts again when the page comes back.
    const onVis = () => {
      if (document.visibilityState === 'visible') last = Date.now();
    };
    socket.io.on('ping', heard);
    socket.io.on('packet', heard);
    document.addEventListener('visibilitychange', onVis);
    const timer = setInterval(() => {
      if (!flagged && socket.connected && Date.now() - last > limit) {
        flagged = true;
        setStalled(true);
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      socket.io.off('ping', heard);
      socket.io.off('packet', heard);
      document.removeEventListener('visibilitychange', onVis);
      setStalled(false);
    };
  }, [liveDebate]);

  // "We heard you" indicator: transcript chunk (browser STT) or captured
  // audio data (server STT) both count as proof of life.
  useEffect(() => {
    setOnChunk(() => setSpeechHeard(true));
    setOnRecordingActive(() => setSpeechHeard(true));
    return () => {
      setOnChunk(null);
      setOnRecordingActive(null);
    };
  }, []);

  // Local tracks dying (unplugged cam, revoked permission) and the remote
  // camera dying are both invisible to connectionState — surface them.
  useEffect(() => {
    setTrackHealthHandlers(
      () => setMediaError('trackDied'),
      (dead) => setRemoteVideoDead(dead),
    );
    return () => setTrackHealthHandlers(null, null);
  }, []);

  // Recognition listens in the UI language (English or Arabic).
  useEffect(() => {
    setSpeechLang(lang);
  }, [lang]);

  const langRef = useRef(lang);
  langRef.current = lang;

  // The Jubilee rule: your mic exists only on your turn. Driven by server
  // phase events, never by the countdown display. Transcription source:
  // server Whisper (any browser) when available, else browser recognition.
  useEffect(() => {
    if (!start || !phase || ended || abortInfo) return;
    const myTurn = phase.activeSpeaker === start.yourSide;
    setMicEnabled(myTurn);
    setSpeechHeard(false); // fresh turn, fresh proof-of-life
    const serverStt =
      (Boolean(lobbyRef.current?.sttAvailable) || sttGlobalRef.current) && recordingSupported;
    if (myTurn) {
      if (serverStt && localStream) startTurnRecording(localStream, phase.stepIndex);
      else startTurn(phase.stepIndex);
    } else {
      stopTurn();
      stopTurnRecording();
    }
  }, [phase, start, ended, abortInfo, localStream]);

  // Phone lifecycle during a turn: flush the recording the moment we're
  // hidden (the OS may kill the page while backgrounded — partial audio beats
  // none; the server joins multiple blobs per turn), and start a fresh
  // recording if we come back with the turn still running.
  useEffect(() => {
    const onVis = () => {
      const s = startDataRef.current;
      const p = phaseRef.current;
      if (!s || !p || endedRef.current) return;
      const myTurn = p.activeSpeaker === s.yourSide;
      const serverStt =
        (Boolean(lobbyRef.current?.sttAvailable) || sttGlobalRef.current) && recordingSupported;
      if (!myTurn || !serverStt) return;
      if (document.visibilityState === 'hidden') {
        stopTurnRecording();
      } else if (localStreamRef.current) {
        startTurnRecording(localStreamRef.current, p.stepIndex);
      }
    };
    const onPageHide = () => stopTurnRecording();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  // Anti-cheat, softest signal: how long you spent somewhere else while it was
  // YOUR turn to talk. Reported, never enforced, and easy to spoof — it only
  // matters when the transcript signals agree with it. Nothing about the words
  // is sent here, just milliseconds.
  useEffect(() => {
    let awaySince: number | null = null;
    const away = () => {
      const s = startDataRef.current;
      const p = phaseRef.current;
      return Boolean(s && p && !endedRef.current && p.activeSpeaker === s.yourSide);
    };
    const leave = () => {
      if (awaySince === null && away()) awaySince = Date.now();
    };
    const back = () => {
      if (awaySince === null) return;
      const ms = Date.now() - awaySince;
      awaySince = null;
      if (ms > 1500) socket.emit('turn:away', { ms });
    };
    const onVis = () => (document.visibilityState === 'hidden' ? leave() : back());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', back);
    };
  }, []);

  // One keystroke (F5, pull-to-refresh) kills a live session — warn first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const inLiveSession =
        (startedRef.current && !settledRef.current) ||
        (lobbyRef.current?.participantCount ?? 0) === 2;
      if (!inLiveSession || settledRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Leaving the page after a game is settled (the verdict's "back to the
  // lobby" reloads, or the tab closes): give the room back. Only once
  // settled: a debate that ended but is still being judged must stay
  // resumable for the refresh that comes back for its verdict.
  useEffect(() => {
    const onHide = () => {
      if (settledRef.current && (botCodeRef.current || lobbyRef.current)) leaveRoom();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // Keep the screen awake from fight card through verdict — the call is live
  // the whole way, not just during turns. (Wake locks auto-release when the
  // page hides; re-acquire on return.)
  useEffect(() => {
    if (!start) return;
    let lock: { release?: () => Promise<void> } | null = null;
    const request = () => {
      (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<never> } }).wakeLock
        ?.request('screen')
        .then((l) => {
          lock = l as typeof lock;
        })
        .catch(() => {});
    };
    request();
    const onVis = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release?.().catch(() => {});
    };
  }, [Boolean(start)]);

  // ICE 'failed' is not terminal: the host (sole offerer) attempts restarts
  // while the state stays failed. Fixes wifi→hotspot switches mid-debate.
  useEffect(() => {
    if (rtcState !== 'failed' || lobby?.role !== 'host') return;
    let attempts = 0;
    const tick = () => {
      if (attempts >= 3) return;
      attempts += 1;
      void attemptIceRestart();
    };
    tick();
    const timer = setInterval(tick, 7000);
    return () => clearInterval(timer);
  }, [rtcState, lobby?.role]);

  // Camera starts the moment you're in a lobby OR picking a bot: the solo green
  // room / bot picker is a mirror check, not a dead black rectangle. Also
  // surfaces permission problems before the debate.
  // Masked play never holds a camera: no permission prompt, and if one was
  // already granted the track is STOPPED so the camera light actually goes out.
  // Un-masking re-acquires through the media effect below (mediaRetry bump).
  const maskedRef = useRef(false);
  useEffect(() => {
    // BOT and TUTORIAL modes have no lobby object on the client (bot:start goes
    // straight to debate:start). They are ALWAYS masked (2026-09-04, his
    // call): the camera is a friend-room option, nothing else ever asks.
    const masked = lobby ? Boolean(lobby.yourMasked) : true;
    if (masked === maskedRef.current) return;
    maskedRef.current = masked;
    setAudioOnly(masked);
    releaseMedia();
    setLocalStream(null);
    setMediaRetry((n) => n + 1);
  }, [lobby?.yourMasked, lobby]);

  useEffect(() => {
    if (!lobby && !botPicking && !tutoring && !start?.bot) return;
    let cancelled = false;
    void (async () => {
      try {
        const stream = await ensureLocalStream();
        if (!cancelled) {
          setLocalStream(stream);
          setMediaError(null);
        }
      } catch {
        // i18n key, rendered via t(). Masked play never asked for a camera,
        // so its error names the mic alone.
        if (!cancelled) setMediaError(maskedRef.current ? 'micError' : 'mediaError');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lobby?.code, botPicking, tutoring, Boolean(start?.bot), mediaRetry]);

  // Peer link only when both corners are occupied.
  useEffect(() => {
    if (!lobby) return;
    if (lobby.participantCount === 2) {
      let cancelled = false;
      void (async () => {
        try {
          await ensureLocalStream();
          if (cancelled) return;
          setupPeer(
            lobby.iceServers,
            (s) => setRemoteStream(s),
            (state) => setRtcState(state),
          );
        } catch {
          // camera effect above already surfaced the error
        }
      })();
      return () => {
        cancelled = true;
      };
    } else {
      teardownPeer();
      setRemoteStream(null);
      setRtcState(null);
    }
  }, [lobby?.code, lobby?.participantCount, mediaRetry]);

  const handleEntered = useCallback((u: LobbyUpdate) => {
    setNotice(null);
    setLobby(u);
  }, []);

  const onTutorial = useCallback((name: string) => {
    setNotice(null);
    setBotName(name);
    setTutoring(true);
  }, []);

  const startTutorial = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    // The mic before the server call. Refused, the intro screen shows the
    // fix and a Retry instead of starting a lesson nobody can speak in.
    try {
      const s = await ensureLocalStream();
      setLocalStream(s);
      setMediaError(null);
    } catch {
      startingRef.current = false;
      setMediaError(maskedRef.current ? 'micError' : 'mediaError');
      return;
    }
    if (botCodeRef.current) {
      leaveRoom();
      botCodeRef.current = null;
    }
    socket.emit(
      'tutorial:start',
      { sessionId: session.id, name: botName, lang: langRef.current, playerId: playerId() },
      (res) => {
        if (res.ok) {
          botCodeRef.current = res.code ?? null;
          return; // debate:start arrives next and renders the lesson
        }
        startingRef.current = false;
        const map: Record<string, string> = {
          rate_limited: 'errRateLimited',
          bad_name: 'errBadName',
          locked: 'errLocked',
          judge_down: 'errJudgeDown',
          in_progress: 'errBusy',
          busy_elsewhere: 'errBusyElsewhere',
        };
        resetToHome(map[res.error ?? ''] ?? 'lostLobby');
      },
    );
  }, [botName, resetToHome]);

  // "Take on the bots": from the debrief to the lobby's bots tab, where the
  // bots are picked now (the old BotSelect screen is not the way in). The
  // mic goes off until the next go button asks for it.
  const trainAfterTutorial = useCallback(() => {
    stopBotVoice();
    clearResume();
    releaseMedia();
    setLocalStream(null);
    // The lesson's room goes back, or the first bot start gets in_progress.
    leaveRoom();
    botCodeRef.current = null;
    setStart(null);
    setPhase(null);
    setEnded(false);
    setDebrief(null);
    setJudgeStatus(null);
    setTutoring(false);
    setUnlocked(null);
    setHomeMode('bot');
  }, []);

  /** Start a bot debate under an explicit name. The lobby picks the bot itself
      now, so it has the name in hand and does not need the two-step dance
      through botName state that the old BotSelect screen relied on. */
  const startBotAs = useCallback(
    async (who: string, c: BotStartConfig): Promise<StartResult> => {
      if (startingRef.current) return 'busy';
      startingRef.current = true;
      setNotice(null);
      // The mic before the server call: a refused mic must never become a
      // debate with a silent seat. The lobby asked on the same tap, so this
      // is instant from there; it matters for "play again" on a verdict.
      try {
        await ensureLocalStream();
      } catch {
        startingRef.current = false;
        return 'mic';
      }
      // "Play again" from a verdict: the finished game's room is still this
      // socket's until it is left, and the server refuses the new start.
      if (botCodeRef.current) {
        leaveRoom();
        botCodeRef.current = null;
      }
      setBotName(who);
      lastBotRef.current = { who, c };
      return new Promise<StartResult>((resolve) => {
        // An ack that never comes (the socket is down) must not leave every
        // go button dead for good.
        const stuck = setTimeout(() => {
          if (!startedRef.current) startingRef.current = false;
          resolve('failed');
        }, 15_000);
        socket.emit(
          'bot:start',
          { sessionId: session.id, name: who, lang: langRef.current, playerId: playerId(), ...c },
          (res) => {
            clearTimeout(stuck);
            if (res.ok) {
              botCodeRef.current = res.code ?? null;
              resolve('ok'); // debate:start arrives next and renders the debate
              return;
            }
            startingRef.current = false;
            const map: Record<string, string> = {
              rate_limited: 'errRateLimited',
              bad_name: 'errBadName',
              locked: 'errLocked',
              // The placement match is ranked business: same gates as the queue.
              signed_out: 'signInRanked',
              placed: 'errPlaced',
              // A debate still running on this socket, or (placement) the
              // placement already running in another tab.
              in_progress: c.placement ? 'errPlacing' : 'errBusy',
              unplaced: 'errUnplaced',
              judge_down: 'errJudgeDown',
              // A live seat in another tab or device (one player, one seat).
              busy_elsewhere: 'errBusyElsewhere',
            };
            resetToHome(map[res.error ?? ''] ?? 'lostLobby');
            resolve('failed');
          },
        );
      });
    },
    [resetToHome],
  );

  const startBot = useCallback((c: BotStartConfig) => startBotAs(botName, c), [botName, startBotAs]);

  // The verdict's "Play Moss again". Runs inside the tap, which is where the
  // audio unlocks must happen (the lobby's Go button does the same two).
  // Placement is one game ever, so it is never replayed from here.
  const playBotAgain = useCallback(() => {
    const last = lastBotRef.current;
    if (!last || last.c.placement) return;
    stopBotVoice();
    initAudio();
    unlockBotVoice();
    clearResume();
    replayRef.current = true;
    void startBotAs(last.who, last.c).then((r) => {
      if (r === 'mic') resetToHome('micError');
      // No answer at all: a refused start already went home with its reason.
      else if (r === 'failed' && replayRef.current) resetToHome('lostLobby');
    });
  }, [startBotAs, resetToHome]);

  // Dead local track with a live call: re-acquire and hot-swap (replaceTrack,
  // no renegotiation). Without a prior stream, fall back to the full retry
  // path so the peer connection gets built with the new tracks.
  const retryMedia = useCallback(() => {
    if (localStreamRef.current) {
      void reacquireMedia()
        .then((s) => {
          setLocalStream(s);
          setMediaError(null);
        })
        .catch(() => setMediaError(maskedRef.current ? 'micError' : 'mediaError'));
    } else {
      setMediaRetry((n) => n + 1);
    }
  }, []);

  // The socket handlers read who is watching from a ref (see forMe).
  spectatingRef.current = spectating;

  /** Everything "stop watching" clears. The watched room's debate events
      never reach the debaters' state (forMe), and this also drops anything a
      late one set, so leaving can never fall through to a verdict or a
      cancelled screen that was never this page's. */
  const endSpectate = useCallback(() => {
    spectatingRef.current = null;
    setSpectating(null);
    setSpecState(null);
    setSpecFeed(null);
    setEnded(false);
    setVerdictInfo(null);
    setJudgeStatus(null);
    setAbortInfo(null);
  }, []);

  // Which in-app screen owns the current history entry (see pushOverlay).
  const overlayRef = useRef<Overlay | null>(null);
  overlayRef.current = viewingDrill ? 'drill' : viewingMatches ? 'matches' : spectating ? 'spectate' : null;

  // Browser Back (or Android's back gesture) on one of those screens: back
  // to the lobby, not out of YapStage.
  useEffect(() => {
    const onPop = () => {
      const open = overlayRef.current;
      if (!open || overlayEntry() === open) return;
      overlayRef.current = null;
      if (open === 'drill') setViewingDrill(false);
      else if (open === 'matches') setViewingMatches(false);
      else {
        socket.emit('spectate:leave');
        endSpectate();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [endSpectate]);

  /** Closed from inside the app: the screen goes, then its history entry. */
  const closeOverlay = useCallback(
    (kind: Overlay) => {
      overlayRef.current = null;
      if (kind === 'drill') setViewingDrill(false);
      else if (kind === 'matches') setViewingMatches(false);
      else endSpectate();
      dropOverlayEntry();
    },
    [endSpectate],
  );

  // The in-app way out of a live debate (Debate.tsx, Leave).
  const leaveDebate = useCallback(() => {
    const s = startDataRef.current;
    clearLive();
    if (!s || s.bot) {
      // A bot game (the lesson and the placement too) can be walked out of
      // any time before its verdict: the server calls it off and files
      // nothing (index.ts lobby:leave). resetToHome hands the room back, and
      // the lobby says so in the same words a friend or ranked game does.
      resetToHome('leftDebate');
      return;
    }
    // A human debate has no mid-debate lobby:leave on the server: walking
    // out is the path the unload warning guards. This seat's connection
    // goes, the server's grace runs out and the debate is called for both
    // (in ranked the walk-out costs the game, judge.ts applyForfeit). The
    // socket comes straight back under a NEW session, so nothing resumes the
    // seat that was just given up, and the lobby works at once.
    socket.emit('lobby:leave'); // ignored mid-debate today; right if the server learns it
    lobbyRef.current = null;
    startedRef.current = false;
    startDataRef.current = null;
    resetToHome('leftDebate');
    session.id = crypto.randomUUID();
    socket.disconnect();
    socket.connect();
  }, [resetToHome]);

  // Characters come with an account: a guest wears the grey silhouette on
  // every screen, the same one the server seats them in.
  const selfMask = account?.signedIn ? (account.mask ?? MASK_IDS[0]) : GUEST_AVATAR;

  let content;
  // The tab's name for the screen on show ("Debate · YapStage"); null keeps
  // index.html's title, which is the lobby's.
  let titleKey: string | null = null;
  // Home reads initialMode once, when it mounts; homeMode is spent then.
  let showingHome = false;
  if (account?.signedIn && account.needsName) {
    titleKey = 'titleClaim';
    content = (
      <ClaimName
        onClaimed={(name) => setAccount({ ...account, name, needsName: false })}
      />
    );
  } else if (viewingDrill) {
    titleKey = 'drillPill';
    content = <Drill onBack={() => closeOverlay('drill')} />;
  } else if (viewingMatches) {
    titleKey = 'myMatches';
    content = (
      <Matches
        onBack={() => closeOverlay('matches')}
        onPlayBot={() => {
          setHomeMode('bot');
          closeOverlay('matches');
        }}
      />
    );
  } else if (spectating) {
    titleKey = 'titleWatching';
    content = (
      // Keyed by the room: "next" is a different debate, so the screen
      // mounts fresh instead of carrying the last one's state across.
      <Spectate
        key={spectating}
        code={spectating}
        initial={specState}
        onLeave={() => closeOverlay('spectate')}
        onNext={
          specFeed
            ? () => {
                setSpecState(null);
                const cat = specFeed.category ? `&category=${encodeURIComponent(specFeed.category)}` : '';
                // "Next" stays on the same history entry; running out of
                // debates goes back over it like any other way out.
                void fetch(`/spectate/random?not=${spectating}${cat}`)
                  .then((r) => r.json())
                  .then((d: { code: string | null }) => {
                    if (!d.code) return closeOverlay('spectate');
                    socket.emit('spectate:join', { code: d.code }, (res) => {
                      if (!res.ok) return closeOverlay('spectate');
                      spectatingRef.current = d.code;
                      setSpectating(d.code);
                    });
                  })
                  .catch(() => closeOverlay('spectate'));
              }
            : undefined
        }
      />
    );
  } else if (abortInfo) {
    titleKey = 'cancelled';
    content = (
      <div className="stage center-col">
        <p className="kicker">{t('cancelled')}</p>
        <h1 className="display">{t(abortInfo.key, abortInfo.vars)}</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            leaveRoom();
            window.location.assign('/');
          }}
        >
          {t('backHome')}
        </button>
      </div>
    );
  } else if (debrief) {
    titleKey = 'tutorialPill';
    content = (
      <TutorialDone
        debrief={debrief}
        unlocked={unlocked}
        onTrain={trainAfterTutorial}
        onHome={() => {
          leaveRoom();
          window.location.assign('/');
        }}
      />
    );
  } else if (ended || verdictInfo) {
    titleKey = 'titleResults';
    content = (
      <VerdictScreen
        info={verdictInfo}
        status={judgeStatus}
        mySide={start?.yourSide}
        topic={start?.topic ?? null}
        framing={start?.framing ?? null}
        localStream={localStream}
        remoteStream={remoteStream}
        rtcConnected={rtcState === 'connected'}
        peerName={start ? start.names[start.yourSide === 'FOR' ? 'AGAINST' : 'FOR'] : 'them'}
        myName={start ? start.names[start.yourSide] : 'you'}
        onLeaveCall={() => {
          releaseMedia();
          setLocalStream(null);
          setRemoteStream(null);
          setRtcState(null);
        }}
        onRetry={() => socket.emit('verdict:retry')}
        rematch={rematch}
        onRematch={() => socket.emit('rematch')}
        botOpponent={start?.bot ?? null}
        ranked={Boolean(lobby?.ranked) || bootRanked}
        unlocked={unlocked}
        avatars={start?.avatars ?? null}
        opponentRating={start?.bot?.elo}
        onPlayAgain={
          start?.bot && lastBotRef.current && !lastBotRef.current.c.placement ? playBotAgain : undefined
        }
      />
    );
  } else if (start) {
    titleKey = 'titleDebate';
    content = (
      <Debate
        start={start}
        phase={phase}
        localStream={localStream}
        remoteStream={remoteStream}
        remoteVideoDead={remoteVideoDead}
        peerLostUntil={peerLostUntil}
        rtcState={rtcState}
        speechHeard={speechHeard}
        speechSupported={speechSupported}
        sttServer={(Boolean(lobby?.sttAvailable) || sttGlobalRef.current) && recordingSupported}
        mediaError={mediaError}
        onRetryMedia={retryMedia}
        botOpponent={start.bot ?? null}
        botTurn={botTurn}
        botSpeaking={botSpeaking}
        botSpeakDeadline={botSpeakDeadline}
        botFailed={botFailed}
        heardWords={heardWords}
        watchers={watchers}
        onPassMic={(stepIndex) => socket.emit('turn:done', { stepIndex })}
        ranked={Boolean(lobby?.ranked)}
        offline={offline || stalled}
        onLeave={leaveDebate}
      />
    );
  } else if (botPicking) {
    titleKey = 'titleBots';
    content = (
      <BotSelect
        localStream={localStream}
        mediaError={mediaError}
        onRetryMedia={retryMedia}
        selfMask={selfMask}
        onStart={startBot}
        onTutorial={() => {
          setBotPicking(false);
          setTutoring(true);
        }}
        onBack={() => {
          setBotPicking(false);
          releaseMedia();
          setLocalStream(null);
        }}
      />
    );
  } else if (tutoring) {
    titleKey = 'tutorialPill';
    content = (
      <TutorialIntro
        localStream={localStream}
        mediaError={mediaError}
        onRetryMedia={retryMedia}
        selfMask={selfMask}
        onStart={startTutorial}
        onBack={() => {
          setTutoring(false);
          releaseMedia();
          setLocalStream(null);
        }}
      />
    );
  } else if (lobby) {
    titleKey = 'titleGreenRoom';
    content = (
      <GreenRoom
        lobby={lobby}
        localStream={localStream}
        remoteStream={remoteStream}
        mediaError={mediaError}
        speechSupported={speechSupported}
        rtcState={rtcState}
        onRetryMedia={retryMedia}
        notice={lobby.participantCount === 1 ? roomNotice : null}
        watchers={watchers}
        peerLostUntil={peerLostUntil}
      />
    );
  } else if (!account || resuming) {
    // (resuming: a reload is taking its seat back; the lobby would start
    // opening rooms and joining queues underneath it.)
    // The boot /auth/me has not answered yet, so we do not know who this is.
    // Hold the brand lockup instead of guessing: a lobby drawn for a guest
    // and redrawn for the account a frame later flashes, and the empty plum
    // div that once stood here made the first frame of the app a blank
    // screen. The held lockup is the same drawing the splash ends on, so on a
    // cold load the two are one image.
    content = <Splash hold />;
  } else {
    showingHome = true;
    content = (
      <Home
        account={account}
        notice={notice}
        onEntered={handleEntered}
        onSpectate={(code, feed) => {
          // Every screen off the lobby gets a history entry, so Back lands
          // on the lobby instead of leaving YapStage.
          pushOverlay('spectate');
          spectatingRef.current = code;
          setSpectating(code);
          setSpecFeed(feed);
        }}
        onMatches={() => {
          pushOverlay('matches');
          setViewingMatches(true);
        }}
        onMaskSaved={(mask) => setAccount({ ...account, mask })}
        onDrill={() => {
          pushOverlay('drill');
          setViewingDrill(true);
        }}
        onBotStart={startBotAs}
        onTutorial={onTutorial}
        initialMode={homeMode}
      />
    );
  }

  // Spent once the lobby has mounted with it (after the lesson or the empty
  // record's "play a bot"): coming back later opens on the usual tab
  // (ranked signed in, bots for a guest), never on a stale one.
  useEffect(() => {
    if (showingHome && homeMode) setHomeMode(undefined);
  }, [showingHome, homeMode]);

  useEffect(() => {
    document.title = titleKey ? `${t(titleKey)} · YapStage` : BASE_TITLE;
    // t is rebuilt every render; the language is what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleKey, lang]);

  return (
    <>
      <LangToggle />
      {/* A screen whose chunk has not arrived yet holds the boot lockup. */}
      <Suspense fallback={<Splash hold />}>{content}</Suspense>
      {splash ? <Splash ready={Boolean(account)} onDone={endSplash} /> : null}
    </>
  );
}
