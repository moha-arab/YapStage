import { useEffect, useMemo, useState } from 'react';
import { NAME_RE, type JoinError, type LobbyUpdate } from '../../../server/src/protocol';
import { session, socket } from '../socket';
import { loadReceipts, readPattern, type Category } from '../history';
import { playerId, signIn, signOut, whoAmI, type Account } from '../player';
import { unlockSpectateAudio } from '../specaudio';
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
  locked: 'errLocked',
};

/** Errors render next to the thing that caused them, not in a shared pile.
    bad_name always routes to the name field. */
type ErrorZone = 'name' | 'panel' | 'ticket';

/** The five things you can do here. One selector, uniform tiles — no mode is
    "the yellow one" anymore. */
type Mode = 'custom' | 'ranked' | 'training' | 'spectate' | 'tutorial';
const MODES: Mode[] = ['custom', 'ranked', 'training', 'spectate', 'tutorial'];

interface Props {
  notice: string | null;
  onEntered: (u: LobbyUpdate) => void;
  onPlayBot: (name: string) => void;
  onSpectate: (code: string) => void;
  onTutorial: (name: string) => void;
}

export default function Home({ notice, onEntered, onPlayBot, onSpectate, onTutorial }: Props) {
  const { lang, t } = useI18n();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('custom');
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '',
  );
  const [watchCode, setWatchCode] = useState('');
  // Arriving via an invite link is a different visitor: they were sent here to
  // JOIN, so the ticket takes over and the mode selector steps aside.
  const [invited] = useState(
    () => new URLSearchParams(window.location.search).get('code') !== null,
  );
  const [doorsRevealed, setDoorsRevealed] = useState(false);
  const [error, setError] = useState<{ key: string; zone: ErrorZone } | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ waiting: number; rating: number } | null>(null);
  // chess.com's pattern: browse freely, the ask lands when you try to PLAY.
  const [account, setAccount] = useState<Account>({ signedIn: false, google: false });
  useEffect(() => {
    void whoAmI().then(setAccount);
  }, []);
  // Google bounced us back with a result: say what happened, then clean the URL
  // so a refresh doesn't replay the message.
  const [authNote] = useState(() => new URLSearchParams(window.location.search).get('auth'));
  useEffect(() => {
    if (!authNote) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('auth');
    window.history.replaceState({}, '', url.toString());
  }, [authNote]);
  const needAccount = account.google && !account.signedIn;
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

  // Ranked queue lifecycle: matched means both players land in a green room;
  // leaving this screen for any reason gives the seat back.
  useEffect(() => {
    const onUpdate = (p: { waiting: number; rating: number }) => setQueueInfo(p);
    const onMatched = (p: { update: LobbyUpdate }) => {
      setQueueing(false);
      onEntered(p.update);
    };
    socket.on('queue:update', onUpdate);
    socket.on('queue:matched', onMatched);
    return () => {
      socket.off('queue:update', onUpdate);
      socket.off('queue:matched', onMatched);
      socket.emit('queue:leave');
    };
  }, [onEntered]);

  // Signed in: the yap name comes from the account and can't be retyped.
  const effName = account.signedIn && account.name ? account.name : name;
  const validName = NAME_RE.test(effName);
  const wins = receipts.filter((r) => r.won).length;

  function requireName(): boolean {
    if (validName) return true;
    setError({ key: 'nameFirst', zone: 'name' });
    document.getElementById('yapname')?.focus();
    return false;
  }

  /** The wall: everything is browsable signed out, and the ask lands at the
      moment you actually try to play. Invited guests are exempt (see below). */
  function requireAccount(): boolean {
    if (!needAccount) return true;
    setError({ key: 'signInFirst', zone: 'panel' });
    return false;
  }

  function create() {
    if (busy || !requireAccount() || !requireName()) return;
    setBusy(true);
    socket.emit('lobby:create', { sessionId: session.id, name: effName }, (res) => {
      setBusy(false);
      if (!res.ok) {
        return setError({
          key: ERROR_KEYS[res.error],
          zone: res.error === 'bad_name' ? 'name' : 'panel',
        });
      }
      onEntered(res.update);
    });
  }

  function join() {
    if (busy || !requireName()) return;
    if (code.trim().length !== 6) return setError({ key: 'errCodeLen', zone: 'ticket' });
    setBusy(true);
    socket.emit(
      'lobby:join',
      { code: code.trim().toUpperCase(), sessionId: session.id, name: effName },
      (res) => {
        setBusy(false);
        if (res.ok) return onEntered(res.update);
        setError({
          key: ERROR_KEYS[res.error],
          zone: res.error === 'bad_name' ? 'name' : 'ticket',
        });
        // A dead invite code must never strand a deep-linked visitor.
        setDoorsRevealed(true);
      },
    );
  }

  function joinQueue() {
    if (queueing || !requireAccount() || !requireName()) return;
    socket.emit(
      'queue:join',
      { sessionId: session.id, playerId: playerId(), name: effName },
      (res) => {
        if (!res.ok) {
          return setError({
            key: ERROR_KEYS[res.error ?? 'rate_limited'],
            zone: res.error === 'bad_name' ? 'name' : 'panel',
          });
        }
        setQueueing(true);
      },
    );
  }

  function leaveQueue() {
    socket.emit('queue:leave');
    setQueueing(false);
    setQueueInfo(null);
  }

  function pick(next: Mode) {
    if (queueing && next !== 'ranked') leaveQueue();
    setError(null);
    setMode(next);
  }

  function handleBot() {
    if (!requireAccount() || !requireName()) return;
    onPlayBot(effName);
  }

  function watch() {
    const c = watchCode.trim().toUpperCase();
    if (c.length !== 6) return setError({ key: 'errCodeLen', zone: 'panel' });
    // The click that starts watching is the gesture that unlocks live audio.
    unlockSpectateAudio();
    socket.emit('spectate:join', { code: c }, (res) => {
      if (!res.ok) {
        return setError({
          key: res.error === 'full' ? 'specFull' : 'specNotFound',
          zone: 'panel',
        });
      }
      onSpectate(c);
    });
  }

  const zoneError = (zone: ErrorZone) =>
    error && error.zone === zone ? (
      <p className="error" role="alert">
        {t(error.key)}
      </p>
    ) : null;

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

  const panel = (
    <div className="mode-panel">
      {mode === 'custom' ? (
        <>
          <p className="mode-panel-desc">{t('panelCustomDesc')}</p>
          <button className="btn btn-primary btn-wide" disabled={busy} onClick={create}>
            {t('createLobby')}
          </button>
          {zoneError('panel')}
          {ticket(false)}
        </>
      ) : mode === 'ranked' ? (
        <>
          <p className="mode-panel-desc">{t('panelRankedDesc')}</p>
          {queueing ? (
            <div className="queue-box">
              <span className="queue-pulse" aria-hidden="true" />
              <p className="queue-line">
                {t('queueWaiting', { n: Math.max(0, (queueInfo?.waiting ?? 1) - 1) })}
              </p>
              {queueInfo ? (
                <p className="queue-rating">{t('queueRating', { r: queueInfo.rating })}</p>
              ) : null}
              <button className="btn btn-small" onClick={leaveQueue}>
                {t('queueCancel')}
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-wide" onClick={joinQueue}>
              {t('findOpponent')}
            </button>
          )}
          {zoneError('panel')}
        </>
      ) : mode === 'training' ? (
        <>
          <p className="mode-panel-desc">{t('panelTrainingDesc')}</p>
          <button className="btn btn-primary btn-wide" onClick={handleBot}>
            {t('chooseOpponent')}
          </button>
          {zoneError('panel')}
        </>
      ) : mode === 'tutorial' ? (
        <>
          <p className="mode-panel-desc">{t('panelTutorialDesc')}</p>
          <button
            className="btn btn-primary btn-wide"
            onClick={() => {
              if (requireAccount() && requireName()) onTutorial(effName);
            }}
          >
            {t('startTutorial')}
          </button>
          {zoneError('panel')}
        </>
      ) : (
        <>
          <p className="mode-panel-desc">{t('panelSpectateDesc')}</p>
          <div className="join-row">
            <input
              className="input input-code"
              placeholder={t('codePlaceholder')}
              maxLength={6}
              value={watchCode}
              onChange={(e) => {
                setWatchCode(e.target.value.toUpperCase());
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') watch();
              }}
            />
            <button className="btn" onClick={watch}>
              {t('watchBtn')}
            </button>
          </div>
          {zoneError('panel')}
        </>
      )}
    </div>
  );

  const selector = (
    <>
      {account.google ? (
        <div className="account-row">
          {account.signedIn ? (
            <>
              <span className="account-who">{t('signedInAs', { x: account.name ?? '' })}</span>
              <button className="account-link" onClick={() => void signOut()}>
                {t('signOut')}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-small btn-google" onClick={signIn}>
                {t('signInGoogle')}
              </button>
              <span className="account-why">{t('signInWhy')}</span>
            </>
          )}
        </div>
      ) : null}
      <span className="field-label modes-label">{t('startSomething')}</span>
      <div className="mode-grid" role="tablist">
        {MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={`btn mode-tile ${mode === m ? 'mode-tile-on' : ''}`}
            onClick={() => pick(m)}
          >
            <span className="mode-tile-title">{t(`tile_${m}`)}</span>
            <span className="mode-tile-sub">{t(`tileSub_${m}`)}</span>
          </button>
        ))}
      </div>
      {panel}
    </>
  );

  return (
    <>
      <div className="stage center-col home">
        {notice ? <div className="banner">{t(notice)}</div> : null}
        {authNote && authNote !== 'ok' ? (
          <div className="banner banner-warn">
            {t(authNote === 'cancelled' ? 'authCancelled' : authNote === 'nostore' ? 'authNoStore' : 'authFailed')}
          </div>
        ) : null}
        <p className="kicker">{t('kicker')}</p>
        <h1 className="display logo">
          YAP<span className="logo-accent">STAGE</span>
        </h1>
        <p className="subtitle">{t('homeSubtitle')}</p>

        <div className="card">
          {account.signedIn ? null : (<>
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
          </>)}

          {invited && !doorsRevealed ? (
            // Invite-link arrival: the ticket IS the page. The selector waits
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
            selector
          )}
        </div>

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

          </div>
        ) : null}

        <div className="fine-print">
          <p className="footnote">{t(serverStt ? 'footAny' : 'footChrome')}</p>
          <p className="small-print">{t('smallPrint')}</p>
          <p className="build-stamp">build {__BUILD__}</p>
        </div>
      </div>

      <div className="marquee" aria-hidden="true">
        <span className="marquee-track">
          {t('marquee').repeat(4)}
          {t('marquee').repeat(4)}
        </span>
      </div>
    </>
  );
}
