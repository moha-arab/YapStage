import { useEffect, useRef, useState } from 'react';
import type { LobbyUpdate } from '../../../server/src/protocol';
import { socket } from '../socket';

/** Mirrors DISPUTE_MAX on the server. */
const DISPUTE_MAX = 400;
import { initAudio } from '../sound';
import { unlockBotVoice } from '../botvoice';
import { useAudioLevel } from '../useAudioLevel';
import { useCountdown } from '../useCountdown';
import { useI18n } from '../i18n';
import MicMeter from '../MicMeter';
import VideoTile from '../VideoTile';
import Brand from '../Brand';
import MatchSetup, { emitSetup, setupComplete, setupOf } from '../MatchSetup';
import { capFirst } from '../VerdictBlocks';

interface Props {
  lobby: LobbyUpdate;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  mediaError: string | null;
  speechSupported: boolean;
  rtcState: RTCPeerConnectionState | null;
  onRetryMedia: () => void;
  /** Something that happened to this room: today the host being told the
      guest left and the code still works (lobby:notice). It has to render
      HERE, because this is the screen the host is on. */
  notice?: { key: string; x?: string } | null;
  /** People watching this room (LobbyUpdate.watchers, kept live by
      spectate:count). Debaters always know they have an audience. */
  watchers?: number;
  /** The other player's connection is out until then (peer:connection). */
  peerLostUntil?: number | null;
}

/* THE GREEN ROOM. The start button used to sit below the fold on every
   screen size, under two 16:10 tiles and the whole settings panel. Now the
   tiles are capped, the host's settings fold to one line with a Change
   button, and the consent line and the button ride along the bottom of the
   panel, so the one thing to do is always in view. */
export default function GreenRoom({
  lobby,
  localStream,
  remoteStream,
  mediaError,
  speechSupported,
  rtcState,
  onRetryMedia,
  notice,
  watchers = 0,
  peerLostUntil = null,
}: Props) {
  const { lang, t } = useI18n();
  const awayMs = useCountdown(peerLostUntil ?? undefined, peerLostUntil ? Date.now() : undefined);
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
  // The motion this room will play is the HOST's pick. The server copies it
  // into the guest's seat when the host picks (pick:topic), but a guest who
  // walks in after another one left gets an empty seat back (the disconnect
  // path clears guestTopicId alone), so the guest used to see the topic named
  // and "zorvint is choosing the topic" at once. Both seats read the host's
  // pick, the one the server's pick:confirm checks.
  const hostTopicId = isHost ? pick.yourTopicId : pick.peerTopicId;
  const bothDescribed = Boolean(pick.yourDispute && pick.peerDisputeReady);
  const ready =
    mode === 'agree'
      ? hostTopicId !== null
      : mode === 'category'
        ? lobby.categoryKey !== null
        : mode === 'dispute'
          ? bothDescribed
          : true;
  // Not while the other player is away (their connection dropped and the
  // countdown banner is up): locking in with nobody there did nothing useful.
  const canConfirm = !!localStream && connected && ready && !pick.youConfirmed && !peerLostUntil;

  // Both wearing characters, the link is a voice call, not a video.
  const onCamera = !masked || !peerMasked;
  const confirmLabel = pick.youConfirmed
    ? t('confirmedWaiting', { x: peer })
    : !connected
      ? rtcState === 'failed'
        ? t(onCamera ? 'videoFailed' : 'callFailed')
        : t(onCamera ? 'connectingVideo' : 'connectingCall')
      : mode === 'agree'
        ? !hostTopicId
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

  // The host's settings fold to one line. A room that still needs a pick
  // (a category or a motion not chosen yet) opens with the panel out.
  const [editing, setEditing] = useState(() => !setupComplete(setupOf(lobby)));

  // The settings as words, for the host's one line and the guest's three.
  const cat = lobby.categoryKey ? deck.find((c) => c.key === lobby.categoryKey) : undefined;
  const catName = cat ? cat.label[lang].toLowerCase() : '';
  const motion = hostTopicId ? deck.flatMap((c) => c.topics).find((x) => x.id === hostTopicId) : undefined;
  const pace = t(`pace_${lobby.pace}`).toLowerCase();
  const sideWord = (s: 'FOR' | 'AGAINST') => t(`setupSide_${s}`);

  // "College is no longer worth it · coin flip for sides · blitz"
  const summaryTopic =
    mode === 'agree'
      ? motion
        ? capFirst(motion[lang])
        : t('grSumNone')
      : mode === 'category'
        ? cat
          ? t('grSumFrom', { x: catName })
          : t('grSumNone')
        : t('grSumRandom');
  const summarySide =
    lobby.hostSide === 'random' ? t('grSumCoin') : t('grSumSide', { s: sideWord(lobby.hostSide) });
  const summary = `${summaryTopic} · ${summarySide} · ${pace}`;

  // The guest's view, from the guest's chair: "Topic: ...", "Sides: ...".
  const factTopic =
    mode === 'agree'
      ? motion
        ? capFirst(motion[lang])
        : t('grTopicChoosing', { x: peer })
      : mode === 'category'
        ? cat
          ? t('grTopicFrom', { x: catName })
          : t('grTopicChoosing', { x: peer })
        : t('grTopicRandom');
  const factSides =
    lobby.hostSide === 'random'
      ? t('grSidesCoin')
      : t('grSidesSet', {
          x: peer,
          s: sideWord(lobby.hostSide),
          o: sideWord(lobby.hostSide === 'FOR' ? 'AGAINST' : 'FOR'),
        });

  // What the judge reads and what is kept, right above the button, with the
  // privacy policy's AI section one tap away from the words "The AI judge".
  const consentText = t(lobby.ranked ? 'consentRanked' : 'consent');
  const judgeWords = t('consentJudge');
  const judgeAt = consentText.indexOf(judgeWords);
  const consentLine = (
    <p className="gr-consent">
      {judgeAt < 0 ? (
        consentText
      ) : (
        <>
          {consentText.slice(0, judgeAt)}
          <a className="gr-link" href="/privacy#ai" target="_blank" rel="noopener">
            {judgeWords}
          </a>
          {consentText.slice(judgeAt + judgeWords.length)}
        </>
      )}
    </p>
  );

  // Ranked: masks are the format, so this is purely "which mask". Custom:
  // you also choose whether to show your face at all.
  // No mask picker here: you pick your mask in the lobby, and a room keeps
  // the one you walked in with.
  const faceControls = !lobby.ranked ? (
    <div className="face-controls">
      <div className="chip-row face-row">
        <button
          className={`cat-tab ${!masked ? 'cat-active' : ''}`}
          aria-pressed={!masked}
          onClick={() => socket.emit('pick:mask', false)}
        >
          {t('faceCamera')}
        </button>
        <button
          className={`cat-tab ${masked ? 'cat-active' : ''}`}
          aria-pressed={masked}
          onClick={() => socket.emit('pick:mask', true)}
        >
          {t('faceMask')}
        </button>
      </div>
    </div>
  ) : null;

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
    </div>
  );

  // Above the panel, not under it: the panel's button is pinned to the
  // bottom of the screen, and a warning under it would never be seen.
  const banners = (
    <>
      {/* The other player's connection is out (a host who dropped before
          the friend walked in has two minutes to come back). Said once, in
          fixed words, for a screen reader; the countdown is for the eye. */}
      {!waiting && peerLostUntil ? (
        <div className="banner banner-warn" role="alert">
          <span className="sr-only">{t('grPeerAwaySr', { x: peer })}</span>
          <span aria-hidden="true">{t('grPeerAway', { x: peer, n: Math.max(0, Math.ceil(awayMs / 1000)) })}</span>
        </div>
      ) : null}
      {mediaError ? (
        <div className="banner banner-error" role="alert">
          {t(mediaError)}{' '}
          <button className="btn btn-small" onClick={onRetryMedia}>
            {t('retry')}
          </button>
        </div>
      ) : null}

      {/* Ranked has no room to open again: the way back is the queue. */}
      {!waiting && rtcState === 'failed' ? (
        <div className="banner banner-error" role="alert">
          {t(lobby.ranked ? 'netFailRanked' : 'netFail')}
        </div>
      ) : null}

      {!speechSupported && !lobby.sttAvailable ? (
        <div className="banner banner-warn" role="alert">
          {t('noSpeech')}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="stage green-room">
      <header className="topbar scr-bar">
        <Brand />
        <span className="scr-where">{t('greenRoom')}</span>
        {watchers > 0 ? <span className="watch-pill">{t('specWatching', { n: watchers })}</span> : null}
        {/* There was no way out of this screen except a page refresh, which
            the unload warning then argued with. */}
        <button className="scr-btn" onClick={() => socket.emit('lobby:leave')}>
          {t('leaveRoom')}
        </button>
      </header>

      {notice ? <div className="banner">{t(notice.key, { x: notice.x ?? '' })}</div> : null}

      {waiting ? (
        <>
          {/* The code again, in case they got here without copying it from
              the lobby, and the link for the ones who will not type. The
              only way to be alone in here is for the friend to have left. */}
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
            <p className="gr-wait-line">{t('waitingForFriend')}</p>
          </div>
          {selfTile}
          {faceControls}
          {banners}
        </>
      ) : (
        <>
          {/* The call. A plain pass-through box everywhere but a phone held
              sideways, where it is the left column and the panel the right
              (styles.css). */}
          <div className="gr-call">
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
          {faceControls}
          {banners}
          </div>

          <div className="picker card">
            {/* Settle-it arrivals should never face three debate-topic tabs
                they didn't ask for: in dispute mode the whole tab row becomes
                one tape header, with a single quiet exit for the host. */}
            {lobby.ranked ? (
              // Ranked: strangers on fixed terms. Nothing to pick, nothing to
              // negotiate, just consent and confirm. The pace is read off the
              // room, not promised by a sentence.
              <p className="gr-sum-line">{t('grRankedLine', { p: pace })}</p>
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
              // One line of what is set, and a labelled button that opens the
              // same panel the host had on the stage, so nothing has to be set
              // twice and the friend arriving changes nothing about it.
              <div className="gr-setup">
                <div className="gr-sum">
                  <p className="gr-sum-line">{summary}</p>
                  <button
                    className="btn btn-small gr-change"
                    aria-expanded={editing}
                    onClick={() => setEditing((v) => !v)}
                  >
                    {editing ? t('grDone') : t('grChange')}
                  </button>
                </div>
                {editing ? (
                  <div className="gr-edit">
                    <MatchSetup
                      deck={deck}
                      value={setupOf(lobby)}
                      onChange={(next) => emitSetup(setupOf(lobby), next)}
                    />

                    {/* Pace sits with the other "how we play" facts,
                        host-only like every other lobby setting. */}
                    <div className="setup-row pace-row">
                      <span className="setup-label">{t('paceLabel')}</span>
                      <div className="chip-row">
                        {(['standard', 'blitz', 'long'] as const).map((pc) => (
                          <button
                            key={pc}
                            className={`cat-tab ${lobby.pace === pc ? 'cat-active' : ''}`}
                            aria-pressed={lobby.pace === pc}
                            onClick={() => socket.emit('pick:pace', pc)}
                          >
                            {t(`pace_${pc}`)}
                          </button>
                        ))}
                      </div>
                      <span className="pace-hint">{t(`paceHint_${lobby.pace}`)}</span>
                    </div>

                    {/* Who may watch. Host-only, custom-only: ranked is the
                        public sport and is always spectatable (said so in the
                        consent line). */}
                    <div className="setup-row">
                      <span className="setup-label">{t('watchersLabel')}</span>
                      <div className="chip-row">
                        <button
                          className={`cat-tab ${lobby.spectatorsAllowed ? 'cat-active' : ''}`}
                          aria-pressed={lobby.spectatorsAllowed}
                          onClick={() => socket.emit('pick:spectators', true)}
                        >
                          {t('watchersOpen')}
                        </button>
                        <button
                          className={`cat-tab ${!lobby.spectatorsAllowed ? 'cat-active' : ''}`}
                          aria-pressed={!lobby.spectatorsAllowed}
                          onClick={() => socket.emit('pick:spectators', false)}
                        >
                          {t('watchersShut')}
                        </button>
                      </div>
                      <span className="pace-hint">
                        {t(lobby.spectatorsAllowed ? 'watchersOpenHint' : 'watchersShutHint')}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Guests see the host's choices as facts, in plain sentences,
                not as rows of greyed buttons pretending to be options. */}
            {!isHost && !lobby.ranked ? (
              <div className="host-choices">
                {mode !== 'dispute' ? (
                  <>
                    <p className="gr-fact">
                      <span>{t('grTopic')}:</span> {factTopic}
                    </p>
                    <p className="gr-fact">
                      <span>{t('grSides')}:</span> {factSides}
                    </p>
                  </>
                ) : null}
                <p className="gr-fact">
                  <span>{t('paceLabel')}:</span> {pace}
                </p>
                <p className="mode-hint">{t('modeHostControls', { x: peer })}</p>
              </div>
            ) : null}

            {mode === 'dispute' ? (
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
            ) : null}

            {/* Settle-it entry PARKED (see PRD): the dispute flow above still
                works, it just has no doors. The server also gates
                pick:mode('dispute') behind DISPUTE_MODE=on. */}

            {/* The notice stays, the tick box does not: it blocked the start.
                The notice rides with the button, pinned to the bottom of the
                panel, so the start is never below the fold. */}
            <div className="gr-go">
              {consentLine}
              <button className="btn btn-primary btn-wide" disabled={!canConfirm} onClick={confirm}>
                {confirmLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
