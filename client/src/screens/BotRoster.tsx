// THE BOT ROSTER. Press "pick a bot" and the whole ladder walks out.
//
// It replaced a row of seven 40px chips under the empty opponent slot, which
// he called "too small, looks weird" (2026-09-04). A character select is the
// shape every game he names (chess.com's bot page, Valorant's agent select)
// uses for the same decision: big art, the name, one line of personality, and
// what beating them is worth. The roster is a takeover, not a panel, so the
// stage behind it can stay clean.
//
// Cards are in ladder order, rung zero being the lesson. Nothing is
// pre-picked (the lobby's rule): the ring around a card only appears once you
// have chosen, and choosing closes the roster.
import { useEffect, useRef, type CSSProperties } from 'react';
import { useI18n } from '../i18n';
import { useDialogFocus } from '../useDialogFocus';
import BotAvatar from '../BotAvatar';

/** The YapMaster's lesson card. Hidden for now (2026-09-12). */
const SHOW_LESSON = false;

export interface RosterBot {
  id: string;
  name: string;
  color: string;
  elo: number;
  rank: number;
  tagline: string;
  blurb: string;
}

interface Props {
  /** The ladder, rank ascending. The lesson is added here, not by the caller. */
  bots: RosterBot[];
  picked: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}

export default function BotRoster({ bots, picked, onPick, onClose }: Props) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stagger = (i: number) => ({ '--i': i }) as CSSProperties;

  return (
    <div className="lb-roster" role="dialog" aria-modal="true" aria-label={t('lbRosterTitle')} onClick={onClose}>
      <div className="lb-roster-panel" ref={panel} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="lb-roster-hd">
          <h2 className="lb-roster-t">{t('lbRosterTitle')}</h2>
          <p className="lb-roster-sub">{t('lbRosterSub')}</p>
          <button className="lb-roster-x" onClick={onClose} aria-label={t('lbRosterClose')}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="lb-roster-grid">
          {/* Rung zero: the lesson. The YapMaster demos rather than competes,
              so its card carries "lesson" where the others carry a number.
              Off the menu for now (his call, 2026-09-12); the tutorial code
              stays, flip SHOW_LESSON to bring the card back. */}
          {SHOW_LESSON ? (
          <button
            className={`lb-card lb-card-tutor ${picked === 'tutor' ? 'lb-card-on' : ''}`}
            style={stagger(0)}
            aria-pressed={picked === 'tutor'}
            onClick={() => onPick('tutor')}
          >
            <span className="lb-card-n">00</span>
            <div className="lb-card-art">
              <BotAvatar botId="tutor" color="ink" size="100%" bare />
            </div>
            <div className="lb-card-name">{t('lbRosterTutorName')}</div>
            <div className="lb-card-tag">{t('lbRosterTutorTag')}</div>
            <p className="lb-card-blurb">{t('lbRosterTutorBlurb')}</p>
            <div className="lb-card-foot lb-card-foot-lesson">{t('lbFree')}</div>
          </button>
          ) : null}

          {bots.map((b, i) => {
            return (
              <button
                key={b.id}
                className={`lb-card ${picked === b.id ? 'lb-card-on' : ''}`}
                style={stagger(SHOW_LESSON ? i + 1 : i)}
                aria-pressed={picked === b.id}
                onClick={() => onPick(b.id)}
              >
                <span className="lb-card-n">{String(b.rank).padStart(2, '0')}</span>
                <div className="lb-card-art">
                  <BotAvatar botId={b.id} color={b.color} size="100%" bare />
                </div>
                <div className="lb-card-name">{b.name}</div>
                <div className="lb-card-tag">{b.tagline}</div>
                <p className="lb-card-blurb">{b.blurb}</p>
                <div className="lb-card-foot">
                  <span className="lb-card-elo">{b.elo}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
