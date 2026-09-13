// Focus for a modal panel (the lobby's sheets and rosters). On open it
// remembers what had focus and moves focus into the panel; Tab and Shift+Tab
// go round the panel's own controls instead of wandering onto the page
// behind it; on close focus goes back where it was, so a keyboard user lands
// on the button that opened it rather than at the top of the document.
import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function controlsIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // Rendered and not tucked away: a display:none control has no box.
    (el) => el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]'),
  );
}

export function useDialogFocus(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // A field that asked for autofocus keeps it; otherwise the first control.
    if (!panel.contains(document.activeElement)) (controlsIn(panel)[0] ?? panel).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = controlsIn(panel);
      if (list.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !panel.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !panel.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [ref]);
}
