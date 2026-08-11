import { useEffect, useState } from 'react';
import type { BotInfo, Pace, Side, TopicCategory, TopicMode } from '../../../server/src/protocol';
import { socket } from '../socket';
import { playerId } from '../player';
import { useI18n } from '../i18n';
import { initAudio } from '../sound';
import { unlockBotVoice } from '../botvoice';
import BotAvatar from '../BotAvatar';
import VideoTile from '../VideoTile';

export interface BotStartConfig {
  botId: string;
  topicMode: TopicMode;
  categoryKey?: string;
  topicId?: string;
  side: Side | 'random';
  pace: Pace;
}

interface Props {
  localStream: MediaStream | null;
  mediaError: string | null;
  onRetryMedia: () => void;
  onStart: (c: BotStartConfig) => void;
  onBack: () => void;
  /** Level 0 players get pointed at the tutorial — it IS their first level. */
  onTutorial: () => void;
  /** Your locker mask, when you chose to wear it instead of a camera. */
  selfMask?: string;
}

export default function BotSelect({ localStream, mediaError, onRetryMedia, onStart, onBack, onTutorial, selfMask }: Props) {
  const { lang, t } = useI18n();
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [topics, setTopics] = useState<TopicCategory[]>([]);
  const [botId, setBotId] = useState<string | null>(null);
  const [mode, setMode] = useState<TopicMode>('random');
  const [cat, setCat] = useState(0);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [side, setSide] = useState<Side | 'random'>('random');
  const [pace, setPace] = useState<Pace>('standard');
  // Campaign frontier: the highest rank you may face. null = unknown (store
  // down or old server) — fail OPEN, the ladder is never bricked by a database.
  const [level, setLevel] = useState<number | null>(null);
  const [lockNudge, setLockNudge] = useState<string | null>(null);

  useEffect(() => {
    fetch('/bots')
      .then((r) => r.json())
      .then((d) => {
        setBots(d.bots ?? []);
        setTopics(d.topics ?? []);
      })
      .catch(() => {});
    socket.emit('campaign:get', { playerId: playerId() }, (res) => {
      setLevel(res?.level ?? null);
    });
  }, []);

  const maxRank = bots.reduce((m, b) => Math.max(m, b.rank), 6);
  const isLocked = (b: BotInfo) => level !== null && b.rank > level;
  const chosen = bots.find((b) => b.id === botId);

  // The level can arrive AFTER a pick (campaign:get is async): a selection
  // that turns out to be locked must not stay armed on the start button.
  useEffect(() => {
    if (chosen && isLocked(chosen)) setBotId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, chosen?.id]);

  const ready =
    !!botId && !!chosen && !isLocked(chosen) && !!localStream && (mode === 'agree' ? !!topicId : true);

  function start() {
    if (!ready || !botId) return;
    // Both must happen INSIDE this tap. initAudio unlocks the AudioContext and
    // speech synthesis; unlockBotVoice unlocks the <audio> element that plays
    // the bot's real voice, which iOS permits per-element, not per-page.
    initAudio();
    unlockBotVoice();
    onStart({
      botId,
      topicMode: mode,
      categoryKey: mode === 'category' ? topics[cat]?.key : undefined,
      topicId: mode === 'agree' ? (topicId ?? undefined) : undefined,
      side,
      pace,
    });
  }

  return (
    <div className="stage bot-select">
      <header className="topbar">
        <button className="btn btn-small" onClick={onBack}>
          {t('back')}
        </button>
        <span className="brand">
          YAP<span className="logo-accent">STAGE</span>
        </span>
        <span className="pill">{t('vsBot')}</span>
      </header>

      <h1 className="display bot-title">{t('chooseOpponent')}</h1>
      <p className="bot-ladder-note">{t('easiestToHardest')}</p>

      {/* Level one of the ladder, always visible: a beginner looking for an
          opponent is exactly who needs the lesson, so it lives HERE rather
          than as a fifth mode on the home page. */}
      <button className="tutor-card" onClick={onTutorial}>
        <BotAvatar botId="tutor" color="gold" size={64} />
        <span className="tutor-rank">#0</span>
        <span className="tutor-body">
          <span className="tutor-name">{t('tutorialTitle2')}</span>
          <span className="tutor-desc">{t('panelTutorialDesc')}</span>
        </span>
        <span className="tutor-go">{t('startTutorial')}</span>
      </button>

      <div className="bot-grid">
        {bots.map((b) => {
          const locked = isLocked(b);
          return (
            <button
              key={b.id}
              className={`bot-card ${botId === b.id ? 'bot-picked' : ''} ${b.rank === maxRank ? 'bot-boss' : ''} ${locked ? 'bot-locked' : ''}`}
              aria-disabled={locked}
              onClick={() => {
                if (locked) {
                  setLockNudge(
                    b.rank === 1
                      ? t('lockFirst')
                      : t('lockBeat', { x: bots.find((p) => p.rank === b.rank - 1)?.name ?? '' }),
                  );
                  return;
                }
                setLockNudge(null);
                setBotId(b.id);
              }}
            >
              <span className="bot-rank-badge">#{b.rank}</span>
              <BotAvatar botId={b.id} color={b.color} size={96} speaking={botId === b.id} />
              <span className="bot-name">{b.name}</span>
              <span className="bot-tagline">{b.tagline}</span>
              {/* A number beats a row of bars: it says how strong, not just
                  stronger-than-the-last-one, and it is comparable to yours. */}
              <span className="bot-elo elo">{b.elo}</span>
              <span className="bot-skill">
                {locked
                  ? b.rank === 1
                    ? t('lockedTag')
                    : t('lockBeat', { x: bots.find((p) => p.rank === b.rank - 1)?.name ?? '' })
                  : b.skill}
              </span>
            </button>
          );
        })}
      </div>
      {lockNudge ? (
        <p className="error lock-nudge" role="alert">
          {lockNudge}
        </p>
      ) : null}

      <div className="bot-setup card">
        {chosen ? <p className="bot-chosen-blurb">“{chosen.blurb}”</p> : null}

        <div className="setup-row">
          <span className="setup-label">{t('topic')}</span>
          <div className="chip-row">
            {(['agree', 'random'] as TopicMode[]).map((m) => (
              <button
                key={m}
                className={`cat-tab ${mode === m ? 'cat-active' : ''}`}
                onClick={() => setMode(m)}
              >
                {t(`mode_${m}`)}
              </button>
            ))}
          </div>
        </div>

        {mode !== 'random' ? (
          <div className="cat-tabs">
            {topics.map((c, i) => (
              <button
                key={c.key}
                className={`cat-tab ${i === cat ? 'cat-active' : ''}`}
                onClick={() => {
                  setCat(i);
                  setTopicId(null);
                }}
              >
                {c.label[lang]}
              </button>
            ))}
          </div>
        ) : null}

        {mode === 'agree' ? (
          <div className="topic-list">
            {topics[cat]?.topics.map((tp) => (
              <button
                key={tp.id}
                className={`topic-btn ${topicId === tp.id ? 'topic-on-table' : ''}`}
                onClick={() => setTopicId(tp.id)}
              >
                {tp[lang]}
              </button>
            ))}
          </div>
        ) : mode === 'category' ? (
          <p className="mode-desc">{t('categoryDesc')}</p>
        ) : (
          <p className="mode-desc">{t('randomDesc')}</p>
        )}

        <div className="setup-row pace-row">
          <span className="setup-label">{t('paceLabel')}</span>
          <div className="chip-row">
            {(['standard', 'blitz', 'long'] as const).map((pc) => (
              <button
                key={pc}
                className={`cat-tab ${pace === pc ? 'cat-active' : ''}`}
                onClick={() => setPace(pc)}
              >
                {t(`pace_${pc}`)}
              </button>
            ))}
          </div>
          <span className="pace-hint">{t(`paceHint_${pace}`)}</span>
        </div>

        <div className="setup-row">
          <span className="setup-label">{t('yourSideLabel')}</span>
          <div className="chip-row">
            {(['FOR', 'AGAINST', 'random'] as const).map((sd) => (
              <button
                key={sd}
                className={`cat-tab ${side === sd ? 'cat-active' : ''}`}
                onClick={() => setSide(sd)}
              >
                {sd === 'random' ? t('sideRandom') : t(sd)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bot-mirror">
        <VideoTile
          stream={localStream}
          muted
          mirror
          maskId={selfMask}
          label={t('you')}
          sub={t(selfMask ? 'onMask' : 'onCam')}
          placeholder={mediaError ? t('cameraBlocked') : t('cameraWarming')}
        />
      </div>

      {mediaError ? (
        <div className="banner banner-error">
          {t(mediaError)}{' '}
          <button className="btn btn-small" onClick={onRetryMedia}>
            {t('retry')}
          </button>
        </div>
      ) : null}

      <button className="btn btn-primary btn-wide bot-go" disabled={!ready} onClick={start}>
        {chosen ? t('debateName', { x: chosen.name }) : t('pickABot')}
      </button>
    </div>
  );
}
