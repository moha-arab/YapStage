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
//
// HOW IT HEARS YOU: the way a match does. The answer is recorded
// (every browser can) and the server transcribes it with Whisper, then scores
// it. The browser's own speech recognition, which only Chrome has, is the
// fallback for when the server has no speech-to-text. While you talk, the
// recorded path cannot count words (nothing is transcribed until the end), so
// the mic line shows your level and whether we hear sound; the word count
// comes back with the score.
import { useEffect, useRef, useState } from 'react';
import { setSpeechSink, speechSupported, startTurn, stopTurn } from '../speech';
import { useI18n } from '../i18n';
import { localDrillState, recordLocalDrill } from '../guest';
import { useAudioLevel } from '../useAudioLevel';
import Brand from '../Brand';
import MicCheck, { type MicTone } from '../MicCheck';
import { JudgeNotes } from '../VerdictBlocks';
import { clipToBase64, drillRecordingSupported, startDrillRecording, type DrillRecording } from '../drillaudio';

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
  /** The server transcribes recorded audio. Absent on an older server. */
  stt?: boolean;
}

interface Result {
  score: number;
  headline: string;
  kept: string;
  fix: string;
}

interface Reply {
  result?: Result | null;
  streak?: number;
  error?: string;
  day?: string;
  daily?: boolean;
  /** How many words the judge had to go on. */
  words?: number;
}

type Stage = 'ready' | 'arming' | 'speaking' | 'scoring' | 'done';
/** Recorded and transcribed on the server, or heard by the browser. */
type Ears = 'server' | 'browser';

/** Below this the mic counts as silent, and this long silent with no words
    heard turns the mic line into a warning: the match's numbers (Debate.tsx),
    so both screens mean the same by "flat". */
const QUIET_LEVEL = 0.04;
const SILENT_MS = 4000;
/** How recently there must have been sound for the recorded path to say
    "the judge hears you" rather than just "recording". */
const HEARING_MS = 1500;

function earsFor(info: DrillInfo | null): Ears | null {
  if (info?.stt && drillRecordingSupported) return 'server';
  if (speechSupported) return 'browser';
  return null;
}

interface Props {
  onBack: () => void;
}

export default function Drill({ onBack }: Props) {
  const { t } = useI18n();
  const [info, setInfo] = useState<DrillInfo | null>(null);
  const [stage, setStage] = useState<Stage>('ready');
  const [left, setLeft] = useState(0);
  const [words, setWords] = useState(0);
  const [heard, setHeard] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** The mic was refused (or there is none). Said before the clock starts. */
  const [blocked, setBlocked] = useState(false);
  const textRef = useRef('');
  const headlineRef = useRef<HTMLParagraphElement>(null);
  const aliveRef = useRef(true);
  const earsRef = useRef<Ears>('server');
  const recRef = useRef<DrillRecording | null>(null);

  // One mic stream: it feeds the five-bar meter and, on the recorded path,
  // the recording itself.
  const [mic, setMic] = useState<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const speakingRef = useRef(false);
  const level = useAudioLevel(mic);
  const loudAt = useRef(0);
  const everLoud = useRef(false);

  function releaseMic() {
    micRef.current?.getTracks().forEach((tr) => tr.stop());
    micRef.current = null;
    setMic(null);
  }

  // One argument a day and nothing else on offer (the skill picker went with
  // the other drill types): the only way to get Saturday's argument is to
  // come back on Saturday.
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
    aliveRef.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A mic this site is already blocked from is said on arrival, where the
  // browser lets us ask without prompting. Firefox and older Safari cannot
  // be asked; for them the refusal shows up when Start asks for the mic.
  useEffect(() => {
    let status: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        if (!aliveRef.current) return;
        status = s;
        if (s.state === 'denied') setBlocked(true);
        s.onchange = () => setBlocked(s.state === 'denied');
      })
      .catch(() => {});
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  // The mic belongs to the debate socket by default; take it for the drill and
  // always hand it back, including on an unmount mid-answer.
  useEffect(
    () => () => {
      aliveRef.current = false;
      recRef.current?.cancel();
      recRef.current = null;
      stopTurn();
      setSpeechSink(null);
      speakingRef.current = false;
      micRef.current?.getTracks().forEach((tr) => tr.stop());
      micRef.current = null;
    },
    [],
  );

  async function begin() {
    if (!info || stage !== 'ready') return;
    const ears = earsFor(info);
    if (!ears) return setError('drillNeedsChrome');
    setError(null);
    setHeard(null);
    setStage('arming');
    // The mic first, the clock second. A refused mic used to start the
    // thirty seconds anyway and end on "say a full thought", blaming the
    // answer for a permission.
    let stream: MediaStream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no mediaDevices');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (!aliveRef.current) return;
      setBlocked(true);
      setStage('ready');
      return;
    }
    if (!aliveRef.current) {
      stream.getTracks().forEach((tr) => tr.stop());
      return;
    }
    setBlocked(false);
    micRef.current = stream;
    setMic(stream);
    textRef.current = '';
    setWords(0);

    let mode: Ears = ears;
    if (mode === 'server') {
      recRef.current = startDrillRecording(stream);
      if (!recRef.current) mode = 'browser';
    }
    if (mode === 'browser') {
      if (!speechSupported) {
        releaseMic();
        setStage('ready');
        return setError('drillDown');
      }
      setSpeechSink((chunk) => {
        textRef.current = `${textRef.current} ${chunk}`.trim();
        setWords(textRef.current.split(/\s+/).filter(Boolean).length);
      });
      startTurn(0);
    }
    earsRef.current = mode;
    speakingRef.current = true;
    loudAt.current = Date.now();
    everLoud.current = false;
    setLeft(info.seconds);
    setStage('speaking');
  }

  useEffect(() => {
    if (stage !== 'speaking') return;
    if (left <= 0) {
      void finish();
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

  function fail(key: string) {
    if (!aliveRef.current) return;
    setStage('ready');
    setError(key);
  }

  async function finish() {
    if (!speakingRef.current) return;
    speakingRef.current = false;
    setStage('scoring');
    const id = info?.drill.id;
    if (earsRef.current === 'server') {
      const rec = recRef.current;
      recRef.current = null;
      const clip = rec ? await rec.stop() : null;
      releaseMic();
      // Under ~1 KB is a recorder that heard nothing at all.
      if (!clip || clip.data.size < 1000) return fail('dvMicSilent');
      let audio: string;
      try {
        audio = await clipToBase64(clip.data);
      } catch {
        return fail('drillDown');
      }
      return submit({ audio, mime: clip.mime, id });
    }
    releaseMic();
    stopTurn();
    // Chrome delivers the last final result up to a couple of seconds after
    // stop(), so the answer is not complete the instant the clock hits zero.
    await new Promise((r) => window.setTimeout(r, 1800));
    setSpeechSink(null);
    const text = textRef.current.trim();
    // Nothing recognised at all is the mic, not the answer.
    if (!text) return fail('dvMicSilent');
    return submit({ text, id });
  }

  async function submit(body: { text?: string; audio?: string; mime?: string; id?: string }) {
    try {
      const r = await fetch('/drill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as Reply;
      if (!aliveRef.current) return;
      if (typeof d.words === 'number') setHeard(d.words);
      // Transcribed and silent: the recording had no speech in it.
      if (d.error === 'not_heard') return fail('dvMicSilent');
      if (d.error === 'too_short') return fail('drillTooShort');
      if (!d.result) return fail('drillDown');
      setResult(d.result);
      // Signed out, the device keeps the streak, on the server's day and
      // only for the day's own argument, the same two rules recordDrill
      // uses.
      if (info && !info.signedIn && d.daily && d.day) setStreak(recordLocalDrill(d.day, d.result.score).streak);
      else setStreak(d.streak ?? 0);
      setStage('done');
    } catch {
      fail('drillDown');
    }
  }

  const band = (n: number) => (n >= 85 ? 'great' : n >= 65 ? 'good' : n >= 45 ? 'okay' : 'rough');

  // The mic line: what the judge has, in the match's words. The browser
  // path counts words as they are recognised; the recorded path can only
  // tell sound from silence until the answer is transcribed.
  const now = Date.now();
  if (level > QUIET_LEVEL) {
    loudAt.current = now;
    everLoud.current = true;
  }
  let micTone: MicTone;
  let micText: string;
  if (earsRef.current === 'server') {
    const silent = !everLoud.current && now - loudAt.current >= SILENT_MS;
    const hearing = everLoud.current && now - loudAt.current < HEARING_MS;
    micTone = silent ? 'warn' : hearing ? 'heard' : 'live';
    micText = silent ? t('dvMicSilent') : hearing ? t('micHears') : t('micRecording');
  } else {
    const quiet = stage === 'speaking' && words === 0 && now - loudAt.current >= SILENT_MS;
    micTone = words > 0 ? 'heard' : quiet ? 'warn' : 'live';
    micText = words > 0 ? t('micHeard') : quiet ? t('dvMicSilent') : t('micLive');
  }
  const canStart = earsFor(info) !== null;

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

          {stage === 'ready' || stage === 'arming' ? (
            <>
              {/* Said on arrival, not after a tap that goes nowhere. */}
              {!canStart ? <p className="drill-warn">{t('drillNeedsChrome')}</p> : null}
              {/* The match's own blocked-mic line and Retry. */}
              {blocked ? (
                <p className="error" role="alert">
                  {t('micError')}{' '}
                  <button className="btn btn-small" disabled={stage === 'arming'} onClick={() => void begin()}>
                    {t('retry')}
                  </button>
                </p>
              ) : stage === 'arming' ? (
                <p className="drill-note" role="status">
                  {t('micWhy')}
                </p>
              ) : null}
              <button
                className="btn btn-primary btn-wide"
                disabled={!canStart || stage === 'arming'}
                onClick={() => void begin()}
              >
                {info.doneToday ? t('drillAgain') : t('drillStart')}
              </button>
            </>
          ) : stage === 'speaking' ? (
            <div className="drill-live">
              <span className={`drill-clock ${left <= 5 ? 'drill-clock-low' : ''}`} role="timer">
                0:{String(left).padStart(2, '0')}
              </span>
              <MicCheck level={level} tone={micTone} text={micText} dark />
              {earsRef.current === 'browser' ? (
                <span className="drill-heard">{t('drillHeard', { n: words })}</span>
              ) : null}
              <button className="btn btn-wide" onClick={() => void finish()}>
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
              {heard !== null ? <p className="drill-note">{t('drillHeard', { n: heard })}</p> : null}
              <div className="drill-actions">
                <button className="btn btn-primary btn-wide" onClick={onBack}>
                  {t('backHome')}
                </button>
                <button
                  className="btn btn-wide"
                  onClick={() => {
                    setResult(null);
                    setHeard(null);
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
              {/* How much got through, so "too short" is checkable. */}
              {error === 'drillTooShort' && heard !== null ? ` ${t('drillHeard', { n: heard })}.` : ''}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="feed-empty">{t('loading')}</p>
      )}
    </div>
  );
}
