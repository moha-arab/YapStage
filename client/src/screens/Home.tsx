// THE LOBBY. Rebuilt 2026-08-21 after "a lot of people have been telling me
// the site looks really bad, it's so obviously AI".
//
// What changed and why, so nobody re-adds it:
//
//   1. ONE navigation. The old screen had a row of mode tiles AND a panel that
//      changed under them AND a top bar of links, and his review of it was "I
//      don't really understand what's going on". Now: five verbs in a dock
//      along the bottom, and the stage above shows what you picked.
//   2. A mode is explained ONCE — in the caption above the dock. It used to be
//      described on the tile and then again in the panel after you tapped it,
//      which he called redundant, correctly.
//   3. NOTHING IS PRE-PICKED. Landing on "play a bot" with Pip already
//      highlighted reads as the app choosing for you. You pick, then the bot
//      walks on stage, then the button says its name.
//   4. Friends live in the wings, beside the empty opponent slot, because the
//      empty slot is exactly where a friend goes. Calling one out fills it.
//   5. The house rule at the bottom names the actual cheat (reading off a
//      chatbot) and the actual consequence, rather than saying "cheating is
//      not tolerated", which is a sign nobody reads.
//
// The bot picker used to be a whole separate screen (BotSelect). It still
// exists for the tutorial hand-off, but the normal path is right here with
// sane defaults: random topic, standard pace, the coin picks your side.
import { useCallback, useEffect, useRef, useState } from 'react';
import { NAME_RE, tierFor, type JoinError, type LobbyUpdate } from '../../../server/src/protocol';
import type { BotStartConfig } from './BotSelect';
import { session, socket } from '../socket';
import { playerId, signIn, signOut, type Account } from '../player';
import { unlockSpectateAudio } from '../specaudio';
import { unlockBotVoice } from '../botvoice';
import { initAudio } from '../sound';
import { useI18n } from '../i18n';
import Mask from '../Mask';
import BotAvatar from '../BotAvatar';
import TierBadge from '../TierBadge';

const ERROR_KEYS: Record<JoinError, string> = {
  not_found: 'errNotFound',
  full: 'errFull',
  in_progress: 'errInProgress',
  bad_name: 'errBadName',
  rate_limited: 'errRateLimited',
  locked: 'errLocked',
  self: 'errSelf',
};

type Mode = 'ranked' | 'friend' | 'bot' | 'drill' | 'watch';
const MODES: Mode[] = ['ranked', 'friend', 'bot', 'drill', 'watch'];

interface Bot {
  id: string;
  name: string;
  color: string;
  elo: number;
  rank: number;
  tagline: string;
  blurb: string;
}

interface Friend {
  username: string;
  rating: number;
  placed: boolean;
  pending: boolean;
  incoming: boolean;
  online: boolean;
  mask: string | null;
}

interface Props {
  /** App's boot /auth/me answer, passed down so the lobby never re-fetches it.
      The old screen ran its own whoAmI and rendered the guest state (name box,
      "sign in to play your friends") for the frames it took to resolve — a
      signed-in user watched themselves get logged out and back in on every
      visit. */
  account: Account;
  notice: string | null;
  onEntered: (u: LobbyUpdate) => void;
  onSpectate: (code: string, feed: boolean) => void;
  onMatches: () => void;
  onLocker: () => void;
  onFriends: () => void;
  onDrill: () => void;
  onBotStart: (name: string, config: BotStartConfig) => void;
  onTutorial: (name: string) => void;
  onChallenge: (username: string) => Promise<string | null>;
}

/** The light each fighter stands in. It belongs to the fighter, not to the
    stage: one shared drawing behind both of them drifts off-centre the moment
    one side is a mask and the other is a row of six bots. */
function Cone({ color, id }: { color: string; id: string }) {
  return (
    <svg className="lb-cone" viewBox="0 0 300 560" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.55" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points="100,-20 200,-20 300,560 0,560" fill={`url(#${id})`} />
    </svg>
  );
}

export default function Home({
  account,
  notice,
  onEntered,
  onSpectate,
  onMatches,
  onLocker,
  onFriends,
  onDrill,
  onBotStart,
  onTutorial,
  onChallenge,
}: Props) {
  const { t } = useI18n();

  const [mode, setMode] = useState<Mode>('ranked');
  const [pickedBot, setPickedBot] = useState<string | null>(null);
  const [pickedFriend, setPickedFriend] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  // The invite code arrives one of two ways: in the URL, or stashed in
  // sessionStorage by signIn() because the Google round trip strips the URL.
  // Read once, then clear the stash so a code cannot haunt a later visit.
  const [arrival] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('code');
    let stashed: string | null = null;
    try {
      stashed = sessionStorage.getItem('yapstage.pendingCode');
      if (stashed) sessionStorage.removeItem('yapstage.pendingCode');
    } catch {
      // storage blocked: the URL path still works
    }
    const c = (fromUrl ?? stashed ?? '').toUpperCase();
    return { code: c, invited: c !== '' };
  });
  const [code, setCode] = useState(arrival.code);
  const [invited, setInvited] = useState(arrival.invited);

  const [queueing, setQueueing] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ waiting: number; rating: number } | null>(null);

  const needAccount = account.google && !account.signedIn;

  /* ---- everything the stage needs to know ---- */

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

  const [bots, setBots] = useState<Bot[]>([]);
  useEffect(() => {
    void fetch('/bots')
      .then((r) => r.json())
      .then((d: { bots?: Bot[] }) => setBots(d.bots ?? []))
      .catch(() => {});
  }, []);

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [friendsDown, setFriendsDown] = useState(false);
  const loadFriends = useCallback(() => {
    if (!account.signedIn) return;
    void fetch('/friends')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { friends?: Friend[] }) => {
        setFriends(d.friends ?? []);
        setFriendsDown(false);
      })
      .catch(() => setFriendsDown(true));
  }, [account.signedIn]);

  useEffect(() => {
    loadFriends();
    socket.on('friend:changed', loadFriends);
    return () => {
      socket.off('friend:changed', loadFriends);
    };
  }, [loadFriends]);

  // Presence, refreshed on a timer. The server's own comment puts a legitimate
  // client at every 20 seconds and rate limits the event at 20 per minute, so
  // this is deliberately slower than it could be.
  useEffect(() => {
    if (!account.signedIn) return;
    const tick = () => {
      socket.emit('friend:presence', {}, (res: { ok: boolean; online: string[] }) => {
        if (!res?.ok) return;
        const on = new Set(res.online);
        setFriends((prev) =>
          prev ? prev.map((f) => ({ ...f, online: on.has(f.username) })) : prev,
        );
      });
    };
    const timer = setInterval(tick, 20000);
    return () => clearInterval(timer);
  }, [account.signedIn]);

  const [drill, setDrill] = useState<{ skill: string; streak: number; doneToday: boolean } | null>(
    null,
  );
  useEffect(() => {
    void fetch('/drill')
      .then((r) => r.json())
      .then((d) => {
        if (d?.drill) setDrill({ skill: d.skill, streak: d.streak ?? 0, doneToday: !!d.doneToday });
      })
      .catch(() => {});
  }, [account.signedIn]);

  // How many ranked debates are on right now, plus one to put on the stage.
  // Cheap (an in-memory Map on the server), so it can poll while the lobby is
  // open without a rate limit in sight.
  const [live, setLive] = useState<{
    live: number;
    watchable: number;
    featured: {
      code: string;
      names: Record<string, string>;
      avatars: Record<string, string | undefined>;
      phase: string | null;
      watchers: number;
    } | null;
  }>({ live: 0, watchable: 0, featured: null });
  useEffect(() => {
    const poll = () =>
      void fetch('/live')
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.live === 'number') setLive(d);
        })
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 30000);
    return () => clearInterval(timer);
  }, []);

  /* ---- the ranked queue ---- */

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

  const [authNote] = useState(() => new URLSearchParams(window.location.search).get('auth'));
  useEffect(() => {
    if (!authNote) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('auth');
    window.history.replaceState({}, '', url.toString());
  }, [authNote]);

  /* ---- identity ---- */

  const effName = account.signedIn && account.name ? account.name : name;
  const validName = NAME_RE.test(effName);
  const myMask = account.mask ?? 'luchador';

  function requireName(): boolean {
    if (validName) return true;
    setError('nameFirst');
    document.getElementById('yapname')?.focus();
    return false;
  }

  /** RANKED ONLY. Everything else is playable signed out, deliberately: a wall
      before anyone has felt the product costs the try, and a bot debate that
      ends in a real verdict is the best account pitch we have. */
  function requireAccount(): boolean {
    if (!needAccount) return true;
    setError('signInRanked');
    return false;
  }

  /* ---- the five things the go button can do ---- */

  function joinQueue() {
    if (queueing || !requireAccount() || !requireName()) return;
    setError(null);
    socket.emit(
      'queue:join',
      { sessionId: session.id, playerId: playerId(), name: effName },
      (res) => {
        if (!res.ok) return setError(ERROR_KEYS[res.error ?? 'rate_limited']);
        setQueueing(true);
      },
    );
  }

  function leaveQueue() {
    socket.emit('queue:leave');
    setQueueing(false);
    setQueueInfo(null);
  }

  function callOut(username: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    void onChallenge(username).then((err) => {
      setBusy(false);
      if (err) setError(err);
    });
  }

  function startBot() {
    if (!pickedBot || !requireName()) return;
    // Both of these must happen INSIDE this tap, and losing them is exactly
    // how the redesign brought the robot voice back: initAudio unlocks the
    // AudioContext and speech synthesis, unlockBotVoice unlocks the one
    // long-lived <audio> element that plays the bot's REAL voice — browsers
    // grant playback to an element a user has touched, so an element that was
    // never played inside a gesture rejects play() when the mp3 arrives and
    // the client silently falls back to the browser's robotic speech.
    initAudio();
    unlockBotVoice();
    if (pickedBot === 'tutor') return onTutorial(effName);
    // Sane defaults, so picking a bot is one tap instead of a settings page.
    // Everything here is still adjustable inside the room.
    onBotStart(effName, {
      botId: pickedBot,
      topicMode: 'random',
      side: 'random',
      pace: 'standard',
    });
  }

  /** Open a room and get a code to send by hand. This is the path for someone
      with no friends on the app yet, and it is the ONLY path signed out — a
      lobby that can only be reached through a friends list nobody has built
      yet is a lobby with no door. */
  function openRoom() {
    if (busy || !requireName()) return;
    setBusy(true);
    setError(null);
    socket.emit('lobby:create', { sessionId: session.id, name: effName }, (res) => {
      setBusy(false);
      if (!res.ok) return setError(ERROR_KEYS[res.error]);
      onEntered(res.update);
    });
  }

  function join() {
    if (busy || !requireName()) return;
    if (code.trim().length !== 6) return setError('errCodeLen');
    setBusy(true);
    socket.emit(
      'lobby:join',
      { code: code.trim().toUpperCase(), sessionId: session.id, name: effName },
      (res) => {
        setBusy(false);
        if (res.ok) return onEntered(res.update);
        setError(ERROR_KEYS[res.error]);
      },
    );
  }

  const [watching, setWatching] = useState(false);
  /** Watch a random LIVE ranked debate. Ranked is public by consent, so this
      needs no code — which is the point: a code was only ever the key to a
      friend's room, never a way into the sport. */
  function watchRanked() {
    if (watching) return;
    setWatching(true);
    setError(null);
    unlockSpectateAudio();
    void fetch('/spectate/random')
      .then((r) => r.json())
      .then((d: { code: string | null }) => {
        if (!d.code) {
          setWatching(false);
          return setError('feedEmpty');
        }
        socket.emit('spectate:join', { code: d.code }, (res) => {
          setWatching(false);
          if (!res.ok) return setError('feedEmpty');
          onSpectate(d.code!, true);
        });
      })
      .catch(() => {
        setWatching(false);
        setError('feedEmpty');
      });
  }

  /* ---- picking a mode ---- */

  function pick(next: Mode) {
    if (queueing && next !== 'ranked') leaveQueue();
    setError(null);
    setMode(next);
    setPickedBot(null);
    setPickedFriend(null);
  }

  // On a phone the dock and the picker row both scroll sideways, so whatever
  // is selected has to be dragged into view or the tap looks like it missed.
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dockRef.current
      ?.querySelector('.lb-act-on')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [mode]);
  useEffect(() => {
    document
      .querySelector('.lb-choice-on')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [pickedBot, pickedFriend]);

  /* ---- what stands on the turquoise side ---- */

  const online = (friends ?? []).filter((f) => !f.pending && f.online);
  const accepted = (friends ?? []).filter((f) => !f.pending);
  const requests = (friends ?? []).filter((f) => f.pending && f.incoming).length;
  const ladder = bots.filter((b) => b.id !== 'tutor').sort((a, b) => a.rank - b.rank);
  const chosenBot = ladder.find((b) => b.id === pickedBot) ?? null;
  const chosenFriend = accepted.find((f) => f.username === pickedFriend) ?? null;
  const watchingFeatured = mode === 'watch' ? live.featured : null;
  // The picker rows eat vertical space, so both fighters shrink together. Two
  // different-sized faces facing each other reads as a bug, not a hierarchy.
  const compact = mode === 'friend' || mode === 'bot';

  let opponent;
  if (mode === 'ranked') {
    opponent = (
      <>
        <div className={`lb-empty ${queueing ? 'lb-searching' : ''}`}>
          <span className="lb-empty-q">?</span>
        </div>
        <div className="lb-soft">
          {queueing ? t('lbSearching') : t('lbYourOpponent')}
          {queueing && queueInfo ? (
            <div className="lb-queue-n">
              {t('queueWaiting', { n: Math.max(0, queueInfo.waiting - 1) })}
            </div>
          ) : null}
        </div>
        <div className="lb-side">{t('sideAgainst')}</div>
      </>
    );
  } else if (mode === 'friend') {
    opponent = (
      <>
        {chosenFriend ? (
          <>
            <div className="lb-art">
              <Mask id={chosenFriend.mask ?? 'oni'} size="var(--art)" bare />
            </div>
            <div className="lb-fname">
              {chosenFriend.username}
              {chosenFriend.placed ? (
                <span className="lb-frating">{chosenFriend.rating}</span>
              ) : null}
            </div>
          </>
        ) : (
          <div className="lb-empty">
            {/* "pick a friend" is a lie when there is nobody to pick. With an
                empty list the corner asks for the other thing instead. */}
            <span
              className="lb-empty-pick"
              dangerouslySetInnerHTML={{
                __html: online.length > 0 ? t('lbPickFriend') : t('lbSendCode'),
              }}
            />
          </div>
        )}
        {online.length > 0 ? (
          <div className="lb-choices">
            {online.map((f) => (
              <button
                key={f.username}
                className={`lb-choice ${pickedFriend === f.username ? 'lb-choice-on' : ''}`}
                onClick={() => setPickedFriend(f.username)}
              >
                <span className="lb-choice-av">
                  <Mask id={f.mask ?? 'oni'} size={38} bare />
                  <i className="lb-dot" />
                </span>
                <span className="lb-choice-n">{f.username}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="lb-none">
            {account.signedIn ? t('lbNobodyOnline') : t('lbRoomForGuests')}{' '}
            {account.signedIn ? <button onClick={onFriends}>{t('lbAddFriends')}</button> : null}
          </p>
        )}
        {/* Somebody sent you six letters: this is where they go. Always
            available in this mode, not only when you arrived on a link. */}
        <div className="lb-ticket-row lb-codebox">
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
          <button className="btn btn-small" disabled={busy || code.trim().length !== 6} onClick={join}>
            {t('walkIn')}
          </button>
        </div>
        <div className="lb-side">{t('sideAgainst')}</div>
      </>
    );
  } else if (mode === 'bot') {
    opponent = (
      <>
        {chosenBot ? (
          <>
            <div className="lb-art">
              <BotAvatar botId={chosenBot.id} color={chosenBot.color} size="var(--art)" bare />
            </div>
            <div className="lb-fname">
              {chosenBot.name}
              <span className="lb-frating">{chosenBot.elo}</span>
            </div>
          </>
        ) : pickedBot === 'tutor' ? (
          <>
            <div className="lb-art">
              <BotAvatar botId="tutor" color="ink" size="var(--art)" bare />
            </div>
            <div className="lb-fname">{t('lbYapMaster')}</div>
          </>
        ) : (
          <div className="lb-empty">
            <span className="lb-empty-pick" dangerouslySetInnerHTML={{ __html: t('lbPickBot') }} />
          </div>
        )}
        <div className="lb-choices">
          {/* The tutorial is not a mode, it is rung zero of this ladder — which
              is where a beginner is already looking. */}
          <button
            className={`lb-choice lb-choice-tutor ${pickedBot === 'tutor' ? 'lb-choice-on' : ''}`}
            onClick={() => setPickedBot('tutor')}
          >
            <span className="lb-choice-av">
              <BotAvatar botId="tutor" color="ink" size={38} bare />
            </span>
            <span className="lb-choice-n">{t('lbLearn')}</span>
            <span className="lb-choice-r">{t('lbFree')}</span>
          </button>
          {ladder.map((b) => (
            <button
              key={b.id}
              className={`lb-choice ${pickedBot === b.id ? 'lb-choice-on' : ''}`}
              onClick={() => setPickedBot(b.id)}
            >
              <span className="lb-choice-av">
                <BotAvatar botId={b.id} color={b.color} size={38} bare />
              </span>
              <span className="lb-choice-n">{b.name}</span>
              <span className="lb-choice-r">{b.elo}</span>
            </button>
          ))}
        </div>
        <div className="lb-side">{t('sideAgainst')}</div>
      </>
    );
  } else if (mode === 'drill') {
    opponent = (
      <>
        <div className="lb-drill">
          <div className="lb-drill-clock">0:30</div>
          <div className="lb-drill-t">{drill?.skill ?? t('lbDrillToday')}</div>
          <div className="lb-drill-s">{t('lbDrillSub')}</div>
        </div>
        <div className="lb-side" style={{ color: 'var(--turq)' }}>
          {t('lbTodaysSkill')}
        </div>
      </>
    );
  } else if (live.featured) {
    // A real bout, with the two people actually in it. Everything shown here
    // is what any spectator sees the second they join.
    opponent = (
      <>
        <div className="lb-art">
          <Mask id={live.featured.avatars.AGAINST ?? 'oni'} size="var(--art)" bare />
        </div>
        <div className="lb-fname">{live.featured.names.AGAINST}</div>
        <div className="lb-side">{t('sideAgainst')}</div>
      </>
    );
  } else {
    opponent = (
      <>
        <div className="lb-empty">
          <span
            className="lb-empty-pick"
            dangerouslySetInnerHTML={{ __html: t('lbNobodyLive') }}
          />
        </div>
        <div className="lb-soft">{t('lbWatchEmptySub')}</div>
      </>
    );
  }

  /* ---- the one button ---- */

  let go;
  if (mode === 'ranked') {
    go = queueing ? (
      <button className="lb-go lb-go-cancel" onClick={leaveQueue}>
        {t('queueCancel')}
      </button>
    ) : (
      <button className="lb-go" onClick={joinQueue}>
        {t('lbGoRanked')}
      </button>
    );
  } else if (mode === 'friend') {
    go = chosenFriend ? (
      <button className="lb-go" disabled={busy} onClick={() => callOut(chosenFriend.username)}>
        {t('lbGoFriend', { x: chosenFriend.username })}
      </button>
    ) : online.length > 0 ? (
      <button className="lb-go lb-go-wait" disabled>
        {t('lbWaitFriend')}
      </button>
    ) : (
      // Nobody to tap, so the button does the other thing rather than sitting
      // there greyed out telling you to do something you cannot do.
      <button className="lb-go" disabled={busy} onClick={openRoom}>
        {t('lbGoRoom')}
      </button>
    );
  } else if (mode === 'bot') {
    go = pickedBot ? (
      <button className="lb-go" onClick={startBot}>
        {pickedBot === 'tutor'
          ? t('lbGoTutor')
          : t('lbGoBot', { x: chosenBot?.name ?? '' })}
      </button>
    ) : (
      <button className="lb-go lb-go-wait" disabled>
        {t('lbWaitBot')}
      </button>
    );
  } else if (mode === 'drill') {
    go = (
      <button className="lb-go" onClick={onDrill}>
        {t('lbGoDrill')}
      </button>
    );
  } else {
    go =
      live.watchable > 0 ? (
        <button className="lb-go" disabled={watching} onClick={watchRanked}>
          {watching ? t('loading') : t('lbGoWatch')}
        </button>
      ) : (
        <button className="lb-go lb-go-wait" disabled>
          {t('lbWaitWatch')}
        </button>
      );
  }

  /* ---- the caption: each mode explained exactly once ---- */

  // Captions carry <b> emphasis, so they are injected as HTML. Every string in
  // them is ours (i18n entries and server-authored bot copy), but interpolated
  // values still get escaped: the day one of these takes a user-typed value,
  // this is the line that stops it from being an XSS hole.
  const esc = (s: string | number) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );

  const caption =
    mode === 'bot' && chosenBot
      ? t('lbCapBotPicked', {
          x: esc(chosenBot.name),
          tagline: esc(chosenBot.tagline),
          blurb: esc(chosenBot.blurb),
          n: esc(chosenBot.elo),
        })
      : mode === 'bot' && pickedBot === 'tutor'
        ? t('lbCapTutor')
        : mode === 'friend' && chosenFriend
          ? t('lbCapFriendPicked', { x: esc(chosenFriend.username) })
          : t(`lbCap_${mode}`);

  /* ---- render ---- */

  const tierChip = rank ? (
    rank.provisional ? (
      <span className="lb-tier lb-tier-provisional">
        {t('placingChip', { n: rank.games ?? 0 })}
      </span>
    ) : (
      <span className="lb-tier">
        <TierBadge tier={tierFor(rank.rating).key} size={15} />
        {t(`tier_${tierFor(rank.rating).key}`)} · <span className="lb-elo">{rank.rating}</span>
      </span>
    )
  ) : null;

  return (
    <div className="lb">
      <header className="lb-bar">
        <div className="lb-lock">
          <svg viewBox="0 0 64 64" width="28" height="28" aria-label="YapStage">
            <path d="M8 14 h20 v20 q0 12 -14 16 v-8 q7 -3 7 -8 h-13 z" fill="var(--amber)" />
            <path d="M56 50 h-20 v-20 q0 -12 14 -16 v8 q-7 3 -7 8 h13 z" fill="var(--turq)" />
          </svg>
          <span className="lb-word">YAPSTAGE</span>
        </div>

        <nav className="lb-places">
          {account.signedIn ? (
            <>
              <button onClick={onMatches}>{t('myMatches')}</button>
              <button onClick={onFriends}>
                {t('friendsPillHome')}
                {requests > 0 ? <span className="lb-badge">{requests}</span> : null}
              </button>
              <button onClick={onLocker}>{t('lockerPill')}</button>
            </>
          ) : null}
        </nav>

        <div className="lb-who">
          {account.signedIn ? (
            <>
              <span className="lb-name">{account.name}</span>
              {tierChip}
              <button className="lb-signout" onClick={() => void signOut()}>
                {t('signOut')}
              </button>
            </>
          ) : account.google ? (
            <button className="lb-signin" onClick={signIn}>
              {t('signInGoogle')}
            </button>
          ) : null}
        </div>
      </header>

      {/* The one rule. On a wide screen it floats centered INSIDE the bar
          (absolute, out of flow — a dedicated strip read as clutter, his
          call); on a narrow one the bar has no room, so it becomes a slim
          line under the bar instead of disappearing (also his call). */}
      <p className="lb-warn" dangerouslySetInnerHTML={{ __html: t('lbHouseRule') }} />

      <main className="lb-stage">
        {notice || (authNote && authNote !== 'ok') ? (
          <div className="lb-notice lb-notice-warn">
            {notice
              ? t(notice)
              : t(
                  authNote === 'cancelled'
                    ? 'authCancelled'
                    : authNote === 'nostore'
                      ? 'authNoStore'
                      : 'authFailed',
                )}
          </div>
        ) : null}

        <div className={`lb-select ${compact ? 'lb-select-compact' : ''}`}>
          {/* In every mode but watch, the amber corner is YOU. In watch it is
              one of the two people already arguing: you are in the crowd, not
              in the fight, and pretending otherwise is the kind of lie that
              makes a screen feel fake. */}
          <div className="lb-fighter lb-fighter-a">
            <Cone color="#F0821E" id="lbConeA" />
            {watchingFeatured ? (
              <>
                <div className="lb-art">
                  <Mask id={watchingFeatured.avatars.FOR ?? 'oni'} size="var(--art)" bare />
                </div>
                <div className="lb-fname">{watchingFeatured.names.FOR}</div>
                <div className="lb-side">{t('sideFor')}</div>
              </>
            ) : (
              <>
                <div className="lb-art">
                  <Mask id={myMask} size="var(--art)" bare />
                </div>
                <div className="lb-fname">{effName || t('lbYou')}</div>
                <div className="lb-side">{t('sideFor')}</div>
              </>
            )}
          </div>

          <div className={`lb-vs ${mode === 'drill' ? 'lb-vs-hidden' : ''}`}>{t('vs')}</div>

          <div className="lb-fighter lb-fighter-b">
            <Cone color="#1FC2D4" id="lbConeB" />
            {opponent}
          </div>

          {/* Guests need a name before anything will start. It sits on the
              stage, next to the button they are trying to press, and ABOVE the
              invite ticket: walking into a room unnamed just bounces you. */}
          {!account.signedIn ? (
            <div className="lb-guest">
              <label className="lb-lab" htmlFor="yapname">
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
              />
              {name && !validName ? <span className="lb-err">{t('errBadName')}</span> : null}
            </div>
          ) : null}

          {/* Someone sent a code. Until it is used or waved off, it is the only
              thing on this screen that matters, so the mode's own button steps
              aside for it. */}
          {invited ? (
            <div className="lb-ticket">
              <p className="lb-ticket-head">
                <b>{t('calledOut')}</b> {t('invitedLine')}
              </p>
              <div className="lb-ticket-row">
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
                <button className="btn btn-primary" disabled={busy} onClick={join}>
                  {t('walkIn')}
                </button>
                <button className="btn btn-small ghost" onClick={() => setInvited(false)}>
                  {t('orStartOwn')}
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="lb-err" role="alert">
              {t(error)}
            </p>
          ) : null}

          {invited ? null : go}
        </div>

        <aside className={`lb-wings ${accepted.length === 0 ? 'lb-wings-nobody' : ''}`}>
          <div className="lb-wings-hd">
            <span className="lb-lab">{t('friendsPillHome')}</span>
            {online.length > 0 ? (
              <span className="lb-wings-n">{t('lbNOnline', { n: online.length })}</span>
            ) : null}
          </div>
          <div className="lb-wings-list">
            {!account.signedIn ? (
              <p className="lb-wings-empty">
                {t('lbFriendsNeedAccount')}{' '}
                {account.google ? <button onClick={signIn}>{t('signInGoogle')}</button> : null}
              </p>
            ) : friendsDown ? (
              <p className="lb-wings-empty">{t('friendDown')}</p>
            ) : accepted.length === 0 ? (
              <p className="lb-wings-empty">
                {t('lbNoFriendsYet')} <button onClick={onFriends}>{t('lbAddFriends')}</button>
              </p>
            ) : (
              [...accepted]
                .sort((a, b) => Number(b.online) - Number(a.online))
                .map((f) => (
                  <div key={f.username} className={`lb-friend ${f.online ? '' : 'lb-friend-off'}`}>
                    <span className="lb-friend-av">
                      <Mask id={f.mask ?? 'oni'} size={36} bare />
                      {f.online ? <i className="lb-dot" /> : null}
                    </span>
                    <div>
                      <div className="lb-friend-n">{f.username}</div>
                      <div className="lb-friend-t">
                        {f.online
                          ? f.placed
                            ? `${t(`tier_${tierFor(f.rating).key}`)} · ${f.rating}`
                            : t('lbUnplaced')
                          : t('lbOffline')}
                      </div>
                      {f.online ? (
                        <button
                          className="lb-friend-call"
                          disabled={busy}
                          onClick={() => callOut(f.username)}
                        >
                          {t('lbCallOut')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
            )}
          </div>
          <div className="lb-fade" />
        </aside>
      </main>

      <footer>
        <div className="lb-caption" dangerouslySetInnerHTML={{ __html: caption }} />
        <div className="lb-dock" ref={dockRef}>
          {MODES.map((m) => (
            <button
              key={m}
              className={`lb-act ${mode === m ? 'lb-act-on' : ''}`}
              aria-pressed={mode === m}
              onClick={() => pick(m)}
            >
              <span className="lb-act-t">{t(`lbDock_${m}`)}</span>
              {m === 'drill' && drill && drill.streak > 0 ? (
                <span className="lb-act-k">{t('lbStreak', { n: drill.streak })}</span>
              ) : null}
              {m === 'watch' && live.live > 0 ? (
                <span className="lb-act-live">
                  <i />
                  {t('lbNLiveShort', { n: live.live })}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
