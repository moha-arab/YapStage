import { useEffect, useMemo, useState } from 'react';
import { NAME_RE, type JoinError, type LobbyUpdate } from '../../../server/src/protocol';
import { session, socket } from '../socket';
import { loadReceipts, readPattern, type Category } from '../history';
import { useI18n } from '../i18n';

/** Category -> the plain-English name the judge and the learn screen use. */
const CAT_KEY: Record<Category, string> = {
  argument: 'catArgument',
  evidence: 'catEvidence',
  clash: 'catClash',
  delivery: 'catDelivery',
};

const ERROR_KEYS: Record<JoinError, string> = {
  not_found: 'errNotFound',
  full: 'errFull',
  in_progress: 'errInProgress',
  bad_name: 'errBadName',
  rate_limited: 'errRateLimited',
};

/** Errors render next to the thing that caused them, not in a shared pile at
    the bottom of the card. bad_name always routes to the name field. */
type ErrorZone = 'name' | 'doors' | 'ticket';

interface Props {
  notice: string | null;
  onEntered: (u: LobbyUpdate) => void;
  onPlayBot: (name: string) => void;
  onLearn: () => void;
}

export default function Home({ notice, onEntered, onPlayBot, onLearn }: Props) {
  const { lang, t } = useI18n();
  const [name, setName] = useState('');
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '',
  );
  // Arriving via an invite link is a different visitor: they were sent here to
  // JOIN, so the ticket takes over and the three doors step aside.
  const [invited] = useState(
    () => new URLSearchParams(window.location.search).get('code') !== null,
  );
  const [doorsRevealed, setDoorsRevealed] = useState(false);
  const [error, setError] = useState<{ key: string; zone: ErrorZone } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipts] = useState(loadReceipts);
  const pattern = useMemo(() => readPattern(receipts), [receipts]);
  const [showMatches, setShowMatches] = useState(false);

  // With server-side transcription the chrome-only warning is a lie; only
  // show it when this deployment really depends on the browser's own STT.
  const [serverStt, setServerStt] = useState(true);
  useEffect(() => {
    fetch('/healthz')
      .then((r) => r.json())
      .then((h) => setServerStt(h.stt === 'cloudflare'))
      .catch(() => {});
  }, []);

  const validName = NAME_RE.test(name);
  const wins = receipts.filter((r) => r.won).length;

  // Doors stay full-color instead of greying out on an empty name: a wall of
  // disabled buttons reads as "broken", not "type your name". Clicking without
  // a name nudges you to the field instead.
  function requireName(): boolean {
    if (validName) return true;
    setError({ key: 'nameFirst', zone: 'name' });
    document.getElementById('yapname')?.focus();
    return false;
  }

  function create(mode?: 'dispute') {
    if (busy || !requireName()) return;
    setBusy(true);
    socket.emit('lobby:create', { sessionId: session.id, name }, (res) => {
      setBusy(false);
      if (!res.ok) {
        return setError({
          key: ERROR_KEYS[res.error],
          zone: res.error === 'bad_name' ? 'name' : 'doors',
        });
      }
      // Settle-it is the same lobby with the mode pre-set, so the green room
      // opens straight onto "describe the argument" instead of a topic list.
      if (mode) socket.emit('pick:mode', mode);
      onEntered(mode ? { ...res.update, topicMode: mode } : res.update);
    });
  }

  function join() {
    if (busy || !requireName()) return;
    if (code.trim().length !== 6) return setError({ key: 'errCodeLen', zone: 'ticket' });
    setBusy(true);
    socket.emit(
      'lobby:join',
      { code: code.trim().toUpperCase(), sessionId: session.id, name },
      (res) => {
        setBusy(false);
        if (res.ok) return onEntered(res.update);
        setError({
          key: ERROR_KEYS[res.error],
          zone: res.error === 'bad_name' ? 'name' : 'ticket',
        });
        // A dead invite code must never strand a deep-linked visitor on one
        // broken action: give them the doors too.
        setDoorsRevealed(true);
      },
    );
  }

  function handleBot() {
    if (!requireName()) return;
    onPlayBot(name);
  }

  const zoneError = (zone: ErrorZone) =>
    error && error.zone === zone ? (
      <p className="error" role="alert">
        {t(error.key)}
      </p>
    ) : null;

  const doors = (
    <div className="doors">
      <span className="field-label">{t('startSomething')}</span>
      <button className="btn door door-primary" disabled={busy} onClick={() => create()}>
        <span className="door-tape">{t('tapeMainEvent')}</span>
        <span className="door-title">{t('debateFriend')}</span>
        <span className="door-desc">{t('debateFriendDesc')}</span>
      </button>
      <button className="btn door door-settle" disabled={busy} onClick={() => create('dispute')}>
        <span className="door-tape">{t('tapeGrudge')}</span>
        <span className="door-title">{t('settleItBtn')}</span>
        <span className="door-desc">{t('settleDesc')}</span>
      </button>
      <button className="btn door door-bot" onClick={handleBot}>
        {receipts.length === 0 ? <span className="door-sticker">{t('botSticker')}</span> : null}
        <span className="door-tape">{t('tapeTraining')}</span>
        <span className="door-title">{t('playBot')}</span>
        <span className="door-desc">{t('botDesc')}</span>
      </button>
      {zoneError('doors')}
    </div>
  );

  const ticket = (hero: boolean) => (
    <div className={`join-ticket ${hero ? 'join-ticket-hero' : ''}`}>
      {hero ? (
        <>
          <span className="door-tape">{t('calledOut')}</span>
          <p className="ticket-head ticket-head-hero">{t('calledOutLine')}</p>
        </>
      ) : (
        <p className="ticket-head">
          <strong>{t('invitedHeader')}</strong> {t('invitedLine')}
        </p>
      )}
      <div className="join-row">
        <input
          className="input input-code"
          placeholder={t('codePlaceholder')}
          maxLength={6}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') join();
          }}
        />
        <button className={`btn ${hero ? 'btn-primary' : ''}`} disabled={busy} onClick={join}>
          {t('walkIn')}
        </button>
      </div>
      {zoneError('ticket')}
    </div>
  );

  return (
    <>
      <div className="stage center-col home">
        {notice ? <div className="banner">{t(notice)}</div> : null}
        <p className="kicker">{t('kicker')}</p>
        <h1 className="display logo">
          YAP<span className="logo-accent">STAGE</span>
        </h1>
        <p className="subtitle">{t('homeSubtitle')}</p>

        <div className="card">
          <label className="field-label" htmlFor="yapname">
            {t('yourYapName')}
          </label>
          <input
            id="yapname"
            className="input"
            placeholder={t('namePlaceholder')}
            maxLength={16}
            value={name}
            aria-describedby="name-hint"
            onChange={(e) => {
              setName(e.target.value.replace(/\s/g, ''));
              setError(null);
            }}
            autoFocus
          />
          <div id="name-hint">
            {name && !validName ? <p className="field-hint">{t('errBadName')}</p> : null}
            {zoneError('name')}
          </div>

          {invited && !doorsRevealed ? (
            // Invite-link arrival: the ticket IS the page. The doors wait
            // behind one quiet link so the invited person is never lost.
            <>
              {ticket(true)}
              <button
                className="btn btn-small btn-wide reveal-doors"
                onClick={() => setDoorsRevealed(true)}
              >
                {t('orStartOwn')}
              </button>
            </>
          ) : (
            <>
              {doors}
              {ticket(false)}
            </>
          )}
        </div>

        {/* Never played? The rules stand between you and a good first match,
            so the door to them is a loud marker note, not a fourth button
            cosplaying as a game mode. */}
        {receipts.length === 0 ? (
          <button className="learn-callout" onClick={onLearn}>
            {t('learnBtnFirst')}
          </button>
        ) : null}

        {/* Everything personal lives in one corner: your pattern, your record,
            your matches, the way back to debate school. One section, one tape. */}
        {receipts.length > 0 ? (
          <div className="corner">
            <span className="tape">{t('yourCorner')}</span>

            {pattern ? (
              <div className="coach-read">
                <span className="coach-read-label">{t('patternTitle')}</span>
                <p className="coach-read-line">
                  {t('patternWeak', {
                    cat: t(CAT_KEY[pattern.worst]),
                    avg: String(pattern.worstAvg),
                    max: String(pattern.worstMax),
                    n: String(pattern.counted),
                  })}
                </p>
                <p className="coach-read-sub">
                  {t('patternStrong', { cat: t(CAT_KEY[pattern.best]) })}
                </p>
              </div>
            ) : null}

            {/* The W-L tape IS the toggle: one control instead of a decorative
                sticker plus a separate button saying almost the same thing. */}
            <button
              className="tape record-toggle"
              aria-expanded={showMatches}
              onClick={() => setShowMatches((s) => !s)}
            >
              {t('recordToggle', {
                w: wins,
                l: receipts.length - wins,
                n: receipts.length,
              })}
            </button>

            {showMatches ? (
              <div className="bouts">
                {receipts.map((r) => (
                  <div className="bout-row" key={r.at}>
                    <span className={`bout-mark ${r.won ? 'bout-w' : 'bout-l'}`}>
                      {r.won ? 'W' : 'L'}
                    </span>
                    <span className="bout-names">
                      {r.me} <em>{r.myTotal}</em> vs {r.them} <em>{r.theirTotal}</em>
                    </span>
                    <span className="bout-topic">"{r.topic}"</span>
                    <span className="bout-date">
                      {new Date(r.at).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-US')}
                    </span>
                  </div>
                ))}
                <p className="small-print">{t('receiptsNote')}</p>
              </div>
            ) : null}

            <button className="btn btn-small" onClick={onLearn}>
              {t('learnBtn')}
            </button>
          </div>
        ) : null}

        <div className="fine-print">
          <p className="footnote">{t(serverStt ? 'footAny' : 'footChrome')}</p>
          <p className="small-print">{t('smallPrint')}</p>
          {/* Which bundle is this phone actually running? Once the app installs
              to a home screen, that stops being answerable any other way. */}
          <p className="build-stamp">build {__BUILD__}</p>
        </div>
      </div>

      {/* Full-bleed sibling of the stage, not a negative-margin hack inside it. */}
      <div className="marquee" aria-hidden="true">
        <span className="marquee-track">
          {t('marquee').repeat(4)}
          {t('marquee').repeat(4)}
        </span>
      </div>
    </>
  );
}
