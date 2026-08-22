// The Daily Drill. One skill, thirty seconds, the same one for everybody
// today, a number back immediately, and a streak that only survives if you
// come back tomorrow.
//
// It is deliberately the cheapest thing in the app to start: no opponent, no
// camera, no lobby, no account. Press one button and talk. That makes it the
// front door for anyone who is not ready to face a stranger yet, and the thing
// there is a reason to open the app for on a day you do not want to debate.
import { useEffect, useRef, useState } from 'react';
import { setSpeechSink, speechSupported, startTurn, stopTurn } from '../speech';
import { useI18n } from '../i18n';
import Brand from '../Brand';

interface DrillInfo {
  day: string;
  drill: { id: string; type: string; prompt: string; material: string };
  seconds: number;
  skill: string;
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

  useEffect(() => {
    void fetch('/drill')
      .then((r) => r.json())
      .then((d: DrillInfo) => {
        setInfo(d);
        setStreak(d.streak);
      })
      .catch(() => setError('drillDown'));
  }, []);

  // The mic belongs to the debate socket by default; take it for the drill and
  // always hand it back, including on an unmount mid-answer.
  useEffect(
    () => () => {
      stopTurn();
      setSpeechSink(null);
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

  function finish() {
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
        body: JSON.stringify({ text }),
      })
        .then((r) => r.json())
        .then((d: { result?: Result; streak?: number; error?: string }) => {
          if (d.error === 'too_short') {
            setStage('ready');
            return setError('drillTooShort');
          }
          if (!d.result) {
            setStage('ready');
            return setError('drillDown');
          }
          setResult(d.result);
          setStreak(d.streak ?? 0);
          setStage('done');
        })
        .catch(() => {
          setStage('ready');
          setError('drillDown');
        });
    }, 1800);
  }

  const band = (n: number) => (n >= 85 ? 'great' : n >= 65 ? 'good' : n >= 45 ? 'okay' : 'rough');

  return (
    <div className="stage drill">
      <header className="topbar">
        <button className="btn btn-small" onClick={onBack}>
          {t('back')}
        </button>
        <Brand />
        <span className="pill">{t('drillPill')}</span>
      </header>

      <h1 className="display page-title">{t('drillTitle')}</h1>
      {info ? (
        <p className="page-sub">
          {t('drillSkill', { x: info.skill })}
          {streak > 0 ? ` · ${t('drillStreak', { n: streak })}` : ''}
        </p>
      ) : null}

      {info ? (
        <div className="card drill-card">
          <p className="drill-prompt">{info.drill.prompt}</p>
          <blockquote className="drill-material">{info.drill.material}</blockquote>

          {stage === 'ready' ? (
            <>
              <button className="btn btn-primary btn-wide" onClick={begin}>
                {info.doneToday ? t('drillAgain') : t('drillStart')}
              </button>
              <p className="drill-note">{t('drillNote', { n: info.seconds })}</p>
            </>
          ) : stage === 'speaking' ? (
            <div className="drill-live">
              <span className={`drill-clock clock ${left <= 5 ? 'drill-clock-low' : ''}`}>
                0:{String(left).padStart(2, '0')}
              </span>
              <span className="drill-heard">{t('drillHeard', { n: words })}</span>
              <button className="btn btn-wide" onClick={finish}>
                {t('drillDoneBtn')}
              </button>
            </div>
          ) : stage === 'scoring' ? (
            <p className="drill-scoring">{t('drillScoring')}</p>
          ) : result ? (
            <div className="drill-result">
              <span className={`drill-score elo band-${band(result.score)}`}>{result.score}</span>
              <p className="drill-headline">{result.headline}</p>
              <p className="drill-line">
                <strong>{t('drillKept')}</strong> {result.kept}
              </p>
              <p className="drill-line">
                <strong>{t('drillFix')}</strong> {result.fix}
              </p>
              <button
                className="btn btn-wide"
                onClick={() => {
                  setResult(null);
                  setStage('ready');
                }}
              >
                {t('drillRetry')}
              </button>
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
