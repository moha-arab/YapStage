// Your friends list, chess.com-shaped: who is here right now, one button to
// call them out, and a place for the requests you have not answered yet.
//
// The rule this screen follows: an online friend is one tap from a debate.
// Everything else (adding, accepting, removing) is secondary and looks it.
import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { useI18n } from '../i18n';

export interface Friend {
  username: string;
  rating: number;
  /** False until they finish placements: their rating is not a fact yet. */
  placed: boolean;
  pending: boolean;
  incoming: boolean;
  online: boolean;
}

interface Props {
  onBack: () => void;
  /** Open a room and invite them. Resolves to an i18n key when something went
      wrong, or null on success, so the friends screen can SAY what happened. */
  onChallenge: (username: string) => Promise<string | null>;
}

export default function Friends({ onBack, onChallenge }: Props) {
  const { t } = useI18n();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [add, setAdd] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which row is mid-request, so a click has visible feedback. */
  const [pending, setPending] = useState<string | null>(null);

  const [signedOut, setSignedOut] = useState(false);
  /** The list could not be fetched. Different from having no friends. */
  const [down, setDown] = useState(false);

  function load() {
    void fetch('/friends')
      .then(async (r) => {
        // A 401 is not an empty friends list. Rendering "nobody here yet" to a
        // signed-out visitor is how you get told the feature is broken.
        if (r.status === 401) {
          setSignedOut(true);
          return { friends: [] };
        }
        setSignedOut(false);
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as { friends?: Friend[] };
      })
      .then((d: { friends?: Friend[] }) => {
        setDown(false);
        setFriends(d.friends ?? []);
      })
      .catch(() => {
        // Keep whatever list we already had rather than blanking it.
        setDown(true);
        setFriends((cur) => cur ?? []);
      });
  }
  useEffect(load, []);

  // The list is live: the server pokes every tab of whoever you added, and the
  // poke is what turns "I sent a request and nothing happened" into a request
  // appearing on their screen while they are looking at it.
  useEffect(() => {
    socket.on('friend:changed', load);
    return () => {
      socket.off('friend:changed', load);
    };
  }, []);

  // Presence is a live thing, so it is asked over the socket rather than baked
  // into the page at load. Every 20s is often enough to feel true and rare
  // enough to be free.
  useEffect(() => {
    const tick = () =>
      socket.emit('friend:presence', {}, (res) => {
        if (!res?.ok) return;
        const on = new Set(res.online);
        setFriends((cur) => cur?.map((f) => ({ ...f, online: on.has(f.username) })) ?? cur);
      });
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, []);

  /** Every action reports, not just 'add'. A failed accept that says nothing is
      indistinguishable from a button that does not work. */
  function act(action: 'add' | 'accept' | 'remove', username: string) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    setPending(username);
    void fetch('/friends', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, username }),
    })
      .then((r) => (r.ok ? r.json() : { result: r.status === 429 ? 'rate_limited' : 'down' }))
      .then((d: { result?: string }) => {
        setBusy(false);
        setPending(null);
        const ok = d.result === 'ok' || d.result === 'accepted';
        if (action === 'add') {
          setNote(
            d.result === 'ok'
              ? t('friendSent', { x: username })
              : d.result === 'accepted'
                ? t('friendNowFriends', { x: username })
                : d.result === 'no_user'
                  ? t('friendNoUser')
                  : d.result === 'self'
                    ? t('friendSelf')
                    : d.result === 'already'
                      ? t('friendAlready')
                      : d.result === 'rate_limited'
                        ? t('errRateLimited')
                        : t('friendDown'),
          );
          if (ok) setAdd('');
        } else if (!ok) {
          // 'nothing' means the row moved under us: they cancelled, or another
          // tab already handled it. Reloading the list is the honest answer.
          setNote(d.result === 'nothing' ? t('friendMoved') : t('friendDown'));
        }
        load();
      })
      .catch(() => {
        setBusy(false);
        setPending(null);
        setNote(t('friendDown'));
      });
  }

  /** Open a room for a friend, and report what happened to the invite. */
  function challenge(username: string) {
    if (busy) return;
    setBusy(true);
    setPending(username);
    setNote(null);
    void onChallenge(username)
      .then((problem) => {
        setBusy(false);
        setPending(null);
        if (problem) setNote(t(problem, { x: username }));
      })
      .catch(() => {
        setBusy(false);
        setPending(null);
        setNote(t('friendDown'));
      });
  }

  const accepted = (friends ?? []).filter((f) => !f.pending);
  const incoming = (friends ?? []).filter((f) => f.pending && f.incoming);
  const outgoing = (friends ?? []).filter((f) => f.pending && !f.incoming);
  const online = accepted.filter((f) => f.online).length;

  return (
    <div className="stage friends">
      <header className="topbar">
        <button className="btn btn-small" onClick={onBack}>
          {t('back')}
        </button>
        <span className="brand">
          YAP<span className="logo-accent">STAGE</span>
        </span>
        <span className="pill">{t('friendsPill')}</span>
      </header>

      <h1 className="display page-title">{t('friendsTitle')}</h1>
      {accepted.length > 0 ? (
        <p className="page-sub">{t('friendsOnline', { n: online, total: accepted.length })}</p>
      ) : null}

      {signedOut ? (
        <p className="error" role="alert">
          {t('friendsSignedOut')}
        </p>
      ) : down ? (
        <p className="error" role="alert">
          {t('friendDown')}
        </p>
      ) : null}

      <div className="card friends-add">
        <label className="field-label" htmlFor="friend-name">
          {t('friendAddLabel')}
        </label>
        <div className="join-row">
          <input
            id="friend-name"
            className="input"
            placeholder={t('friendAddPlaceholder')}
            maxLength={16}
            value={add}
            onChange={(e) => setAdd(e.target.value.replace(/\s/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && add) act('add', add);
            }}
          />
          <button className="btn" disabled={!add || busy} onClick={() => act('add', add)}>
            {t('friendAddBtn')}
          </button>
        </div>
        {note ? <p className="field-hint">{note}</p> : null}
      </div>

      {incoming.length > 0 ? (
        <section className="friend-block">
          <h2 className="feed-head">{t('friendRequests')}</h2>
          <ul className="friend-list">
            {incoming.map((f) => (
              <li key={f.username}>
                <span className="friend-name">{f.username}</span>
                <button
                  className="btn btn-small btn-primary"
                  disabled={busy}
                  onClick={() => act('accept', f.username)}
                >
                  {pending === f.username ? t('loading') : t('friendAccept')}
                </button>
                <button className="btn btn-small ghost" disabled={busy} onClick={() => act('remove', f.username)}>
                  {t('friendDecline')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="friend-block">
        <h2 className="feed-head">{t('friendsYours')}</h2>
        {friends === null ? (
          <p className="feed-empty">{t('loading')}</p>
        ) : accepted.length === 0 ? (
          // First-run empty state: say what goes here and how to make it appear.
          <div className="empty-state">
            <p className="empty-head">{t('friendsEmptyHead')}</p>
            <p className="empty-body">{t('friendsEmptyBody')}</p>
          </div>
        ) : (
          <ul className="friend-list">
            {accepted.map((f) => (
              <li key={f.username}>
                <span className={`dot ${f.online ? 'dot-on' : ''}`} aria-hidden="true" />
                <span className="friend-name">{f.username}</span>
                <span className="friend-elo elo">{f.placed ? f.rating : t('unrated')}</span>
                {/* Calling out an offline friend still opens the room and still
                    gives you a code to send them. Disabling the button just
                    left you with no way to invite anyone who was not already
                    staring at the app. */}
                <button
                  className="btn btn-small btn-primary"
                  disabled={busy}
                  onClick={() => challenge(f.username)}
                >
                  {pending === f.username ? t('loading') : f.online ? t('friendChallenge') : t('friendChallengeOffline')}
                </button>
                <button className="btn btn-small ghost" disabled={busy} onClick={() => act('remove', f.username)}>
                  {t('friendRemove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 ? (
        <section className="friend-block">
          <h2 className="feed-head">{t('friendSentHead')}</h2>
          <ul className="friend-list">
            {outgoing.map((f) => (
              <li key={f.username}>
                <span className="friend-name friend-muted">{f.username}</span>
                <span className="friend-wait">{t('friendWaiting')}</span>
                <button className="btn btn-small ghost" disabled={busy} onClick={() => act('remove', f.username)}>
                  {t('friendCancel')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
