import { useEffect, useRef } from 'react';

/** While `active`, Escape calls `onEscape` and is stopped before anything else
 * sees it. The ui Drawer closes on a bubble-phase `keydown` listener on
 * `document`; React's synthetic stopPropagation can't reach that, but a
 * capture-phase listener on `document` runs first and can stop it. Used by the
 * setup drawers so Escape in a form returns to the list instead of closing
 * the drawer. */
export function useEscapeCapture(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      handler.current();
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [active]);
}
