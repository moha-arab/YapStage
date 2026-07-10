import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DebateStart,
  LobbyUpdate,
  PhaseUpdate,
  Side,
  Verdict as VerdictData,
} from '../../server/src/protocol';
import { sessionId, socket } from './socket';
import {
  beginOffer,
  ensureLocalStream,
  handleSignal,
  releaseMedia,
  setMicEnabled,
  setupPeer,
  teardownPeer,
} from './webrtc';
import { setOnChunk, speechSupported, startTurn, stopTurn } from './speech';
import Home from './screens/Home';
import GreenRoom from './screens/GreenRoom';
import Debate from './screens/Debate';
import VerdictScreen from './screens/Verdict';

interface VerdictInfo {
  verdict: VerdictData;
  names: Record<Side, string>;
}

export default function App() {
  const [lobby, setLobby] = useState<LobbyUpdate | null>(null);
  const [start, setStart] = useState<DebateStart | null>(null);
  const [phase, setPhase] = useState<PhaseUpdate | null>(null);
  const [ended, setEnded] = useState(false);
  const [verdictInfo, setVerdictInfo] = useState<VerdictInfo | null>(null);
  const [judgeStatus, setJudgeStatus] = useState<{ state: 'pending' | 'failed'; message?: string } | null>(null);
  const [abortReason, setAbortReason] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [peerLostUntil, setPeerLostUntil] = useState<number | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaRetry, setMediaRetry] = useState(0);
  const [rtcState, setRtcState] = useState<RTCPeerConnectionState | null>(null);
  const [speechHeard, setSpeechHeard] = useState(false);

  const lobbyRef = useRef<LobbyUpdate | null>(null);
  lobbyRef.current = lobby;
  const startedRef = useRef(false);
  startedRef.current = Boolean(start);
  const settledRef = useRef(false); // verdict shown or aborted — nothing to resume
  settledRef.current = Boolean(verdictInfo) || Boolean(abortReason);

  const resetToHome = useCallback((message: string | null) => {
    releaseMedia();
    stopTurn();
    setLobby(null);
    setStart(null);
    setPhase(null);
    setEnded(false);
    setVerdictInfo(null);
    setJudgeStatus(null);
    setAbortReason(null);
    setPeerLostUntil(null);
    setLocalStream(null);
    setRemoteStream(null);
    setMediaError(null);
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
      setMicEnabled(true); // free chat while the judge deliberates
    });
    socket.on('debate:aborted', ({ reason }) => {
      stopTurn();
      releaseMedia(); // camera light off on the cancelled screen
      setLocalStream(null);
      setRemoteStream(null);
      setAbortReason(reason);
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
      setVerdictInfo(p);
      setJudgeStatus(null);
    });
    socket.on('connect', () => {
      // Transient reconnect at ANY stage: try to reclaim our seat. A refreshed
      // page has a new sessionId so this only fires for true network blips.
      const code = lobbyRef.current?.code;
      if (!code || settledRef.current) return;
      socket.emit('lobby:resume', { code, sessionId }, (res) => {
        if (res.ok) return;
        if (startedRef.current) setAbortReason('Connection to the debate was lost.');
        else resetToHome('Connection hiccup — that lobby closed. Create or join a fresh one.');
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
      socket.off('connect');
    };
  }, [resetToHome]);

  // "We heard you" indicator: lights up when a transcript chunk lands.
  useEffect(() => {
    setOnChunk(() => setSpeechHeard(true));
    return () => setOnChunk(null);
  }, []);

  // The Jubilee rule: your mic exists only on your turn. Driven by server
  // phase events, never by the countdown display.
  useEffect(() => {
    if (!start || !phase || ended || abortReason) return;
    const myTurn = phase.activeSpeaker === start.yourSide;
    setMicEnabled(myTurn);
    setSpeechHeard(false); // fresh turn, fresh proof-of-life
    if (myTurn) startTurn(phase.stepIndex);
    else stopTurn();
  }, [phase, start, ended, abortReason]);

  // WebRTC lifecycle: both present -> capture + peer up; opponent left -> tear down.
  useEffect(() => {
    if (!lobby) return;
    if (lobby.participantCount === 2) {
      let cancelled = false;
      void (async () => {
        try {
          const stream = await ensureLocalStream();
          if (cancelled) return;
          setLocalStream(stream);
          setMediaError(null);
          setupPeer(
            lobby.iceServers,
            (s) => setRemoteStream(s),
            (state) => setRtcState(state),
          );
        } catch {
          if (!cancelled) {
            setMediaError('Camera and microphone access is required. Allow access in the address bar, then retry.');
          }
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

  if (abortReason) {
    return (
      <div className="stage center-col">
        <p className="kicker">Debate cancelled</p>
        <h1 className="display">{abortReason}</h1>
        <button className="btn btn-primary" onClick={() => window.location.assign('/')}>
          Back to the stage door
        </button>
      </div>
    );
  }

  if (ended || verdictInfo) {
    return (
      <VerdictScreen
        info={verdictInfo}
        status={judgeStatus}
        mySide={start?.yourSide}
        topic={start?.topic ?? ''}
        remoteStream={remoteStream}
        onRetry={() => socket.emit('verdict:retry')}
      />
    );
  }

  if (start) {
    return (
      <Debate
        start={start}
        phase={phase}
        localStream={localStream}
        remoteStream={remoteStream}
        peerLostUntil={peerLostUntil}
        rtcState={rtcState}
        speechHeard={speechHeard}
        speechSupported={speechSupported}
      />
    );
  }

  if (lobby) {
    return (
      <GreenRoom
        lobby={lobby}
        localStream={localStream}
        remoteStream={remoteStream}
        mediaError={mediaError}
        speechSupported={speechSupported}
        rtcState={rtcState}
        onRetryMedia={() => setMediaRetry((n) => n + 1)}
      />
    );
  }

  return <Home notice={notice} onEntered={handleEntered} />;
}
