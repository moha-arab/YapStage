// THE MATCH SETTINGS. One panel, used wherever a host sets the terms of a
// debate: the friend room on the lobby stage (before the friend walks in),
// the green room (after), and the bot game on the same stage once a bot is
// picked. It has to cover, in one user-friendly panel: choose the topic, take
// a random one, choose a category, take a random topic from it, and choose for
// or against.
//
// Two facts, each a row of chips: the TOPIC (random, random from a category,
// or one exact motion from the deck) and the SIDE (the coin, for, against).
// Random and the coin are the defaults and stay the norm; a category or a
// motion is a second row that only appears when asked for, so the panel costs
// two lines until the host wants more. Nothing else is pre-picked: the
// category chips and the motions start blank (the lobby's rule).
//
// The panel is controlled. It never talks to the socket itself, because the
// same value means two different things: in a friend room it is server state
// echoed back in every LobbyUpdate, in a bot game it is local state handed to
// bot:start. The callers own that; `emitSetup` below is the friend-room half.
import { useState } from 'react';
import type { LobbyUpdate, SidePick, TopicCategory } from '../../server/src/protocol';
import { socket } from './socket';
import { useI18n } from './i18n';
import './matchsetup.css';

export interface MatchSetupValue {
  /** 'agree' is the protocol's name for "one exact motion". */
  topicMode: 'agree' | 'category' | 'random';
  categoryKey: string | null;
  topicId: string | null;
  side: SidePick;
}

export const DEFAULT_SETUP: MatchSetupValue = {
  topicMode: 'random',
  categoryKey: null,
  topicId: null,
  side: 'random',
};

/** The panel's value as the server currently holds it for this room. */
export function setupOf(lobby: LobbyUpdate): MatchSetupValue {
  return {
    // Dispute is parked and never reachable from the panel; treat it as random
    // rather than let the type leak into the chips.
    topicMode: lobby.topicMode === 'dispute' ? 'random' : lobby.topicMode,
    categoryKey: lobby.categoryKey,
    topicId: lobby.pick.yourTopicId,
    side: lobby.hostSide,
  };
}

/** True when the go button can honestly say go: a category mode has its
    category, a motion mode has its motion. Random needs nothing. */
export function setupComplete(v: MatchSetupValue): boolean {
  if (v.topicMode === 'category') return v.categoryKey !== null;
  if (v.topicMode === 'agree') return v.topicId !== null;
  return true;
}

/** Friend rooms: send the server only what changed, in the order it checks
    (the mode first, because pick:category and pick:topic are refused until
    the mode matches). Every pick:* shares one rate bucket, so this is a
    handful of events per tap, never a stream. */
export function emitSetup(prev: MatchSetupValue, next: MatchSetupValue): void {
  if (next.topicMode !== prev.topicMode) socket.emit('pick:mode', next.topicMode);
  if (next.topicMode === 'category' && next.categoryKey && next.categoryKey !== prev.categoryKey) {
    socket.emit('pick:category', next.categoryKey);
  }
  if (next.topicMode === 'agree' && next.topicId && next.topicId !== prev.topicId) {
    socket.emit('pick:topic', next.topicId);
  }
  if (next.side !== prev.side) socket.emit('pick:side', next.side);
}

interface Props {
  deck: TopicCategory[];
  value: MatchSetupValue;
  onChange: (next: MatchSetupValue) => void;
}

const TOPIC_MODES = ['random', 'category', 'agree'] as const;
const SIDES: SidePick[] = ['random', 'FOR', 'AGAINST'];

export default function MatchSetup({ deck, value, onChange }: Props) {
  const { lang, t } = useI18n();
  // Which category's motions are on show in "pick the topic". Local: it is a
  // browsing position, not a setting, and the chosen motion stays chosen
  // while you look at other tabs. Until you browse, the tab follows the
  // chosen motion, so a room echoed back from the server opens on it.
  const chosenTab = value.topicId ? deck.findIndex((c) => c.topics.some((x) => x.id === value.topicId)) : -1;
  const [tab, setTab] = useState<number | null>(null);
  const shownTab = Math.min(tab ?? Math.max(chosenTab, 0), Math.max(0, deck.length - 1));

  const set = (patch: Partial<MatchSetupValue>) => onChange({ ...value, ...patch });

  // Two plain questions, three labelled answers each: the old rows of small
  // chips were cluttered and did not say what they did.
  return (
    <div className="ms2">
      <section className="ms2-sec">
        <h3 className="ms2-h">{t('setupQTopic')}</h3>
        <div className="ms2-cards">
          {TOPIC_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`ms2-card ${value.topicMode === m ? 'ms2-on' : ''}`}
              aria-pressed={value.topicMode === m}
              onClick={() => set({ topicMode: m })}
            >
              <span className="ms2-tick" aria-hidden="true" />
              <span className="ms2-t">{t(`setupModeT_${m}`)}</span>
              <span className="ms2-s">{t(`setupModeSub_${m}`)}</span>
            </button>
          ))}
        </div>

        {value.topicMode === 'category' ? (
          <div className="ms2-more">
            <span className="ms2-q">{t('setupPickCat')}</span>
            <div className="ms2-pills">
              {deck.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`ms2-pill ${value.categoryKey === c.key ? 'ms2-on' : ''}`}
                  aria-pressed={value.categoryKey === c.key}
                  onClick={() => set({ categoryKey: c.key })}
                >
                  {c.label[lang]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {value.topicMode === 'agree' ? (
          <div className="ms2-more">
            <span className="ms2-q">{t('setupPickTopic')}</span>
            <div className="ms2-pills">
              {deck.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  className={`ms2-pill ${i === shownTab ? 'ms2-on' : ''}`}
                  aria-pressed={i === shownTab}
                  onClick={() => setTab(i)}
                >
                  {c.label[lang]}
                </button>
              ))}
            </div>
            <div className="ms2-list">
              {deck[shownTab]?.topics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  className={`ms2-row ${value.topicId === topic.id ? 'ms2-on' : ''}`}
                  aria-pressed={value.topicId === topic.id}
                  onClick={() => set({ topicId: topic.id })}
                >
                  <span className="ms2-radio" aria-hidden="true" />
                  <span>{topic[lang]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="ms2-sec">
        <h3 className="ms2-h">{t('setupQSide')}</h3>
        <div className="ms2-cards">
          {SIDES.map((sd) => (
            <button
              key={sd}
              type="button"
              className={`ms2-card ms2-side-${sd.toLowerCase()} ${value.side === sd ? 'ms2-on' : ''}`}
              aria-pressed={value.side === sd}
              onClick={() => set({ side: sd })}
            >
              <span className="ms2-tick" aria-hidden="true" />
              <span className="ms2-t">{t(`setupSideT_${sd}`)}</span>
              <span className="ms2-s">{t(`setupSideSub_${sd}`)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** The guest's read-only view: the two facts as sentences, written from the
    guest's chair. `host` is the host's name. */
export function describeSetup(
  lobby: LobbyUpdate,
  host: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  lang: 'en' | 'ar',
): { topic: string; side: string } {
  const cat = lobby.categoryKey ? lobby.deck.find((c) => c.key === lobby.categoryKey) : undefined;
  const motion = lobby.pick.peerTopicId
    ? lobby.deck.flatMap((c) => c.topics).find((x) => x.id === lobby.pick.peerTopicId)
    : undefined;
  const topic =
    lobby.topicMode === 'category'
      ? cat
        ? t('setupTopicCategory', { x: cat.label[lang] })
        : t('setupTopicCategoryNone', { x: host })
      : lobby.topicMode === 'agree'
        ? motion
          ? t('setupTopicOne', { x: motion[lang] })
          : t('setupTopicOneNone', { x: host })
        : t('setupTopicRandom');
  const side =
    lobby.hostSide === 'random'
      ? t('setupSideCoin')
      : t('setupSideSet', {
          x: host,
          s: t(`setupSide_${lobby.hostSide}`),
          o: t(`setupSide_${lobby.hostSide === 'FOR' ? 'AGAINST' : 'FOR'}`),
        });
  return { topic, side };
}
