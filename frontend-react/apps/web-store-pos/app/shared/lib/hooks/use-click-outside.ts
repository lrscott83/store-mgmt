import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Closes a dropdown/panel when a `mousedown` happens outside the given ref's
 * element. Used by header dropdowns (user menu, cart panel) to match
 * standard dismiss-on-outside-click behavior.
 */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (ref.current && !ref.current.contains(target)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [ref, onClose]);
}
