// A sheet over the lobby, in the bot roster's modal look. The match settings
// (bots and friends) and the live list (watch) open in one of these from the
// go button (his call 2026-09-12), so nothing tab-specific ever sits on the
// stage and every tab keeps Play Online's layout.
import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { useDialogFocus } from '../useDialogFocus';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function LobbySheet({ title, onClose, children }: Props) {
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

  return (
    <div className="lb-roster" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="lb-roster-panel lb-sheet" ref={panel} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="lb-roster-hd">
          <h2 className="lb-roster-t">{title}</h2>
          <button className="lb-roster-x" onClick={onClose} aria-label={t('lbRosterClose')}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
