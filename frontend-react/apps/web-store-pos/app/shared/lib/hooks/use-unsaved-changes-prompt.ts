import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import messages from '~/shared/lib/i18n/es';

export function useUnsavedChangesPrompt(isDirty: boolean): void {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      // Native window.confirm() only supports one string (OK/Cancel) — scoped
      // simplification of UnsavedChangesDialog's 3-option SweetAlert, same
      // Spanish message (Angular can-deactivate.guard.ts parity).
      const confirmed = window.confirm(messages['GENERAL.WIZARD_DIRTY_MESSAGE']);
      if (confirmed) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker]);
}
