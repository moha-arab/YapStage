// Home. Rebuilt 2026-08-11 after his review ("look at chess.com and look at
// ours"). The rules this screen now follows:
//   1. ONE top bar: brand left, who-you-are right. The account never floats
//      loose in the middle of the card again.
//   2. The tutorial is not a mode. It is level one of the bot ladder, so it
//      lives inside training where a beginner is already looking.
//   3. Everything below the fold is either an action or gone. No marquee, no
//      "sanctioned by the athletic commission", no browser-support boasting.
//   4. Your record is a real screen you can open, filter, and read — not a
//      collapsed box wedged under the fold.
import { useEffect, useState } from 'react';
import { NAME_RE, tierFor, type JoinError, type LobbyUpdate } from '../../../server/src/protocol';
import { session, socket } from '../socket';
import { playerId, signIn, signOut, whoAmI, type Account } from '../player';
import { unlockSpectateAudio } from '../specaudio';
import { useI18n } from '../i18n';
import HomeFeed from '../HomeFeed';

const ERROR_KEYS: Record<JoinError, string> = {
  not_found: 'errNotFound',
  full: 'errFull',
  in_progress: 'errInProgress',
  bad_name: 'errBadName',
  rate_limited: 'errRateLimited',
  locked: 'errLocked',
  self: 'errSelf',
};

type ErrorZone = 'name' | 'panel' | 'ticket';

type Mode = 'custom' | 'ranked' | 'training' | 'drill' | 'spectate';
// Five doors. The drill earned its place: it is the only one you can walk
// through alone, in forty seconds, with nobody waiting on you.
const MODES: Mode[] = ['ranked', 'custom', 'training', 'drill', 'spectate'];

interface Props {
  notice: string | null;
  onEntered: (u: LobbyUpdate) => void;
  onPlayBot: (name: string) => void;
  onSpectate: (code: string, feed: boolean) => void;
  onMatches: () => void;
  onLocker: () => void;
  onFriends: () => void;
  onDrill: () => void;
}

export default function Home({ notice, onEntered, onPlayBot, onSpectate, onMatches, onLocker, onFriends, onDrill }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('ranked');
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '',
  );
  const [watchCode, setWatchCode] = useState('');
  const [invited] = useState(
    () => new URLSearchParams(window.location.search).get('code') !== null,
  );
  const [doorsRevealed, setDoorsRevealed] = useState(false);
  const [error, setError] = useState<{ key: string; zone: ErrorZone } | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ waiting: number; rating: number } | null>(null);

  const [account, setAccount] = useState<Account>({ signedIn: false, google: false });
  useEffect(() => {
    void whoAmI().then(setAccount);
  }, []);
  const needAccount = account.google && !account.signedIn;

  // Your rating, so the bot ladder's numbers mean something the moment you see
  // them. Hidden until you have placed: a rating still swinging 64 points a
  // match is a guess, and showing a guess as a fact is how ladders lose trust.
  const [rank, setRank] = useState<{
    rating: number;
    provisional: boolean;
    placementsLeft: number;
    games: number;
  } | null>(null);
  useEffect(() => {
    void fetch(`/rating?playerId=${encodeURIComponent(playerId())}`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.rating === 'number') setRank(d);
      })
      .catch(() => {});
  }, [account.signedIn]);

  // Friend requests waiting on you, refreshed when the server says the list
  // changed. Without this the only way to discover a request is to go looking
  // for one.
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (!account.signedIn) return;
    const count = () =>
      void fetch('/friends')
        .then((r) => (r.ok ? r.json() : { friends: [] }))
        .then((d: { friends?: { pending: boolean; incoming: boolean }[] }) =>
          setWaiting((d.friends ?? []).filter((f) => f.pending && f.incoming).length),
        )
        .catch(() => {});
    count();
    socket.on('friend:changed', count);
    return () => {
      socket.off('friend:changed', count);
    };
  }, [account.signedIn]);

  const [authNote] = useState(() => new URLSearchParams(window.location.search).get('auth'));
  useEffect(() => {
    if (!authNote) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('auth');
    window.history.replaceState({}, '', url.toString());
  }, [authNote]);

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

  // Signed in: your yap name IS your account, so there is nothing to type.
  const effName = account.signedIn && account.name ? account.name : name;
  const validName = NAME_RE.test(effName);

  function requireName(): boolean {
    if (validName) return true;
    setError({ key: 'nameFirst', zone: 'name' });
    document.getElementById('yapname')?.focus();
    return false;
  }

  /** RANKED ONLY. Everything else is playable signed out, deliberately: a
      wall before anyone has felt the product costs the try, and a bot debate
      that ends in a real verdict is the best account pitch we have. Ranked is
      the one mode where identity is load-bearing — rating, opponents, cheat
      enforcement, bans — so it is the one wall that defends something. */
  function requireAccount(): boolean {
    if (!needAccount) return true;
    setError({ key: 'signInRanked', zone: 'panel' });
    return false;
  }

  function create() {
    if (busy || !requireName()) return;
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

  // Deliberately NOT account-gated: someone who was called out by a friend
  // plays in thirty seconds. That moment is the app's best one.
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
        setDoorsRevealed(true);
      },
    );
  }

  function joinQueue() {
    if (queueing || !requireAccount() || !requireName()) return;
    socket.emit('queue:join', { sessionId: session.id, playerId: playerId(), name: effName }, (res) => {
      if (!res.ok) {
        return setError({
          key: ERROR_KEYS[res.error ?? 'rate_limited'],
          zone: res.error === 'bad_name' ? 'name' : 'panel',
        });
      }
      setQueueing(true);
    });
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
    if (!requireName()) return;
    onPlayBot(effName);
  }

  const [feedBusy, setFeedBusy] = useState(false);

  /** Watch a random LIVE ranked debate. Ranked is public by consent, so this
      needs no code — which is the whole point: a code was only ever the key to
      a friend's room, never a way into the sport. */
  function watchRanked() {
    if (feedBusy) return;
    setFeedBusy(true);
    setError(null);
    unlockSpectateAudio();
    void fetch('/spectate/random')
      .then((r) => r.json())
      .then((d: { code: string | null }) => {
        if (!d.code) {
          setFeedBusy(false);
          return setError({ key: 'feedEmpty', zone: 'panel' });
        }
        socket.emit('spectate:join', { code: d.code }, (res) => {
          setFeedBusy(false);
          if (!res.ok) return setError({ key: 'feedEmpty', zone: 'panel' });
          onSpectate(d.code!, true);
        });
      })
      .catch(() => {
        setFeedBusy(false);
        setError({ key: 'feedEmpty', zone: 'panel' });
      });
  }

  function watch() {
    const c = watchCode.trim().toUpperCase();
    if (c.length !== 6) return setError({ key: 'errCodeLen', zone: 'panel' });
    unlockSpectateAudio();
    socket.emit('spectate:join', { code: c }, (res) => {
      if (!res.ok) {
        return setError({ key: res.error === 'full' ? 'specFull' : 'specNotFound', zone: 'panel' });
      }
      onSpectate(c, false);
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
      {mode === 'ranked' ? (
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
              {/* Loud, not a footnote: waiting must never feel like being stuck. */}
              <button className="btn btn-wide" onClick={leaveQueue}>
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
      ) : mode === 'custom' ? (
        <>
          <p className="mode-panel-desc">{t('panelCustomDesc')}</p>
          <button className="btn btn-primary btn-wide" disabled={busy} onClick={create}>
            {t('createLobby')}
          </button>
          {zoneError('panel')}
          {ticket(false)}
        </>
      ) : mode === 'drill' ? (
        <>
          <p className="mode-panel-desc">{t('panelDrillDesc')}</p>
          <button className="btn btn-primary btn-wide" onClick={onDrill}>
            {t('drillGo')}
          </button>
        </>
      ) : mode === 'training' ? (
        <>
          <p className="mode-panel-desc">{t('panelTrainingDesc')}</p>
          <button className="btn btn-primary btn-wide" onClick={handleBot}>
            {t('chooseOpponent')}
          </button>
          {zoneError('panel')}
        </>
      ) : (
        <>
          <p className="mode-panel-desc">{t('panelSpectateDesc')}</p>
          <button className="btn btn-primary btn-wide" disabled={feedBusy} onClick={watchRanked}>
            {feedBusy ? t('loading') : t('watchRanked')}
          </button>
          <p className="mode-panel-desc spec-or">{t('watchByCode')}</p>
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

  return (
    <div className="stage home">
      {/* One bar, like every app he compared us to. */}
      {/* No brand here: the hero logo is right below it, and two wordmarks
          stacked read as a bug. The bar exists for identity + record only. */}
      <header className="topbar home-bar">
        <span />
        <div className="bar-right">
          {account.signedIn ? (
            <>
              {rank ? (
                <span className="rating-chip" title={t('yourRating')}>
                  {rank.provisional ? (
                    t('placingChip', { n: rank.games ?? 0 })
                  ) : (
                    <>
                      {/* Tier first: a number is a rank among twenty strangers,
                          a tier is a claim you can go test against a bot. */}
                      <span className="rating-chip-label">{t(`tier_${tierFor(rank.rating).key}`)}</span>
                      <span className="elo">{rank.rating}</span>
                    </>
                  )}
                </span>
              ) : null}
              <button className="btn btn-small ghost" onClick={onFriends}>
                {t('friendsPillHome')}
                {/* A request nobody can see is a request that did not arrive. */}
                {waiting > 0 ? <span className="badge">{waiting}</span> : null}
              </button>
              <button className="btn btn-small ghost" onClick={onLocker}>
                {t('lockerPill')}
              </button>
              <button className="btn btn-small ghost" onClick={onMatches}>
                {t('myMatches')}
              </button>
              <span className="account-chip">{account.name}</span>
              <button className="account-link" onClick={() => void signOut()}>
                {t('signOut')}
              </button>
            </>
          ) : account.google ? (
            <button className="btn btn-small btn-google" onClick={signIn}>
              {t('signInGoogle')}
            </button>
          ) : null}
        </div>
      </header>

      {notice ? <div className="banner">{t(notice)}</div> : null}
      {authNote && authNote !== 'ok' ? (
        <div className="banner banner-warn">
          {t(
            authNote === 'cancelled'
              ? 'authCancelled'
              : authNote === 'nostore'
                ? 'authNoStore'
                : 'authFailed',
          )}
        </div>
      ) : null}

      <div className="home-hero">
        <h1 className="display logo">
          YAP<span className="logo-accent">STAGE</span>
        </h1>
        <p className="subtitle">{t('homeSubtitle')}</p>
      </div>

      <div className="card home-card">
        {/* Guests still need a name; signed-in players already have one. */}
        {account.signedIn ? null : (
          <>
            <label className="field-label" htmlFor="yapname">
              {t('yourYapName')}
            </label>
            <input
              id="yapname"
              className="input"
              placeholder={t('namePlaceholder')}
              maxLength={16}
              value={name}
              onChange={(e) => {
                setName(e.target.value.replace(/\s/g, ''));
                setError(null);
              }}
              autoFocus
            />
            {name && !validName ? <p className="field-hint">{t('errBadName')}</p> : null}
            {zoneError('name')}
          </>
        )}

        {invited && !doorsRevealed ? (
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
        )}
      </div>

      <HomeFeed />

      {/* The one place the rule belongs. It was small print on the bot picker,
          where it read as an apology; here it is the house telling you how the
          game is played, once, before you play it. */}
      <p className="house-rules">{t('houseRules')}</p>

      <p className="build-stamp">build {__BUILD__}</p>
    </div>
  );
}
