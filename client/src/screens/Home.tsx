// THE LOBBY. Rebuilt 2026-08-21 after "a lot of people have been telling me
// the site looks really bad, it's so obviously AI", and cut down again on
// 2026-09-04 when he walked it as a new user.
//
// What is here and why, so nobody re-adds what he removed:
//
//   1. ONE navigation. Five verbs in a dock along the bottom, in HIS order
//      (play online · play bots · play a friend · watch a match · daily
//      drill), and the stage above shows what you picked. The bar carries
//      only the mark, the house rule, your name, previous matches, sign out.
//   2. A mode is explained ONCE, in the caption above the dock.
//   3. NOTHING IS PRE-PICKED. You pick, the bot walks on, the button says it.
//   4. NO FRIENDS LIST (2026-09-04, his call: "overcomplicating it"). Play a
//      friend is a code and a link, full stop. The server still has friends;
//      the UI does not. "Maybe we can look at it later."
//   5. NO SIDES IN THE LOBBY. You were always drawn as FOR, and he asked why
//      ("isn't that kind of weird?"). The coin deals sides when the match
//      starts; here it is just you and whoever is opposite. Watch mode is the
//      one exception: those two really are FOR and AGAINST.
//   6. NO LOCKER SCREEN. Tap your own mask (or "change mask" under it) and the
//      roster walks out, same shape as the bot roster.
//   7. RATING LIVES IN THE RANKED MODE, and there is one of them. Ranked is
//      standard only (his call 2026-09-12: one mode, so every player is in
//      the same queue); the per-length ratings and the three chips under
//      the stage from 2026-09-04 are gone. The chip under your name shows
//      your tier and rating, or "not placed yet".
//   8. PLACEMENT IS ONE MATCH. Unplaced, the ranked stage puts the placement
//      bot opposite you instead of an empty ring, one line says why, and the
//      go button starts that game. No placement counter anywhere.
//   9. NO ACCOUNT FOR ANYTHING BUT RANKED (his call 2026-09-12, reversing
//      2026-08-22). A guest plays bots, a friend, watches and drills under a
//      name typed once and a mask picked once, both kept on the device
//      (guest.ts). Ranked alone asks for the account, on its own stage with
//      the reason in one line, and the bar carries a quiet sign-in.
import { useCallback, useEffect, useRef, useState } from 'react';
import { NAME_RE, tierFor, type JoinError, type LobbyUpdate } from '../../../server/src/protocol';
import type { BotStartConfig } from './BotSelect';
import BotRoster from './BotRoster';
import MaskRoster from './MaskRoster';
import { session, socket } from '../socket';
import { playerId, saveLocker, signIn, signOut, type Account } from '../player';
import * as guest from '../guest';
import { unlockSpectateAudio } from '../specaudio';
import { unlockBotVoice } from '../botvoice';
import { initAudio } from '../sound';
import { useI18n } from '../i18n';
import Mask, { MASK_IDS } from '../Mask';
import BotAvatar from '../BotAvatar';
import Cone from '../Cone';
import TierBadge from '../TierBadge';

const ERROR_KEYS: Record<JoinError, string> = {
  not_found: 'errNotFound',
  full: 'errFull',
  in_progress: 'errInProgress',
  bad_name: 'errBadName',
  rate_limited: 'errRateLimited',
  locked: 'errLocked',
  self: 'errSelf',
  // The server's own account gate for ranked, same words the client uses.
  signed_out: 'signInRanked',
  placed: 'errPlaced',
};

type Mode = 'ranked' | 'bot' | 'friend' | 'watch' | 'drill';
// His order (2026-09-04): online, bots, a friend, watch, drill.
const MODES: Mode[] = ['ranked', 'bot', 'friend', 'watch', 'drill'];

interface Bot {
  id: string;
  name: string;
  color: string;
  elo: number;
  rank: number;
  tagline: string;
  blurb: string;
}

interface Rank {
  rating: number;
  /** false = the placement match is still ahead; null = the store is down
      and the server cannot say, so the queue shows as if placed. */
  placed: boolean | null;
  /** Who the placement match is against, named by the server so the stage
      can put them up before the roster has loaded. */
  placementBot: string;
}

interface Props {
  /** App's boot /auth/me answer, passed down so the lobby never re-fetches it. */
  account: Account;
  notice: string | null;
  onEntered: (u: LobbyUpdate) => void;
  onSpectate: (code: string, feed: boolean) => void;
  onMatches: () => void;
  onDrill: () => void;
  onBotStart: (name: string, config: BotStartConfig) => void;
  onTutorial: (name: string) => void;
  /** The mask was saved to the account; App keeps its copy in step. */
  onMaskSaved: (mask: string) => void;
}

export default function Home({
  account,
  notice,
  onEntered,
  onSpectate,
  onMatches,
  onDrill,
  onBotStart,
  onTutorial,
  onMaskSaved,
}: Props) {
  const { t } = useI18n();

  // A code in the URL (or stashed by signIn() across the Google round trip)
  // means a friend sent a link: open on the friend mode with it typed in.
  const [arrival] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('code');
    let stashed: string | null = null;
    try {
      stashed = sessionStorage.getItem('yapstage.pendingCode');
      if (stashed) sessionStorage.removeItem('yapstage.pendingCode');
    } catch {
      // storage blocked: the URL path still works
    }
    return (fromUrl ?? stashed ?? '').toUpperCase().slice(0, 6);
  });

  const [mode, setMode] = useState<Mode>(arrival ? 'friend' : 'ranked');
  const [pickedBot, setPickedBot] = useState<string | null>(null);
  const [roster, setRoster] = useState(false);
  const [maskRoster, setMaskRoster] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A guest's name is typed once and kept on the device, never asked again.
  const [name, setName] = useState(guest.guestName);

  const [queueing, setQueueing] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ waiting: number } | null>(null);

  const needAccount = account.google && !account.signedIn;

  /* ---- everything the stage needs to know ---- */

  // Your one rating, and whether the placement match is still ahead. A server
  // built before one-match placement answers without `placed`; that reads as
  // null, which is the queue, so nothing on the stage changes mid-deploy.
  const [rank, setRank] = useState<Rank | null>(null);
  useEffect(() => {
    void fetch(`/rating?playerId=${encodeURIComponent(playerId())}`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.rating !== 'number') return;
        setRank({
          rating: d.rating,
          placed: typeof d.placed === 'boolean' ? d.placed : null,
          placementBot: typeof d.placementBot === 'string' ? d.placementBot : '',
        });
      })
      .catch(() => {});
  }, [account.signedIn]);
  // Unplaced means the placement bot stands opposite you in ranked mode.
  // Not for a guest: their stage carries the sign-in ask instead.
  const placing = mode === 'ranked' && !needAccount && rank?.placed === false;

  const [bots, setBots] = useState<Bot[]>([]);
  useEffect(() => {
    void fetch('/bots')
      .then((r) => r.json())
      .then((d: { bots?: Bot[] }) => setBots(d.bots ?? []))
      .catch(() => {});
  }, []);

  const [drill, setDrill] = useState<{ tier: number; streak: number; doneToday: boolean } | null>(
    null,
  );
  useEffect(() => {
    void fetch('/drill')
      .then((r) => r.json())
      .then((d) => {
        if (!d?.drill) return;
        // A guest's streak lives on the device (guest.ts); the server only
        // counts the ones it can put a name to.
        const s = d.signedIn
          ? { streak: d.streak ?? 0, doneToday: !!d.doneToday }
          : guest.localDrillState(String(d.day ?? ''));
        setDrill({ tier: Number(d.tier) || 1, streak: s.streak, doneToday: s.doneToday });
      })
      .catch(() => {});
  }, [account.signedIn]);

  // How many ranked debates are on right now, plus one to put on the stage.
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
    const onUpdate = (p: { waiting: number }) => setQueueInfo(p);
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
  // Signed out, the pick is kept on the device (guest.ts) so it is still
  // yours tomorrow; signed in, the locker has it.
  const [guestMask, setGuestMask] = useState(() => {
    const saved = guest.guestMask();
    return saved && (MASK_IDS as readonly string[]).includes(saved) ? saved : MASK_IDS[0];
  });
  const myMask = account.signedIn ? (account.mask ?? MASK_IDS[0]) : guestMask;

  function requireName(): boolean {
    if (validName) return true;
    setError('nameFirst');
    document.getElementById('yapname')?.focus();
    return false;
  }

  /** RANKED ONLY. Everything else is playable signed out, deliberately. */
  function requireAccount(): boolean {
    if (!needAccount) return true;
    setError('signInRanked');
    return false;
  }

  /* ---- the friend room: a code, made the moment you pick the mode ---- */

  // The room is opened when you land on "play a friend", so the code is on
  // the stage without another tap (his spec). It is left again when you pick
  // another mode. It is NOT left on unmount: the friend walking in is what
  // unmounts this screen, and leaving then would slam the door on them.
  const [room, setRoom] = useState<{ code: string } | null>(null);
  const [joinCode, setJoinCode] = useState(arrival);
  const [copied, setCopied] = useState(false);
  const opening = useRef(false);

  const openRoom = useCallback(() => {
    if (opening.current || !validName) return;
    opening.current = true;
    setError(null);
    socket.emit('lobby:create', { sessionId: session.id, name: effName, playerId: playerId() }, (res) => {
      opening.current = false;
      if (!res.ok) return setError(ERROR_KEYS[res.error]);
      setRoom({ code: res.update.code });
    });
  }, [effName, validName]);

  useEffect(() => {
    // Arriving on a link, you are the one walking in, not the one opening.
    if (mode === 'friend' && !room && !arrival) openRoom();
  }, [mode, room, arrival, openRoom]);

  useEffect(() => {
    // The server closed it (idle timeout) while we sat here holding the code.
    const onClosed = () => setRoom(null);
    socket.on('lobby:closed', onClosed);
    return () => {
      socket.off('lobby:closed', onClosed);
    };
  }, []);

  function leaveRoom() {
    if (!room) return;
    socket.emit('lobby:leave');
    setRoom(null);
  }

  function copyLink() {
    if (!room) return;
    const link = `${window.location.origin}/?code=${room.code}`;
    void navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  function join() {
    if (busy || !requireName()) return;
    if (joinCode.trim().length !== 6) return setError('errCodeLen');
    setBusy(true);
    // Walking into someone else's room means giving up your own.
    leaveRoom();
    socket.emit(
      'lobby:join',
      { code: joinCode.trim().toUpperCase(), sessionId: session.id, name: effName, playerId: playerId() },
      (res) => {
        setBusy(false);
        if (res.ok) return onEntered(res.update);
        setError(ERROR_KEYS[res.error]);
      },
    );
  }

  /* ---- the things the go button can do ---- */

  function joinQueue() {
    if (queueing || !requireAccount() || !requireName()) return;
    setError(null);
    const payload = { sessionId: session.id, playerId: playerId(), name: effName };
    socket.emit('queue:join', payload, (res) => {
      if (!res.ok) return setError(ERROR_KEYS[res.error ?? 'rate_limited']);
      setQueueing(true);
    });
  }

  function leaveQueue() {
    socket.emit('queue:leave');
    setQueueing(false);
    setQueueInfo(null);
  }

  function startBot() {
    if (!pickedBot || !requireName()) return;
    // Both of these must happen INSIDE this tap, and losing them is exactly
    // how the redesign brought the robot voice back: initAudio unlocks the
    // AudioContext and speech synthesis, unlockBotVoice unlocks the one
    // long-lived <audio> element that plays the bot's REAL voice.
    initAudio();
    unlockBotVoice();
    if (pickedBot === 'tutor') return onTutorial(effName);
    onBotStart(effName, {
      botId: pickedBot,
      topicMode: 'random',
      side: 'random',
      pace: 'standard',
    });
  }

  /** The placement match. Ranked terms (an account, a random motion, the
      coin deals the sides), but the opponent is the placement bot and the
      server picks it; the botId here is only what the stage showed. */
  function startPlacement() {
    if (!rank || !requireAccount() || !requireName()) return;
    initAudio();
    unlockBotVoice();
    onBotStart(effName, {
      botId: placementBot?.id ?? '',
      topicMode: 'random',
      side: 'random',
      pace: 'standard',
      placement: true,
    });
  }

  const [watching, setWatching] = useState(false);
  /** Watch a random LIVE ranked debate. Ranked is public by consent. */
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
    if (next === mode) return;
    if (queueing && next !== 'ranked') leaveQueue();
    if (mode === 'friend' && next !== 'friend') leaveRoom();
    setError(null);
    setMode(next);
    setPickedBot(null);
    setRoster(false);
  }

  const closeRoster = useCallback(() => setRoster(false), []);
  function pickBot(id: string) {
    setPickedBot(id);
    setRoster(false);
  }

  const closeMaskRoster = useCallback(() => setMaskRoster(false), []);
  function pickMask(id: string) {
    setMaskRoster(false);
    if (!account.signedIn) {
      guest.setGuestMask(id);
      return setGuestMask(id);
    }
    if (id === account.mask) return;
    void saveLocker(id, true).then((ok) => {
      if (!ok) return;
      onMaskSaved(id);
      // The server reads your locker once, when the socket connects. Bounce
      // it so the next seat wears the new mask. Not while holding a room:
      // a bounce would give up the seat, and the green room has its own
      // picker anyway.
      if (!room && !queueing) {
        socket.disconnect();
        socket.connect();
      }
    });
  }

  // On a phone the dock scrolls sideways, so the selected verb is dragged
  // into view or the tap looks like it missed.
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dockRef.current
      ?.querySelector('.lb-act-on')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [mode]);

  /* ---- what stands on each side ---- */

  const ladder = bots.filter((b) => b.id !== 'tutor').sort((a, b) => a.rank - b.rank);
  const chosenBot = ladder.find((b) => b.id === pickedBot) ?? null;
  // The server names the placement bot; the roster gives it a face.
  const placementBot = rank ? (ladder.find((b) => b.name === rank.placementBot) ?? null) : null;
  const watchingFeatured = mode === 'watch' ? live.featured : null;

  // YOU, on the amber side, in every mode but watch. Your mask is a button:
  // tap it and the mask roster walks out.
  const me = (
    <>
      <button className="lb-picked" onClick={() => setMaskRoster(true)}>
        <div className="lb-art">
          <Mask id={myMask} size="var(--art)" bare />
        </div>
        <div className="lb-fname">{effName || t('lbYou')}</div>
        <span className="lb-change">{t('lbChangeMask')}</span>
      </button>
      {/* Placed: your tier and number. Unplaced: say so. Unknown (the store
          is down, so /rating is the seed for everyone): say nothing, since
          "Bronze 700" under a Master is a lie the chip would be telling. */}
      {mode === 'ranked' && rank?.placed === true ? (
        <span className="lb-tier">
          <TierBadge tier={tierFor(rank.rating).key} size={15} />
          {t(`tier_${tierFor(rank.rating).key}`)} · <span className="lb-elo">{rank.rating}</span>
        </span>
      ) : mode === 'ranked' && rank?.placed === false ? (
        <span className="lb-tier lb-tier-provisional">{t('lbUnplaced')}</span>
      ) : null}
    </>
  );

  let opponent;
  if (placing && rank) {
    // Unplaced: the placement bot stands where a stranger would, and the one
    // line under it says what the game is for.
    opponent = (
      <>
        <div className="lb-art">
          <BotAvatar botId={placementBot?.id ?? ''} color={placementBot?.color ?? 'against'} size="var(--art)" bare />
        </div>
        <div className="lb-fname">
          {rank.placementBot}
          {placementBot ? <span className="lb-frating">{placementBot.elo}</span> : null}
        </div>
        <div className="lb-soft lb-soft-placement">{t('lbPlacementLine', { x: rank.placementBot })}</div>
      </>
    );
  } else if (mode === 'ranked') {
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
      </>
    );
  } else if (mode === 'friend') {
    // The friend's seat is empty until they walk in. The code and the link
    // live in the MIDDLE, under the stage (his call: "the code shouldn't be
    // on the blue"), the same shape watch mode uses for its note.
    opponent = (
      <>
        <div className="lb-empty">
          <span className="lb-empty-q">?</span>
        </div>
        <div className="lb-soft">{t('lbAFriendSoft')}</div>
      </>
    );
  } else if (mode === 'bot') {
    const picked = chosenBot ? (
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
    ) : null;
    opponent = picked ? (
      <button className="lb-picked" onClick={() => setRoster(true)}>
        {picked}
        <span className="lb-change">{t('lbChangeBot')}</span>
      </button>
    ) : (
      <button className="lb-empty lb-empty-btn" onClick={() => setRoster(true)}>
        <span className="lb-empty-pick" dangerouslySetInnerHTML={{ __html: t('lbPickBot') }} />
      </button>
    );
  } else if (mode === 'drill') {
    opponent = (
      <>
        <div className="lb-drill">
          <div className="lb-drill-clock">0:30</div>
          <div className="lb-drill-t">{drill ? t('drillTier', { n: drill.tier }) : t('lbDrillToday')}</div>
          <div className="lb-drill-s">{t('lbDrillSub')}</div>
        </div>
        <div className="lb-side" style={{ color: 'var(--turq)' }}>
          {t('lbTodaysSkill')}
        </div>
      </>
    );
  } else if (watchingFeatured) {
    // A real bout, with the two people actually in it, on their real sides.
    opponent = (
      <>
        <div className="lb-art">
          <Mask id={watchingFeatured.avatars.AGAINST ?? MASK_IDS[0]} size="var(--art)" bare />
        </div>
        <div className="lb-fname">{watchingFeatured.names.AGAINST}</div>
        <div className="lb-side">{t('sideAgainst')}</div>
      </>
    );
  } else {
    opponent = (
      <div className="lb-empty">
        <span className="lb-empty-q">?</span>
      </div>
    );
  }

  /* ---- the one button ---- */

  let go;
  if (placing) {
    go = (
      <button className="lb-go" onClick={startPlacement}>
        {t('lbGoPlacement', { x: rank?.placementBot ?? '' })}
      </button>
    );
  } else if (mode === 'ranked' && needAccount) {
    // The one door that needs an account: the button IS the sign-in, and
    // the line above it (lbRankedAsk) says why.
    go = (
      <button className="lb-go" onClick={signIn}>
        {t('signInGoogle')}
      </button>
    );
  } else if (mode === 'ranked') {
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
    go = room ? (
      <button className="lb-go lb-go-wait" disabled>
        {t('lbWaitRoom')}
      </button>
    ) : (
      <button className="lb-go" disabled={busy} onClick={openRoom}>
        {t('lbGoRoom')}
      </button>
    );
  } else if (mode === 'bot') {
    go = pickedBot ? (
      <button className="lb-go" onClick={startBot}>
        {pickedBot === 'tutor' ? t('lbGoTutor') : t('lbGoBot', { x: chosenBot?.name ?? '' })}
      </button>
    ) : (
      <button className="lb-go" onClick={() => setRoster(true)}>
        {t('lbGoPickBot')}
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
        : placing
          ? t('lbCap_placement', { x: esc(rank?.placementBot ?? '') })
          : t(`lbCap_${mode}`);

  /* ---- render ---- */

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

        <div className="lb-who">
          {account.signedIn ? (
            // Two buttons that look like buttons (his note). Your name is
            // already under your mask on the stage, so it does not repeat here.
            <>
              <button className="lb-bar-btn" onClick={onMatches}>
                {t('myMatches')}
              </button>
              <button className="lb-bar-btn lb-bar-btn-quiet" onClick={() => void signOut()}>
                {t('signOut')}
              </button>
            </>
          ) : account.google ? (
            // Quiet on purpose: a guest can do everything but ranked without
            // it, so it must not read as the price of entry.
            <button className="lb-bar-btn lb-bar-btn-quiet" onClick={signIn}>
              {t('signIn')}
            </button>
          ) : null}
        </div>
      </header>

      {/* The one rule. Centered INSIDE the bar on a wide screen; a slim line
          under it on a narrow one. */}
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

        <div className="lb-select">
          <div className="lb-fighter lb-fighter-a">
            <Cone color="#F0821E" id="lbConeA" />
            {watchingFeatured ? (
              <>
                <div className="lb-art">
                  <Mask id={watchingFeatured.avatars.FOR ?? MASK_IDS[0]} size="var(--art)" bare />
                </div>
                <div className="lb-fname">{watchingFeatured.names.FOR}</div>
                <div className="lb-side">{t('sideFor')}</div>
              </>
            ) : mode === 'watch' ? (
              // In the crowd, not in the fight: nobody on this side either.
              <div className="lb-empty lb-empty-a">
                <span className="lb-empty-q">?</span>
              </div>
            ) : (
              me
            )}
          </div>

          <div className={`lb-vs ${mode === 'drill' ? 'lb-vs-hidden' : ''}`}>{t('vs')}</div>

          <div className="lb-fighter lb-fighter-b">
            <Cone color="#1FC2D4" id="lbConeB" />
            {opponent}
          </div>

          {mode === 'watch' && !watchingFeatured ? (
            <p className="lb-stage-note">{t('lbNobodyOnStage')}</p>
          ) : null}

          {/* Guests need a name before anything will start. Not for watching
              (the crowd is anonymous) and not on a ranked stage that is
              asking for an account instead. The line under it is the
              disclosure for filing a guest's games under the device id. */}
          {!account.signedIn && mode !== 'watch' && !(mode === 'ranked' && needAccount) ? (
            <>
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
                    const v = e.target.value.replace(/\s/g, '');
                    setName(v);
                    guest.setGuestName(v);
                    setError(null);
                  }}
                />
                {name && !validName ? <span className="lb-err">{t('errBadName')}</span> : null}
              </div>
              <p className="lb-guest-note">{t(account.google ? 'lbGuestKept' : 'lbGuestKeptLocal')}</p>
            </>
          ) : null}

          {/* Ranked is the one thing that needs an account. Said on the stage
              itself, before the tap, with the reason in one line. */}
          {mode === 'ranked' && needAccount ? (
            <p className="lb-stage-note lb-stage-ask">{t('lbRankedAsk')}</p>
          ) : null}

          {/* Play a friend: the code and the link, centred under the stage,
              and the box for a code somebody sent you. */}
          {mode === 'friend' ? (
            <div className="lb-friend">
              {room ? (
                <div className="lb-ticket">
                  <span className="lb-lab">{t('lbUseCode')}</span>
                  <span className="lb-code">{room.code}</span>
                  <button className="lb-copy" onClick={copyLink}>
                    {copied ? t('copied') : t('lbCopyLink')}
                  </button>
                </div>
              ) : null}
              <div className="lb-join">
                <span className="lb-lab">{t('lbGotCode')}</span>
                <div className="lb-join-row">
                  <input
                    className="input input-code"
                    placeholder={t('codePlaceholder')}
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) => {
                      setJoinCode(e.target.value.toUpperCase());
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') join();
                    }}
                  />
                  <button className="btn btn-small" disabled={busy || joinCode.trim().length !== 6} onClick={join}>
                    {t('walkIn')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="lb-err" role="alert">
              {t(error)}
            </p>
          ) : null}

          {go}
        </div>
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

      {roster ? (
        <BotRoster bots={ladder} picked={pickedBot} onPick={pickBot} onClose={closeRoster} />
      ) : null}
      {maskRoster ? (
        <MaskRoster picked={myMask} onPick={pickMask} onClose={closeMaskRoster} />
      ) : null}
    </div>
  );
}
