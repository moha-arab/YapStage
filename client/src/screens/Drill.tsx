// The daily rebuttal. One argument, thirty seconds, the same one for everybody
// today, a number back immediately, and a streak that only survives if you
// come back tomorrow. The argument gets harder through the week, Sunday to
// Saturday; the card says "Day 3 of 7" rather than the weekday because the
// day rolls over on UTC and an evening player would otherwise see Tuesday's
// argument labelled Monday.
//
// It is deliberately the cheapest thing in the app to start: no opponent, no
// camera, no lobby, no account. Press one button and talk. That makes it the
// front door for anyone who is not ready to face a stranger yet, and the thing
// there is a reason to open the app for on a day you do not want to debate.
import { useEffect, useRef, useState } from 'react';
import { setSpeechSink, speechSupported, startTurn, stopTurn } from '../speech';
import { useI18n } from '../i18n';
import { localDrillState, recordLocalDrill } from '../guest';
import { useAudioLevel } from '../useAudioLevel';
import Brand from '../Brand';
import MicCheck, { type MicTone } from '../MicCheck';
import { JudgeNotes } from '../VerdictBlocks';

interface DrillInfo {
  day: string;
  drill: { id: string; tier: number; prompt: string; material: string };
  tier: number;
  tierName: string;
  seconds: number;
  streak: number;
  best: number;
  doneToday: boolean;
  signedIn: boolean;
}

interface Result {
  score: number;
  headline: string;
  kept: string;
  fix: string;
}

type Stage = 'ready' | 'speaking' | 'scoring' | 'done';

/** Below this the mic counts as silent, and this long silent with no words
    heard turns the mic line into a warning: the match's numbers (Debate.tsx),
    so both screens mean the same by "flat". */
const QUIET_LEVEL = 0.04;
const SILENT_MS = 4000;

interface Props {
  onBack: () => void;
}

export default function Drill({ onBack }: Props) {
  const { t } = useI18n();
  const [info, setInfo] = useState<DrillInfo | null>(null);
  const [stage, setStage] = useState<Stage>('ready');
  const [left, setLeft] = useState(0);
  const [words, setWords] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef('');
  const headlineRef = useRef<HTMLParagraphElement>(null);

  // The meter's own ears: a plain mic stream, analysed on this page and sent
  // nowhere. The words still go through speech recognition as before; this
  // only drives the five bars, the same meter the match shows.
  const [mic, setMic] = useState<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const speakingRef = useRef(false);
  const level = useAudioLevel(mic);
  const loudAt = useRef(0);

  function releaseMic() {
    micRef.current?.getTracks().forEach((tr) => tr.stop());
    micRef.current = null;
    setMic(null);
  }

  // One argument a day and nothing else on offer (the skill picker went with
  // the other drill types, 2026-09-12): the only way to get Saturday's
  // argument is to come back on Saturday.
  function load() {
    stopTurn();
    setSpeechSink(null);
    setResult(null);
    setError(null);
    setStage('ready');
    void fetch('/drill')
      .then((r) => r.json())
      .then((d: DrillInfo) => {
        // A guest's streak is the device's (guest.ts); the server's zeros
        // are for people it cannot name.
        const info = d.signedIn ? d : { ...d, ...localDrillState(d.day) };
        setInfo(info);
        setStreak(info.streak);
      })
      .catch(() => setError('drillDown'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The mic belongs to the debate socket by default; take it for the drill and
  // always hand it back, including on an unmount mid-answer.
  useEffect(
    () => () => {
      stopTurn();
      setSpeechSink(null);
      speakingRef.current = false;
      micRef.current?.getTracks().forEach((tr) => tr.stop());
      micRef.current = null;
    },
    [],
  );

  function begin() {
    if (!info || stage !== 'ready') return;
    if (!speechSupported) return setError('drillNeedsChrome');
    textRef.current = '';
    setWords(0);
    setError(null);
    setSpeechSink((chunk) => {
      textRef.current = `${textRef.current} ${chunk}`.trim();
      setWords(textRef.current.split(/\s+/).filter(Boolean).length);
    });
    startTurn(0);
    setStage('speaking');
    setLeft(info.seconds);
    speakingRef.current = true;
    loudAt.current = Date.now();
    void navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        // The answer may be over before the permission prompt is.
        if (!speakingRef.current) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        micRef.current?.getTracks().forEach((tr) => tr.stop());
        micRef.current = s;
        setMic(s);
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (stage !== 'speaking') return;
    if (left <= 0) {
      finish();
      return;
    }
    const id = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, left]);

  // The result's headline takes focus when it lands, so it is read out.
  useEffect(() => {
    if (stage === 'done') headlineRef.current?.focus();
  }, [stage]);

  function finish() {
    speakingRef.current = false;
    releaseMic();
    stopTurn();
    setStage('scoring');
    // Chrome delivers the last final result up to a couple of seconds after
    // stop(), so the answer is not complete the instant the clock hits zero.
    window.setTimeout(() => {
      setSpeechSink(null);
      const text = textRef.current.trim();
      void fetch('/drill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, id: info?.drill.id }),
      })
        .then((r) => r.json())
        .then((d: { result?: Result; streak?: number; error?: string; day?: string; daily?: boolean }) => {
          if (d.error === 'too_short') {
            setStage('ready');
            return setError('drillTooShort');
          }
          if (!d.result) {
            setStage('ready');
            return setError('drillDown');
          }
          setResult(d.result);
          // Signed out, the device keeps the streak, on the server's day and
          // only for the day's own argument, the same two rules recordDrill
          // uses.
          if (info && !info.signedIn && d.daily && d.day) setStreak(recordLocalDrill(d.day, d.result.score).streak);
          else setStreak(d.streak ?? 0);
          setStage('done');
        })
        .catch(() => {
          setStage('ready');
          setError('drillDown');
        });
    }, 1800);
  }

  const band = (n: number) => (n >= 85 ? 'great' : n >= 65 ? 'good' : n >= 45 ? 'okay' : 'rough');

  // The mic line: what the judge has, in the match's words.
  if (level > QUIET_LEVEL) loudAt.current = Date.now();
  const quiet = stage === 'speaking' && words === 0 && Date.now() - loudAt.current >= SILENT_MS;
  const micTone: MicTone = words > 0 ? 'heard' : quiet ? 'warn' : 'live';
  const micText = words > 0 ? t('micHeard') : quiet ? t('dvMicSilent') : t('micLive');

  return (
    <div className="stage drill">
      <header className="topbar scr-bar">
        <Brand />
        <button className="scr-btn" onClick={onBack}>
          {t('back')}
        </button>
      </header>

      <h1 className="display page-title">{t('drillTitle')}</h1>
      {info ? (
        <p className="page-sub">
          {t('drillTier', { n: info.tier })}
          {streak > 0 ? ` · ${t('drillStreak', { n: streak })}` : ''}
          <br />
          {t('drillRamp')}
        </p>
      ) : null}

      {info ? (
        <div className="card drill-card">
          <p className="drill-prompt">{info.drill.prompt}</p>
          <blockquote className="drill-material">{info.drill.material}</blockquote>

          {stage === 'ready' ? (
            <>
              {/* Said on arrival, not after a tap that goes nowhere. */}
              {!speechSupported ? <p className="drill-warn">{t('drillNeedsChrome')}</p> : null}
              <button className="btn btn-primary btn-wide" disabled={!speechSupported} onClick={begin}>
                {info.doneToday ? t('drillAgain') : t('drillStart')}
              </button>
            </>
          ) : stage === 'speaking' ? (
            <div className="drill-live">
              <span className={`drill-clock ${left <= 5 ? 'drill-clock-low' : ''}`} role="timer">
                0:{String(left).padStart(2, '0')}
              </span>
              <MicCheck level={level} tone={micTone} text={micText} dark />
              <span className="drill-heard">{t('drillHeard', { n: words })}</span>
              <button className="btn btn-wide" onClick={finish}>
                {t('drillDoneBtn')}
              </button>
            </div>
          ) : stage === 'scoring' ? (
            <p className="drill-scoring" role="status">
              {t('drillScoring')}
            </p>
          ) : result ? (
            <div className="drill-result">
              {/* A score, not a prize: paper, with the word that says what
                  the number means. Turquoise is AGAINST, green is live, gold
                  is a win, and this is none of them. */}
              <div className="drill-score-block">
                <span className="drill-score">{result.score}</span>
                <span className="drill-band">{t(`drillBand_${band(result.score)}`)}</span>
              </div>
              <p className="drill-headline" ref={headlineRef} tabIndex={-1}>
                {result.headline}
              </p>
              <JudgeNotes notes={[result.kept, result.fix]} />
              <div className="drill-actions">
                <button className="btn btn-primary btn-wide" onClick={onBack}>
                  {t('backHome')}
                </button>
                <button
                  className="btn btn-wide"
                  onClick={() => {
                    setResult(null);
                    setStage('ready');
                  }}
                >
                  {t('drillRetry')}
                </button>
              </div>
              {!info.signedIn ? <p className="drill-note">{t('drillSignInStreak')}</p> : null}
            </div>
          ) : null}

          {error ? (
            <p className="error" role="alert">
              {t(error)}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="feed-empty">{t('loading')}</p>
      )}
    </div>
  );
}
