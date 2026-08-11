import { useEffect, useState } from 'react';
import type { CategoryScores, Framing, Side, TopicText, Verdict as VerdictData } from '../../../server/src/protocol';
import { isSoundMuted, playCrash, playDrumRoll, playHit, setSoundMuted, speak } from '../sound';
import { socket } from '../socket';
import { useI18n } from '../i18n';
import VideoTile from '../VideoTile';
import ReportFlag from '../Report';
import { signIn, whoAmI } from '../player';
import { playBotTurn, stopBotVoice } from '../botvoice';

const COACH_LIMIT = 6;
interface CoachMsg {
  role: 'you' | 'coach';
  text: string;
  error?: boolean;
}

interface Props {
  info: {
    verdict: VerdictData;
    names: Record<Side, string>;
    mime?: string;
    audio?: ArrayBuffer;
    heard?: Record<Side, number>;
    /** Ranked only: what the match did to each side's rating. */
    elo?: Record<Side, { before: number; after: number }>;
  } | null;
  /** Settle-it: the argument and both accounts, for the ruling screen. */
  framing?: Framing | null;
  status: { state: 'pending' | 'failed'; message?: string; terminal?: boolean } | null;
  mySide: Side | undefined;
  topic: TopicText | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  rtcConnected: boolean;
  peerName: string;
  myName: string;
  onLeaveCall: () => void;
  onRetry: () => void;
  onRematch: () => void;
  rematch: { youWant: boolean; peerWant: boolean; peerLeft: boolean } | null;
  botOpponent?: { id: string; name: string; color: string } | null;
  /** Ranked hides rematch: the queue is how you go again, so two accounts
      cannot sit in a loop trading rating. */
  ranked?: boolean;
  /** Campaign: the win moved your frontier — announce the new challenger. */
  unlocked?: { level: number; unlocked: string | null } | null;
  /** Masks by side (an entry = that side is masked), so the post-verdict call
      still shows a face for players who never had a camera. */
  avatars?: Partial<Record<Side, string>> | null;
}

/**
 * The call stays open after the debate so you can react to the results
 * together. That must be VISIBLE: an open mic is never allowed to be a
 * hidden audio element. Cameras on screen, plain words, a leave button.
 */
function LiveStrip({
  localStream,
  remoteStream,
  rtcConnected,
  peerName,
  myName,
  onLeaveCall,
  myMask,
  peerMask,
}: Pick<Props, 'localStream' | 'remoteStream' | 'rtcConnected' | 'peerName' | 'myName' | 'onLeaveCall'> & {
  myMask?: string;
  peerMask?: string;
}) {
  const { t } = useI18n();
  // A masked debater has no camera by design — the post-verdict chat must
  // still work for them, so 'no stream' is only 'you left' when unmasked.
  if (!localStream && !myMask) {
    return <p className="live-note">{t('youLeft')}</p>;
  }
  return (
    <div className="live-strip">
      <div className="live-strip-tiles">
        <VideoTile
          stream={localStream}
          muted
          mirror
          maskId={myMask}
          label={myName}
          sub={t('live')}
        />
        <VideoTile
          stream={rtcConnected ? remoteStream : null}
          muted={false}
          maskId={peerMask}
          label={peerName}
          sub={rtcConnected && (remoteStream || peerMask) ? t('live') : undefined}
          placeholder={t('leftCall')}
        />
      </div>
      <p className="live-note">{t(myMask ? 'stillLiveMasked' : 'stillLive')}</p>
      <button className="btn btn-small" onClick={onLeaveCall}>
        {t('leaveCall')}
      </button>
    </div>
  );
}

interface Category {
  key: keyof CategoryScores;
  labelKey: string;
  descKey: string;
  max: number;
}

const CATEGORIES: Category[] = [
  { key: 'argument', labelKey: 'catArgument', descKey: 'catArgumentDesc', max: 30 },
  { key: 'evidence', labelKey: 'catEvidence', descKey: 'catEvidenceDesc', max: 20 },
  { key: 'clash', labelKey: 'catClash', descKey: 'catClashDesc', max: 30 },
  { key: 'delivery', labelKey: 'catDelivery', descKey: 'catDeliveryDesc', max: 20 },
];

// Reveal order builds drama: light categories first, clash (the "did you
// actually debate them" score) closes the show.
const REVEAL_ORDER: Category[] = [CATEGORIES[1], CATEGORIES[3], CATEGORIES[0], CATEGORIES[2]];

// Game-show generous curve — texture, not a transcript.
function grade(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.92) return 'A+';
  if (pct >= 0.83) return 'A';
  if (pct >= 0.7) return 'B';
  if (pct >= 0.55) return 'C';
  if (pct >= 0.4) return 'D';
  return 'F';
}

function total(s: CategoryScores): number {
  return s.argument + s.evidence + s.clash + s.delivery;
}

type Stage = 'waiting' | 'scores' | 'drumroll' | 'reveal' | 'details';

const FIRST_CARD_MS = 1200;
const PER_CARD_MS = 2600;

export default function VerdictScreen({
  info,
  status,
  mySide,
  topic,
  localStream,
  remoteStream,
  rtcConnected,
  peerName,
  myName,
  onLeaveCall,
  onRetry,
  onRematch,
  rematch,
  botOpponent,
  ranked,
  unlocked,
  avatars,
  framing,
}: Props) {
  const { lang, t } = useI18n();
  // No shared call to keep visible when the opponent is a bot.
  const strip = botOpponent ? null : (
    <LiveStrip
      localStream={localStream}
      remoteStream={remoteStream}
      rtcConnected={rtcConnected}
      peerName={peerName}
      myName={myName}
      onLeaveCall={onLeaveCall}
      myMask={mySide ? avatars?.[mySide] : undefined}
      peerMask={mySide ? avatars?.[mySide === 'FOR' ? 'AGAINST' : 'FOR'] : undefined}
    />
  );
  const [stage, setStage] = useState<Stage>('waiting');
  const [revealed, setRevealed] = useState(0);
  const [muted, setMuted] = useState(isSoundMuted());
  const [coachLog, setCoachLog] = useState<CoachMsg[]>([]);
  const [coachThinking, setCoachThinking] = useState(false);
  const [coachAsks, setCoachAsks] = useState(0);
  const [coachInput, setCoachInput] = useState('');
  const [shareState, setShareState] = useState<'idle' | 'working' | 'copied' | 'failed'>('idle');
  // Signed-out and just handed a real verdict: the one moment an account ask
  // is a gift rather than a toll.
  const [saveNudge, setSaveNudge] = useState(false);
  useEffect(() => {
    void whoAmI().then((me) => setSaveNudge(me.google && !me.signedIn));
  }, []);

  useEffect(() => {
    const onReply = (p: { text: string; error?: boolean; done?: boolean }) => {
      setCoachThinking(false);
      if (p.done) return; // cap reached — the input is already hidden
      setCoachLog((l) => [...l, { role: 'coach', text: p.text, error: p.error }]);
    };
    socket.on('coach:reply', onReply);
    return () => {
      socket.off('coach:reply', onReply);
    };
  }, []);

  function askCoach(q: string) {
    const question = q.trim();
    if (!question || coachThinking || coachAsks >= COACH_LIMIT) return;
    setCoachLog((l) => [...l, { role: 'you', text: question }]);
    setCoachThinking(true);
    setCoachAsks((n) => n + 1);
    setCoachInput('');
    socket.emit('coach:ask', { question });
  }

  useEffect(() => {
    if (!info) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setStage('scores');
    setRevealed(0);

    REVEAL_ORDER.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          if (!alive) return;
          playHit();
          setRevealed(i + 1);
        }, FIRST_CARD_MS + i * PER_CARD_MS),
      );
    });

    const drumAt = FIRST_CARD_MS + REVEAL_ORDER.length * PER_CARD_MS + 900;
    timers.push(
      setTimeout(() => {
        if (!alive) return;
        setStage('drumroll');
        playDrumRoll(3000);
      }, drumAt),
    );
    timers.push(
      setTimeout(() => {
        if (!alive) return;
        playCrash();
        // The YapMaster reads their own ruling. Falls back to the browser voice
        // when the server had no TTS, which is what this always used to be.
        // In settle-it the decree is the sentencing line, so that is what gets
        // read aloud rather than the hype summary.
        const spoken = info.verdict.ruling?.decree || info.verdict.summary;
        if (info.audio && !isSoundMuted()) {
          playBotTurn(spoken, info.audio, info.mime, lang, () => {});
        } else {
          speak(spoken);
        }
        setStage('reveal');
      }, drumAt + 3200),
    );
    timers.push(
      setTimeout(() => {
        if (alive) setStage('details');
      }, drumAt + 4800),
    );

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [info]);

  // Ask the server for a link, then hand it to the OS share sheet on mobile or
  // the clipboard on desktop. The share sheet can be dismissed, which is not a
  // failure, so a cancel just resets quietly.
  function share() {
    if (shareState === 'working') return;
    setShareState('working');
    socket.emit('share:link', (res) => {
      if (!res?.url) {
        setShareState('failed');
        return;
      }
      const url = new URL(res.url, window.location.origin).toString();
      const title = info ? `${info.names[info.verdict.winner]} won on YapStage` : 'YapStage';
      if (navigator.share) {
        navigator
          .share({ title, url })
          .then(() => setShareState('idle'))
          .catch(() => setShareState('idle'));
        return;
      }
      navigator.clipboard
        ?.writeText(url)
        .then(() => setShareState('copied'))
        .catch(() => setShareState('failed'));
    });
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
    // setSoundMuted cancels browser speech but knows nothing about the
    // YapMaster's audio element, so silence that here too.
    if (next) stopBotVoice();
  }

  if (!info) {
    return (
      <div className="stage center-col verdict-wait">
        <p className="kicker">{topic?.[lang] ?? ''}</p>
        {status?.state === 'failed' ? (
          <>
            <h1 className="display">{t('judgeFailed')}</h1>
            <p className="subtitle">{t(status.message ?? 'judgeFailedSub')}</p>
            {!status.terminal ? (
              <button className="btn btn-primary" onClick={onRetry}>
                {t('callJudgeBack')}
              </button>
            ) : null}
            <button className="btn" onClick={() => window.location.assign('/')}>
              {t('backHome')}
            </button>
          </>
        ) : (
          <>
            <h1 className="display deliberating">{t('deliberating')}</h1>
            <div className="gavel-spinner" aria-hidden="true" />
            <p className="subtitle">{t('deliberatingSub')}</p>
          </>
        )}
        {strip}
      </div>
    );
  }

  const { verdict, names } = info;
  const winner = verdict.winner;
  const loser: Side = winner === 'FOR' ? 'AGAINST' : 'FOR';
  const youWon = mySide !== undefined && mySide === winner;

  if (stage === 'scores') {
    return (
      <div className="stage center-col verdict-scores">
        <p className="kicker">{topic?.[lang] ?? ''}</p>
        <h1 className="display">{t('scoresIn')}</h1>
        <div className="score-reveals">
          {REVEAL_ORDER.slice(0, revealed).map((c) => (
            <div className="score-reveal card" key={c.key}>
              <div className="score-reveal-head">
                <span className="score-reveal-label">{t(c.labelKey)}</span>
                <span className="score-reveal-max">{t('outOf', { n: c.max })}</span>
              </div>
              <p className="score-reveal-desc">{t(c.descKey)}</p>
              <div className="score-reveal-sides">
                <div className="score-reveal-side">
                  <span className="fighter for">{names.FOR}</span>
                  <span className="score-reveal-num">{verdict.scores.FOR[c.key]}</span>
                  <span className={`grade-chip grade-${grade(verdict.scores.FOR[c.key], c.max).replace('+', 'plus')}`}>
                    {grade(verdict.scores.FOR[c.key], c.max)}
                  </span>
                </div>
                <span className="vs">VS</span>
                <div className="score-reveal-side">
                  <span className="fighter against">{names.AGAINST}</span>
                  <span className="score-reveal-num">{verdict.scores.AGAINST[c.key]}</span>
                  <span className={`grade-chip grade-${grade(verdict.scores.AGAINST[c.key], c.max).replace('+', 'plus')}`}>
                    {grade(verdict.scores.AGAINST[c.key], c.max)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {revealed >= REVEAL_ORDER.length ? (
          <p className="subtitle">{t('totalsHidden')}</p>
        ) : null}
        {strip}
      </div>
    );
  }

  if (stage === 'drumroll') {
    return (
      <div className="stage center-col verdict-drum">
        <h1 className="display huge">{t('yapmasterIs')}</h1>
        {strip}
      </div>
    );
  }

  // The scoreboard, coaching, coach chat and actions: identical in both modes,
  // so it is built once and dropped into whichever ruling screen renders.
  const details = (
        <div className="verdict-details">
          {verdict.injectionDetected ? (
            <div className="banner banner-warn">{t('injection')}</div>
          ) : null}

          <div className="scoreboard card">
            <div className="score-head">
              <span className={`fighter for`}>
                {names.FOR} · {total(verdict.scores.FOR)}
              </span>
              <span className="vs">/100</span>
              <span className={`fighter against`}>
                {names.AGAINST} · {total(verdict.scores.AGAINST)}
              </span>
            </div>
            {CATEGORIES.map((c) => (
              <div className="score-row" key={c.key}>
                <span className="score-num">{verdict.scores.FOR[c.key]}</span>
                <div className="score-bars">
                  <div className="score-bar left">
                    <div
                      className="score-fill fill-for"
                      style={{ width: `${(verdict.scores.FOR[c.key] / c.max) * 100}%` }}
                    />
                  </div>
                  <span className="score-label" title={t(c.descKey)}>
                    {t(c.labelKey)} <em>/{c.max}</em>
                  </span>
                  <div className="score-bar">
                    <div
                      className="score-fill fill-against"
                      style={{ width: `${(verdict.scores.AGAINST[c.key] / c.max) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="score-num">{verdict.scores.AGAINST[c.key]}</span>
              </div>
            ))}
          </div>

          <div className="quotes">
            {(['FOR', 'AGAINST'] as Side[]).map((side) =>
              verdict.bestQuote[side] ? (
                <blockquote key={side} className={`quote ${side === 'FOR' ? 'for' : 'against'}`}>
                  “{verdict.bestQuote[side]}”
                  <cite>— {names[side]}</cite>
                </blockquote>
              ) : null,
            )}
          </div>

          <div className="feedback-cols">
            {(['FOR', 'AGAINST'] as Side[]).map((side) => (
              <div key={side} className="card feedback">
                <h3 className={side === 'FOR' ? 'for' : 'against'}>{names[side]}</h3>
                <ul>
                  {verdict.feedback[side].map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {mySide !== undefined ? (
            <div className="coach-card card">
              <h3 className="coach-title">{t('coachTitle')}</h3>
              {/* one chat, not two. the note is what tells you arguing with the
                  ruling is on the table at all — no mode switch needed. */}
              <p className="coach-note">{t('coachNote')}</p>
              {coachLog.length > 0 || coachThinking ? (
                <div className="coach-log">
                  {coachLog.map((m, i) => (
                    <p key={i} className={`coach-msg ${m.role}`}>
                      {m.error ? t('coachError') : m.text}
                    </p>
                  ))}
                  {coachThinking ? (
                    <p className="coach-msg coach thinking">{t('coachThinking')}</p>
                  ) : null}
                </div>
              ) : null}

              {coachAsks < COACH_LIMIT ? (
                <>
                  <div className="coach-presets">
                    {[
                      youWon ? 'coachHowWon' : 'coachWhyLost',
                      'coachImprove',
                      'coachChallenge',
                    ].map((key) => (
                      <button
                        key={key}
                        className="btn btn-small"
                        disabled={coachThinking}
                        onClick={() => askCoach(t(key))}
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                  <div className="coach-input-row">
                    <input
                      className="input"
                      value={coachInput}
                      placeholder={t('coachPlaceholder')}
                      maxLength={300}
                      onChange={(e) => setCoachInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') askCoach(coachInput);
                      }}
                    />
                    <button
                      className="btn"
                      disabled={coachThinking || !coachInput.trim()}
                      onClick={() => askCoach(coachInput)}
                    >
                      {t('coachSend')}
                    </button>
                  </div>
                </>
              ) : (
                <p className="coach-done">{t('coachDone')}</p>
              )}
            </div>
          ) : null}

          {/* Opt-in per debate. Nothing leaves until you press it, and even
              then the result rides inside the link rather than a database. */}
          <div className="share-row">
            <button className="btn btn-small" disabled={shareState === 'working'} onClick={share}>
              {shareState === 'copied' ? t('shareCopied') : t('shareBtn')}
            </button>
            <p className="share-note">
              {shareState === 'failed' ? t('shareFailed') : t('shareNote')}
            </p>
          </div>

          <div className="verdict-actions">
            {botOpponent || ranked ? (
              <button className="btn btn-primary" onClick={() => window.location.assign('/')}>
                {t(ranked ? 'backToQueue' : 'newOpponent')}
              </button>
            ) : rematch?.peerLeft ? (
              <button className="btn btn-primary" disabled>
                {t('rematchPeerLeft', { x: peerName })}
              </button>
            ) : rematch?.youWant ? (
              <button className="btn btn-primary" disabled>
                {t('rematchWaiting', { x: peerName })}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onRematch}>
                {rematch?.peerWant ? t('rematchAccept', { x: peerName }) : t('rematch')}
              </button>
            )}
            <button className="btn" onClick={() => window.location.assign('/')}>
              {t('backHome')}
            </button>
            <button className="btn" onClick={toggleMute}>
              {muted ? t('unmuteStage') : t('muteStage')}
            </button>
          </div>
          {saveNudge ? (
            <div className="save-nudge">
              <p className="save-nudge-line">{t('saveThisNudge')}</p>
              <button className="btn btn-small btn-google" onClick={signIn}>
                {t('signInGoogle')}
              </button>
            </div>
          ) : null}

          {!botOpponent ? <ReportFlag /> : null}
          <p className="footnote">{t('condolences', { x: names[loser] })}</p>
        </div>
  );

  // Settle-it lands as a court ruling, not a scoreboard: what each of them said
  // the fight was about, then the split, then the decree, then the orders.
  const ruling = verdict.ruling;
  if (ruling) {
    const other: Side = winner === 'FOR' ? 'AGAINST' : 'FOR';
    return (
      <div className="stage center-col verdict">
        <p className="kicker">{t('theRuling')}</p>

        {framing ? (
          <div className="said-pair">
            <div className="said">
              <span className="said-who for">{names.FOR}</span>
              <p className="said-text">&ldquo;{framing.said.FOR}&rdquo;</p>
            </div>
            <div className="said">
              <span className="said-who against">{names.AGAINST}</span>
              <p className="said-text">&ldquo;{framing.said.AGAINST}&rdquo;</p>
            </div>
          </div>
        ) : null}

        <p className="kicker">{t('theArgument')}</p>
        <h1 className="display motion">{topic?.[lang] ?? ''}</h1>

        <div className="split">
          <div className={`split-half ${winner === 'FOR' ? 'for' : 'against'} split-win`}>
            <span className="split-pct">{ruling.split[winner]}</span>
            <span className="split-name">{names[winner]}</span>
          </div>
          <span className="split-slash">/</span>
          <div className={`split-half ${other === 'FOR' ? 'for' : 'against'}`}>
            <span className="split-pct">{ruling.split[other]}</span>
            <span className="split-name">{names[other]}</span>
          </div>
        </div>

        <p className="decree">{ruling.decree}</p>

        {ruling.orders.length > 0 ? (
          <div className="orders card">
            <span className="orders-label">{t('theOrders')}</span>
            {ruling.orders.map((o, i) => (
              <p key={i} className="order">
                {o}
              </p>
            ))}
          </div>
        ) : null}

        {mySide !== undefined && info.heard && info.heard[mySide] === 0 ? (
          <div className="not-heard">
            <p className="not-heard-line">{t('notHeard')}</p>
            <p className="not-heard-fix">{t('notHeardFix')}</p>
          </div>
        ) : null}
        {strip}
        {stage === 'details' ? details : null}
      </div>
    );
  }

  return (
    <div className="stage center-col verdict">
      <p className="kicker">{topic?.[lang] ?? ''}</p>
      <div className={`stamp ${winner === 'FOR' ? 'for' : 'against'}`}>
        <span className="stamp-label">{t('yapmaster')}</span>
        <span className="stamp-name display">{names[winner]}</span>
        <span className="stamp-side">{t(winner)}</span>
      </div>
      <p className="summary">{verdict.summary}</p>
      {/* Zero words from you means the mic never reached the judge. Say that
          plainly — otherwise it reads as a defeat you earned, and the only way
          to find out is to ask the coach afterwards and be told "I heard
          nothing", which is how this surfaced in the first place. */}
      {mySide !== undefined && info.heard && info.heard[mySide] === 0 ? (
        <div className="not-heard">
          <p className="not-heard-line">{t('notHeard')}</p>
          <p className="not-heard-fix">{t('notHeardFix')}</p>
        </div>
      ) : mySide !== undefined ? (
        <>
          <p className={`you-result ${youWon ? 'won' : 'lost'}`}>
            {youWon ? t('youWon') : t('youLost')}
          </p>
          {info.elo?.[mySide] ? (
            <p className={`elo-line ${youWon ? 'won' : 'lost'}`}>
              {t('eloLine', { a: info.elo[mySide].before, b: info.elo[mySide].after })}
            </p>
          ) : null}
        </>
      ) : null}
      {unlocked ? (
        <span className="tape tape-gold unlock-tape">
          {unlocked.unlocked
            ? t('unlockedTape', { x: unlocked.unlocked })
            : t('campaignDone')}
        </span>
      ) : null}
      {strip}

      {stage === 'details' ? details : null}
    </div>
  );
}
