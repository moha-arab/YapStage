// THE MASK ROSTER. Tap your own mask in the lobby and the four walk out, the
// same takeover the bot roster uses. It replaced the Locker screen on
// 2026-09-04 (his call: "press on your character in the lobby and change
// your skin"). The camera/mask toggle that lived in the locker is gone with
// it: every room starts masked, and only a friend room offers the camera.
//
// Signed out it is the same roster, read-only (2026-09-12): a guest wears the
// grey silhouette, and characters come with an account. Every card is there
// to look at, each one says it is locked, and there is one button, the
// sign-in. Where this deployment has no Google sign-in (local dev) the line
// stays and the button goes.
import { useEffect, useRef, type CSSProperties } from 'react';
import { useI18n } from '../i18n';
import { useDialogFocus } from '../useDialogFocus';
import { signIn } from '../player';
import Mask, { MASK_IDS } from '../Mask';

interface Props {
  picked: string;
  onPick: (id: string) => void;
  onClose: () => void;
  /** Signed out: show every character locked. `canSignIn` is whether this
      deployment offers Google sign-in at all. */
  locked?: { canSignIn: boolean };
}

export default function MaskRoster({ picked, onPick, onClose, locked }: Props) {
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

  const title = t(locked ? 'lbMaskLockedTitle' : 'lbMaskTitle');

  return (
    <div className="lb-roster" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="lb-roster-panel lb-roster-masks" ref={panel} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="lb-roster-hd">
          <h2 className="lb-roster-t">{title}</h2>
          <p className="lb-roster-sub">{t(locked ? 'lbMaskLockedSub' : 'lbMaskSub')}</p>
          <button className="lb-roster-x" onClick={onClose} aria-label={t('lbRosterClose')}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {locked?.canSignIn ? (
            <button className="lb-go" style={{ gridColumn: 1, justifySelf: 'start', margin: '16px 0 0' }} onClick={signIn}>
              {t('signInGoogle')}
            </button>
          ) : null}
        </header>

        <div className="lb-roster-grid lb-roster-grid-masks">
          {MASK_IDS.map((id, i) =>
            locked ? (
              // Not a button: there is nothing to do with a locked card but
              // look at it. It holds still under the pointer for the same
              // reason (the stylesheet lifts and rings a hovered card).
              <div
                key={id}
                className="lb-card lb-card-mask"
                style={{ '--i': i, transform: 'none', borderColor: 'var(--house-3)', boxShadow: 'none' } as CSSProperties}
              >
                <div className="lb-card-art" style={{ opacity: 0.8 }}>
                  <Mask id={id} size="100%" bare />
                </div>
                <div className="lb-card-name">{t(`mask_${id}`)}</div>
                <div className="lb-card-foot" style={{ color: 'var(--muted)', paddingTop: 4 }}>
                  <svg viewBox="0 0 12 14" width="11" height="13" aria-hidden="true">
                    <path d="M3.2 6.4V4.4a2.8 2.8 0 0 1 5.6 0v2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                    <rect x="1.4" y="6.2" width="9.2" height="7" rx="1.6" fill="currentColor" />
                  </svg>
                  {t('lockedTag')}
                </div>
              </div>
            ) : (
              <button
                key={id}
                className={`lb-card lb-card-mask ${picked === id ? 'lb-card-on' : ''}`}
                style={{ '--i': i } as CSSProperties}
                aria-pressed={picked === id}
                onClick={() => onPick(id)}
              >
                <div className="lb-card-art">
                  <Mask id={id} size="100%" bare />
                </div>
                <div className="lb-card-name">{t(`mask_${id}`)}</div>
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
