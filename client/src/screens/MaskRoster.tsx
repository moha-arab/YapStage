// THE MASK ROSTER. Tap your own mask in the lobby and the four walk out, the
// same takeover the bot roster uses. It replaced the Locker screen on
// 2026-09-04 (his call: "press on your character in the lobby and change
// your skin"). The camera/mask toggle that lived in the locker is gone with
// it: every room starts masked, and only a friend room offers the camera.
import { useEffect, type CSSProperties } from 'react';
import { useI18n } from '../i18n';
import Mask, { MASK_IDS } from '../Mask';

interface Props {
  picked: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

export default function MaskRoster({ picked, onPick, onClose }: Props) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lb-roster" role="dialog" aria-modal="true" aria-label={t('lbMaskTitle')} onClick={onClose}>
      <div className="lb-roster-panel lb-roster-masks" onClick={(e) => e.stopPropagation()}>
        <header className="lb-roster-hd">
          <h2 className="lb-roster-t">{t('lbMaskTitle')}</h2>
          <p className="lb-roster-sub">{t('lbMaskSub')}</p>
          <button className="lb-roster-x" onClick={onClose} aria-label={t('lbRosterClose')}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="lb-roster-grid lb-roster-grid-masks">
          {MASK_IDS.map((id, i) => (
            <button
              key={id}
              className={`lb-card lb-card-mask ${picked === id ? 'lb-card-on' : ''}`}
              style={{ '--i': i } as CSSProperties}
              onClick={() => onPick(id)}
            >
              <div className="lb-card-art">
                <Mask id={id} size="100%" bare />
              </div>
              <div className="lb-card-name">{t(`mask_${id}`)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
