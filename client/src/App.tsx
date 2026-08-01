import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DebateStart,
  LobbyUpdate,
  PhaseUpdate,
  Side,
  Verdict as VerdictData,
} from '../../server/src/protocol';
import { session, socket } from './socket';
import {
  attemptIceRestart,
  beginOffer,
  ensureLocalStream,
  handleSignal,
  reacquireMedia,
  releaseMedia,
  setMicEnabled,
  setTrackHealthHandlers,
  setupPeer,
  teardownPeer,
} from './webrtc';
import { setOnChunk, setSpeechLang, speechSupported, startTurn, stopTurn } from './speech';
import { recordingSupported, setOnRecordingActive, startTurnRecording, stopTurnRecording } from './recorder';
import { saveReceipt } from './history';
import { LangToggle, useI18n } from './i18n';
import Home from './screens/Home';
import GreenRoom from './screens/GreenRoom';
import Debate from './screens/Debate';
import VerdictScreen from './screens/Verdict';
import BotSelect, { type BotStartConfig } from './screens/BotSelect';
import { playBotTurn, stopBotVoice } from './botvoice';

interface VerdictInfo {
  verdict: VerdictData;
  names: Record<Side, string>;
}

interface AbortInfo {
  key: string;
  vars?: Record<string, string>;
}

// Post-debate refresh recovery: once the debate has ENDED, resuming is safe
// (nothing live to hijack), so we remember just enough to fetch the verdict.
const RESUME_KEY = 'yap.resume';

function storeResume(code: string | undefined): void {
  if (!code) return;
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({ code, sid: session.id }));
  } catch {
    // storage blocked — refresh recovery just won't happen
  }
}

function clearResume(): void {
  try {
    sessionStorage.removeItem(RESUME_KEY);
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
  const [botName, setBotName] = useState('');
  const [botTurn, setBotTurn] = useState<{ stepIndex: number; text: string } | null>(null);
  const [botSpeaking, setBotSpeaking] = useState(false);

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
  const settledRef = useRef(false); // verdict shown or aborted — nothing to resume
  settledRef.current = Boolean(verdictInfo) || Boolean(abortInfo);

  const resetToHome = useCallback((message: string | null) => {
    releaseMedia();
    stopTurn();
    stopBotVoice();
    clearResume();
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
    setBotTurn(null);
    setBotSpeaking(false);
    setNotice(message);
  }, []);

  useEffect(() => {
    socket.on('lobby:update', (u) => setLobby(u));
    socket.on('lobby:closed', ({ reason }) => resetToHome(reason));
    socket.on('rtc:go', () => void beginOffer());
    socket.on('rtc:signal', (p) => void handleSignal(p));
    socket.on('debate:start', (p) => setStart(p));
    socket.on('debate:phase', (p) => setPhase(p));
    socket.on('debate:ended', () => {
      setEnded(true);
      stopTurn();
      stopTurnRecording(); // flushes the final turn's audio upload
      stopBotVoice();
      setBotTurn(null);
      setBotSpeaking(false);
      setMicEnabled(true); // free chat while the judge deliberates
      storeResume(lobbyRef.current?.code); // a refresh may now safely resume
    });
    socket.on('bot:turn', (p) => {
      // The bot's spoken turn: show its text, animate the avatar, and speak it.
      // When speech finishes, tell the server to advance to the next turn.
      setBotTurn({ stepIndex: p.stepIndex, text: p.text });
      setBotSpeaking(true);
      playBotTurn(p.text, p.audio, p.mime, langRef.current, () => {
        setBotSpeaking(false);
        socket.emit('bot:done', { stepIndex: p.stepIndex });
      });
    });
    socket.on('debate:aborted', ({ reason, vars }) => {
      stopTurn();
      stopTurnRecording();
      stopBotVoice();
      releaseMedia(); // camera light off on the cancelled screen
      clearResume();
      setLocalStream(null);
      setRemoteStream(null);
      setBotTurn(null);
      setAbortInfo({ key: reason, vars });
    });
    socket.on('peer:connection', (p) =>
      setPeerLostUntil(p.state === 'lost' ? (p.graceDeadline ?? Date.now() + 15000) : null),
    );
    socket.on('verdict:status', (p) => {
      stopTurn(); // never leave the recognizer running past the debate
      setJudgeStatus(p);
    });
    socket.on('verdict:result', (p) => {
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
        });
      }
    });
    socket.on('rematch:update', (p) => setRematch(p));
    socket.on('rematch:go', () => {
      // Both agreed: drop the finished-debate state and fall back to the green
      // room. Keep the camera/connection — the server kept the same lobby.
      setStart(null);
      setPhase(null);
      setEnded(false);
      setVerdictInfo(null);
      setJudgeStatus(null);
      setAbortInfo(null);
      setRematch(null);
      clearResume();
    });
    socket.on('connect', () => {
      // Transient reconnect at ANY stage: try to reclaim our seat. A refreshed
      // page has a new sessionId so this only fires for true network blips.
      const code = lobbyRef.current?.code;
      if (!code || settledRef.current) return;
      socket.emit('lobby:resume', { code, sessionId: session.id }, (res) => {
        if (res.ok) return;
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
            { code: u.code, sessionId: session.id, name: u.yourName },
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
      socket.off('connect');
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
      const { code, sid } = JSON.parse(raw) as { code?: string; sid?: string };
      if (!code || !sid) return;
      session.id = sid;
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
  useEffect(() => {
    if (!lobby && !botPicking && !start?.bot) return;
    let cancelled = false;
    void (async () => {
      try {
        const stream = await ensureLocalStream();
        if (!cancelled) {
          setLocalStream(stream);
          setMediaError(null);
        }
      } catch {
        if (!cancelled) setMediaError('mediaError'); // i18n key, rendered via t()
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lobby?.code, botPicking, Boolean(start?.bot), mediaRetry]);

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

  const onPlayBot = useCallback((name: string) => {
    setNotice(null);
    setBotName(name);
    setBotPicking(true);
  }, []);

  const startBot = useCallback(
    (c: BotStartConfig) => {
      socket.emit(
        'bot:start',
        { sessionId: session.id, name: botName, lang: langRef.current, ...c },
        (res) => {
          if (res.ok) return; // debate:start arrives next and renders the debate
          const map: Record<string, string> = {
            rate_limited: 'errRateLimited',
            bad_name: 'errBadName',
          };
          resetToHome(map[res.error ?? ''] ?? 'lostLobby');
        },
      );
    },
    [botName, resetToHome],
  );

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
        .catch(() => setMediaError('mediaError'));
    } else {
      setMediaRetry((n) => n + 1);
    }
  }, []);

  let content;
  if (abortInfo) {
    content = (
      <div className="stage center-col">
        <p className="kicker">{t('cancelled')}</p>
        <h1 className="display">{t(abortInfo.key, abortInfo.vars)}</h1>
        <button className="btn btn-primary" onClick={() => window.location.assign('/')}>
          {t('backHome')}
        </button>
      </div>
    );
  } else if (ended || verdictInfo) {
    content = (
      <VerdictScreen
        info={verdictInfo}
        status={judgeStatus}
        mySide={start?.yourSide}
        topic={start?.topic ?? null}
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
      />
    );
  } else if (start) {
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
      />
    );
  } else if (botPicking) {
    content = (
      <BotSelect
        localStream={localStream}
        mediaError={mediaError}
        onRetryMedia={retryMedia}
        onStart={startBot}
        onBack={() => {
          setBotPicking(false);
          releaseMedia();
          setLocalStream(null);
        }}
      />
    );
  } else if (lobby) {
    content = (
      <GreenRoom
        lobby={lobby}
        localStream={localStream}
        remoteStream={remoteStream}
        mediaError={mediaError}
        speechSupported={speechSupported}
        rtcState={rtcState}
        onRetryMedia={retryMedia}
      />
    );
  } else {
    content = <Home notice={notice} onEntered={handleEntered} onPlayBot={onPlayBot} />;
  }

  return (
    <>
      <LangToggle />
      {content}
    </>
  );
}
