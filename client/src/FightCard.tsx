// THE FIGHT CARD: the beat between the green room and the first turn.
//
// It used to be five lines of type down the middle of an empty screen (the
// motion, two names around a VS, a "you argue" badge and a countdown). His
// note: "you can put both opponents, make it look better in the empty space".
// So it is now the lobby's stage: the FOR fighter in the amber cone, the
// AGAINST fighter in the turquoise one, vs between them, the motion over the
// top. The same grammar that introduced you to your opponent in the lobby
// introduces the fight, and the only new text is the "you" marker, because
// the coin dealt the sides and you need to find yourself.
//
// Nothing here drives the match. The server ends the reveal with the first
// debate:phase, and Debate.tsx swaps this out the moment it lands.
import type { CSSProperties } from 'react';
import type { DebateStart, Side } from '../../server/src/protocol';
import { useI18n } from './i18n';
import BotAvatar from './BotAvatar';
import Cone from './Cone';
import Mask from './Mask';
import VideoTile from './VideoTile';

interface Props {
  start: DebateStart;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Milliseconds until the first turn, off the server clock. */
  revealMs: number;
}

export default function FightCard({ start, localStream, remoteStream, revealMs }: Props) {
  const { lang, t } = useI18n();
  const mySide = start.yourSide;
  const peerSide: Side = mySide === 'FOR' ? 'AGAINST' : 'FOR';
  // Settle-it replaces FOR/AGAINST with what each person is actually arguing.
  const label = (side: Side) => start.framing?.positions[side] ?? t(side);
  // A resumed debate arrives with the reveal already over; this keeps the card
  // from flashing in at full strength for the one frame before the phase lands.
  const leaving = revealMs < 400;

  // What stands in the light. A bot is its drawing; a masked person is their
  // mask; a person on camera is their camera. The ring is the same resting
  // speaking ring the match uses, so nothing changes shape when the match
  // mounts, and it stays at rest because nobody has the mic yet.
  const art = (side: Side) => {
    if (start.bot && side === peerSide) {
      return (
        <div className="mask-ring" style={{ '--lv': 0 } as CSSProperties}>
          <BotAvatar botId={start.bot.id} color={start.bot.color} size="100%" bare />
        </div>
      );
    }
    const mask = start.avatars?.[side];
    if (mask) {
      return (
        <div className="mask-ring" style={{ '--lv': 0 } as CSSProperties}>
          <Mask id={mask} size="100%" bare />
        </div>
      );
    }
    return side === mySide ? (
      <VideoTile stream={localStream} muted mirror label={start.names[side]} side={side} />
    ) : (
      <VideoTile stream={remoteStream} muted label={start.names[side]} side={side} />
    );
  };

  const fighter = (side: Side) => (
    <div className={`fc-fighter ${side === 'FOR' ? 'fc-fighter-a' : 'fc-fighter-b'}`}>
      <Cone color={side === 'FOR' ? '#F0821E' : '#1FC2D4'} id={side === 'FOR' ? 'fcConeA' : 'fcConeB'} />
      <div className="fc-art">{art(side)}</div>
      <div className="fc-fname">{start.names[side]}</div>
      <div className={`fc-side ${start.framing ? 'fc-side-long' : ''}`}>{label(side)}</div>
      {/* The other side gets an invisible one so both columns keep the same
          height: without it the fighter with the marker sat 16px higher. */}
      <span className={`fc-you ${side === mySide ? '' : 'fc-you-hidden'}`} aria-hidden={side !== mySide}>
        {t('you')}
      </span>
    </div>
  );

  return (
    <div className={`stage fight-card ${leaving ? 'fc-leaving' : ''}`}>
      <p className="kicker">{t('tonightsMotion')}</p>
      <h1 className="display fc-motion">{start.topic[lang]}</h1>
      <div className="fc-select">
        {fighter('FOR')}
        <div className="fc-vs">{t('vs')}</div>
        {fighter('AGAINST')}
      </div>
      <p className="subtitle fc-caption">
        {t('noTakebacks', { x: start.names.FOR, n: Math.max(1, Math.ceil(revealMs / 1000)) })}
      </p>
    </div>
  );
}
