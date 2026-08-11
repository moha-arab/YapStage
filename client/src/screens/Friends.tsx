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
  pending: boolean;
  incoming: boolean;
  online: boolean;
}

interface Props {
  onBack: () => void;
  /** Open a room and hand back its code, so we can push it to a friend. */
  onChallenge: (username: string) => void;
}

export default function Friends({ onBack, onChallenge }: Props) {
  const { t } = useI18n();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [add, setAdd] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    void fetch('/friends')
      .then((r) => (r.ok ? r.json() : { friends: [] }))
      .then((d: { friends?: Friend[] }) => setFriends(d.friends ?? []))
      .catch(() => setFriends([]));
  }
  useEffect(load, []);

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

  function act(action: 'add' | 'accept' | 'remove', username: string) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    void fetch('/friends', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, username }),
    })
      .then((r) => (r.ok ? r.json() : { result: 'down' }))
      .then((d: { result?: string }) => {
        setBusy(false);
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
                      : t('friendDown'),
          );
          if (d.result === 'ok' || d.result === 'accepted') setAdd('');
        }
        load();
      })
      .catch(() => {
        setBusy(false);
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
                <button className="btn btn-small btn-primary" onClick={() => act('accept', f.username)}>
                  {t('friendAccept')}
                </button>
                <button className="btn btn-small ghost" onClick={() => act('remove', f.username)}>
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
                <span className="friend-elo elo">{f.rating}</span>
                <button
                  className="btn btn-small btn-primary"
                  disabled={!f.online}
                  title={f.online ? '' : t('friendOffline')}
                  onClick={() => onChallenge(f.username)}
                >
                  {t('friendChallenge')}
                </button>
                <button className="btn btn-small ghost" onClick={() => act('remove', f.username)}>
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
                <button className="btn btn-small ghost" onClick={() => act('remove', f.username)}>
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
