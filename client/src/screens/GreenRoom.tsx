import { useEffect, useRef, useState } from 'react';
import type { LobbyUpdate } from '../../../server/src/protocol';
import { socket } from '../socket';

/** Mirrors DISPUTE_MAX on the server. */
const DISPUTE_MAX = 400;
import { initAudio } from '../sound';
import { unlockBotVoice } from '../botvoice';
import { useAudioLevel } from '../useAudioLevel';
import { useI18n } from '../i18n';
import MicMeter from '../MicMeter';
import VideoTile from '../VideoTile';
import MatchSetup, { describeSetup, emitSetup, setupOf } from '../MatchSetup';

interface Props {
  lobby: LobbyUpdate;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  mediaError: string | null;
  speechSupported: boolean;
  rtcState: RTCPeerConnectionState | null;
  onRetryMedia: () => void;
  /** Outcome of the invite that opened this room, when it came from a call-out.
      It has to render HERE, because this is the screen the caller lands on: a
      message set on the friends screen is a message nobody ever sees. */
  notice?: { key: string; x?: string } | null;
}

export default function GreenRoom({
  lobby,
  localStream,
  remoteStream,
  mediaError,
  speechSupported,
  rtcState,
  onRetryMedia,
  notice,
}: Props) {
  const { lang, t } = useI18n();
  const [copied, setCopied] = useState(false);
  function copyLink() {
    const link = `${window.location.origin}/?code=${lobby.code}`;
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  const [draft, setDraft] = useState('');
  const waiting = lobby.participantCount === 1;
  const connected = rtcState === 'connected';
  const { pick, deck } = lobby;
  const peer = lobby.peerName ?? '...';

  const localLevel = useAudioLevel(localStream);
  const remoteLevel = useAudioLevel(remoteStream);

  // Masking is SERVER state, not local. It has to be: your opponent must see
  // the mask you picked (a local flag left them watching your camera), and the
  // choice has to survive into the debate. Ranked is masked by format.
  const masked = lobby.yourMasked;
  const peerMasked = Boolean(lobby.peerMasked);

  // Mic proof-of-life: if the mic has never moved the meter, say so before
  // the debate, not after the verdict comes back with one side missing.
  const maxLocal = useRef(0);
  if (localLevel > maxLocal.current) maxLocal.current = localLevel;
  const [micSilent, setMicSilent] = useState(false);
  useEffect(() => {
    if (!localStream) return;
    const id = setInterval(() => setMicSilent(maxLocal.current < 0.04), 2500);
    return () => clearInterval(id);
  }, [localStream]);

  function sendDispute() {
    const text = draft.trim();
    if (!text || text === pick.yourDispute) return;
    socket.emit('pick:dispute', text);
  }

  function confirm() {
    initAudio(); // user gesture: unlocks the drum roll for the verdict later
    unlockBotVoice(); // and the element that reads the ruling aloud
    socket.emit('pick:confirm');
  }

  const isHost = lobby.role === 'host';
  const mode = lobby.topicMode;
  // The guest's view of the settings, as sentences.
  const described = describeSetup(lobby, peer, t, lang);
  // The host names the topic and the server mirrors it to the guest, so there
  // is nothing left to negotiate: one pick and the room is ready.
  const bothDescribed = Boolean(pick.yourDispute && pick.peerDisputeReady);
  const ready =
    mode === 'agree'
      ? pick.yourTopicId !== null
      : mode === 'category'
        ? lobby.categoryKey !== null
        : mode === 'dispute'
          ? bothDescribed
          : true;
  const canConfirm = !!localStream && connected && ready && !pick.youConfirmed;

  const confirmLabel = pick.youConfirmed
    ? t('confirmedWaiting', { x: peer })
    : !connected
      ? rtcState === 'failed'
        ? t('videoFailed')
        : t('connectingVideo')
      : mode === 'agree'
        ? !pick.yourTopicId
          ? isHost
            ? t('pickTopic')
            : t('waitTopic', { x: peer })
          : t('confirm')
        : mode === 'dispute'
          ? !pick.yourDispute
            ? t('describeFirst')
            : !pick.peerDisputeReady
              ? t('waitTheirSide', { x: peer })
              : t('settleIt')
          : mode === 'category' && !lobby.categoryKey
            ? isHost
              ? t('pickCategory')
              : t('waitCategory', { x: peer })
            : t('startRandomDebate');

  const selfTile = (
    <div className={`tile-stack ${waiting ? 'tile-solo' : ''}`}>
      {waiting ? <span className="tape">{t('micCheck')}</span> : null}
      <VideoTile
        stream={localStream}
        muted
        mirror
        maskId={masked ? lobby.yourAvatar : undefined}
        level={localLevel}
        label={lobby.yourName}
        sub={t('you')}
        placeholder={mediaError ? t('cameraBlocked') : t('cameraWarming')}
      />
      {localStream ? <MicMeter level={localLevel} label={t('yourMic')} warn={micSilent} /> : null}
      {localStream && micSilent ? <p className="meter-hint">{t('micHint')}</p> : null}

      {/* Ranked: masks are the format, so this is purely "which mask". Custom:
          you also choose whether to show your face at all. */}
      <div className="face-controls">
        {!lobby.ranked ? (
          <div className="chip-row face-row">
            <button
              className={`cat-tab ${!masked ? 'cat-active' : ''}`}
              onClick={() => socket.emit('pick:mask', false)}
            >
              {t('faceCamera')}
            </button>
            <button
              className={`cat-tab ${masked ? 'cat-active' : ''}`}
              onClick={() => socket.emit('pick:mask', true)}
            >
              {t('faceMask')}
            </button>
          </div>
        ) : null}
        {/* No mask picker here (his call, 2026-09-13): you pick your mask in
            the lobby, and a room keeps the one you walked in with. */}
      </div>
    </div>
  );

  return (
    <div className="stage green-room">
      <header className="topbar">
        {/* There was no way out of this screen except a page refresh, which
            the unload warning then argued with. */}
        <button className="btn btn-small" onClick={() => socket.emit('lobby:leave')}>
          {t('leaveRoom')}
        </button>
        <span className="pill">{t('greenRoom')}</span>
      </header>

      {notice ? <div className="banner">{t(notice.key, { x: notice.x ?? '' })}</div> : null}

      {waiting ? (
        <>
          {/* The code again, in case they got here without copying it from
              the lobby, and the link for the ones who will not type. */}
          <div className="invite-block">
            <div className="ticket">
              <div className="ticket-main">
                <p className="ticket-label">{t('ticketLabel')}</p>
                <p className="ticket-code">{lobby.code}</p>
              </div>
              <div className="ticket-stub" aria-hidden="true" />
            </div>
            <button className="btn" onClick={copyLink}>
              {copied ? t('copied') : t('copyInvite')}
            </button>
          </div>
          {selfTile}
        </>
      ) : (
        <>
          <div className="tiles">
            {selfTile}
            <div className="tile-stack">
              <VideoTile
                stream={remoteStream}
                muted={false}
                maskId={peerMasked ? lobby.peerAvatar : undefined}
                level={remoteLevel}
                label={lobby.peerName ?? '...'}
                sub={pick.peerConfirmed ? t('confirmed') : undefined}
                placeholder={t('connectingTheirCamera')}
              />
              {remoteStream && connected ? (
                <MicMeter level={remoteLevel} label={t('peerMic', { x: peer })} warn={false} />
              ) : null}
            </div>
          </div>

          <div className="picker card">
            {/* Settle-it arrivals should never face three debate-topic tabs
                they didn't ask for: in dispute mode the whole tab row becomes
                one tape header, with a single quiet exit for the host. */}
            {lobby.ranked ? (
              // Ranked: strangers on fixed terms. Nothing to pick, nothing to
              // negotiate, just consent and confirm.
              <div className="mode-row mode-row-dispute">
                <span className="tape">{t('rankedTape')}</span>
                <span className="mode-hint">{t('rankedNote')}</span>
              </div>
            ) : mode === 'dispute' ? (
              <div className="mode-row mode-row-dispute">
                <span className="tape">{t('disputeHeader')}</span>
                {isHost ? (
                  <button className="mode-link" onClick={() => socket.emit('pick:mode', 'agree')}>
                    {t('makeItDebate')}
                  </button>
                ) : null}
              </div>
            ) : isHost ? (
              // The same panel the host had on the stage, so nothing has to
              // be set twice and the friend arriving changes nothing about
              // what the host is looking at.
              <MatchSetup deck={deck} value={setupOf(lobby)} onChange={(next) => emitSetup(setupOf(lobby), next)} />
            ) : null}

            {/* Guests see the host's choices as facts, in plain words, not as
                rows of greyed buttons pretending to be options. */}
            {!isHost && !lobby.ranked ? (
              <div className="host-choices">
                {mode !== 'dispute' ? (
                  <>
                    <span className="tape tape-static">{described.topic}</span>
                    <span className="tape tape-static">{described.side}</span>
                  </>
                ) : null}
                <span className="tape tape-static">
                  {t('paceLabel')}: {t(`pace_${lobby.pace}`)}
                </span>
                <p className="mode-hint">{t('modeHostControls', { x: peer })}</p>
              </div>
            ) : null}

            {mode === 'agree' || mode === 'category' ? null : mode === 'dispute' ? (
              <>
                {/* You describe the argument in your own words and never see
                    theirs first: reading their version would turn an honest
                    account into a rebuttal. */}
                <p className="mode-desc">{t('disputeDesc')}</p>
                <textarea
                  className="input dispute-box"
                  rows={3}
                  maxLength={DISPUTE_MAX}
                  placeholder={t('disputePlaceholder')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={sendDispute}
                />
                <div className="dispute-row">
                  <span className="dispute-count">
                    {draft.length}/{DISPUTE_MAX}
                  </span>
                  <button
                    className="btn btn-small"
                    disabled={!draft.trim() || draft.trim() === (pick.yourDispute ?? '')}
                    onClick={sendDispute}
                  >
                    {pick.yourDispute ? t('disputeSaved') : t('disputeSave')}
                  </button>
                </div>
                <p className="mode-hint">
                  {pick.peerDisputeReady
                    ? t('theirSideIn', { x: peer })
                    : t('theirSideWaiting', { x: peer })}
                </p>
                {pick.disputeProblem ? (
                  <div className={`banner ${pick.disputeProblem === 'too_serious' ? 'banner-serious' : 'banner-error'}`}>
                    {t(`dispute_${pick.disputeProblem}`)}
                  </div>
                ) : null}
              </>
            ) : isHost ? (
              <p className="mode-desc">{t('randomDesc')}</p>
            ) : null}

            {/* Settle-it entry PARKED (see PRD): the dispute flow below this
                point still works, it just has no doors. The server also gates
                pick:mode('dispute') behind DISPUTE_MODE=on. */}

            {/* Pace sits with the other "how we play" facts, just above the
                point of commitment, host-only like every other lobby setting.
                Ranked is fixed-format: no knobs for either stranger. */}
            {isHost && !lobby.ranked ? (
              <div className="setup-row pace-row">
                <span className="setup-label">{t('paceLabel')}</span>
                <div className="chip-row">
                  {(['standard', 'blitz', 'long'] as const).map((pc) => (
                    <button
                      key={pc}
                      className={`cat-tab ${lobby.pace === pc ? 'cat-active' : ''}`}
                      onClick={() => socket.emit('pick:pace', pc)}
                    >
                      {t(`pace_${pc}`)}
                    </button>
                  ))}
                </div>
                <span className="pace-hint">{t(`paceHint_${lobby.pace}`)}</span>
              </div>
            ) : null}

            {/* Who may watch. Host-only, custom-only: ranked is the public
                sport and is always spectatable (said so in the consent line). */}
            {isHost && !lobby.ranked ? (
              <div className="setup-row">
                <span className="setup-label">{t('watchersLabel')}</span>
                <div className="chip-row">
                  <button
                    className={`cat-tab ${lobby.spectatorsAllowed ? 'cat-active' : ''}`}
                    onClick={() => socket.emit('pick:spectators', true)}
                  >
                    {t('watchersOpen')}
                  </button>
                  <button
                    className={`cat-tab ${!lobby.spectatorsAllowed ? 'cat-active' : ''}`}
                    onClick={() => socket.emit('pick:spectators', false)}
                  >
                    {t('watchersShut')}
                  </button>
                </div>
                <span className="pace-hint">
                  {t(lobby.spectatorsAllowed ? 'watchersOpenHint' : 'watchersShutHint')}
                </span>
              </div>
            ) : null}

            {/* The notice stays, the tick box does not (his call, 2026-09-13:
                it blocked the start). What the judge reads and what is kept
                is still said, right above the button. */}
            <p className="consent-row">{t(lobby.ranked ? 'consentRanked' : 'consent')}</p>

            <button className="btn btn-primary btn-wide" disabled={!canConfirm} onClick={confirm}>
              {confirmLabel}
            </button>
          </div>
        </>
      )}

      {mediaError ? (
        <div className="banner banner-error">
          {t(mediaError)}{' '}
          <button className="btn btn-small" onClick={onRetryMedia}>
            {t('retry')}
          </button>
        </div>
      ) : null}

      {!waiting && rtcState === 'failed' ? (
        <div className="banner banner-error">{t('netFail')}</div>
      ) : null}

      {!speechSupported && !lobby.sttAvailable ? (
        <div className="banner banner-warn">{t('noSpeech')}</div>
      ) : null}
    </div>
  );
}
