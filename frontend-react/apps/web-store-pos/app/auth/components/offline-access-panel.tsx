import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { confirmDialog } from '~/shared/lib/blocking-alert';
import { showToastError, showToastSuccess } from '~/shared/lib/toast';
import { ImportRosterModal } from './import-roster-modal';

type RosterState = 'unknown' | 'provisioned' | 'absent';

/**
 * The login screen's offline-access control: one button, which one depending
 * on whether this device is activated.
 *
 * Every `offline/` and `storage/` module is reached through a dynamic
 * `import()` so `login.tsx` keeps zero static offline imports (design D4).
 * Reading roster state at render is the ONE deliberate exception to the
 * "an unprovisioned device is byte-for-byte unchanged" invariant: the button
 * cannot be chosen without the state it depends on.
 */
export function OfflineAccessPanel() {
  const intl = useIntl();
  const [rosterState, setRosterState] = useState<RosterState>('unknown');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { isRosterProvisioned } = await import('~/shared/lib/offline/roster-store');
        if (!cancelled) {
          setRosterState(isRosterProvisioned() ? 'provisioned' : 'absent');
        }
      } catch (err) {
        // The panel cannot know whether this device is activated without
        // this module, and guessing (rendering either button) would be
        // worse than rendering none — so rosterState deliberately stays
        // 'unknown' here instead of being "fixed" into a guess.
        console.error('[offline-access-panel] failed to load roster-store module', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDisable() {
    let modules: [
      typeof import('~/shared/lib/offline/roster-store'),
      typeof import('~/shared/lib/storage/device-dek-table'),
    ];
    try {
      modules = await Promise.all([
        import('~/shared/lib/offline/roster-store'),
        import('~/shared/lib/storage/device-dek-table'),
      ]);
    } catch {
      showToastError(intl.formatMessage({ id: 'OFFLINE_ACCESS.ERROR_UNAVAILABLE' }));
      return;
    }
    const [{ isEncryptionProvisioned, clearRoster }, { hasDeviceDekWrap }] = modules;

    // design D6: clearing the roster on a device that holds encrypted data
    // and NO device-level key copy makes that data permanently unreadable.
    // The persist that normally creates that copy is best-effort, so its
    // absence is rare, not impossible. Warn harder; never block.
    const dataAtRisk = isEncryptionProvisioned() && !hasDeviceDekWrap();

    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'OFFLINE_ACCESS.DISABLE_TITLE' }),
      message: intl.formatMessage({
        id: dataAtRisk
          ? 'OFFLINE_ACCESS.DISABLE_MESSAGE_DATA_LOSS'
          : 'OFFLINE_ACCESS.DISABLE_MESSAGE',
      }),
      confirmButtonText: intl.formatMessage({ id: 'OFFLINE_ACCESS.DISABLE_CONFIRM' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.CANCEL' }),
    });
    if (!confirmed) return;

    // The anti-replay marker survives this on purpose (roster-store.ts:174-181)
    // — which is exactly what the confirmation just told the user.
    clearRoster();
    setRosterState('absent');
    showToastSuccess(intl.formatMessage({ id: 'OFFLINE_ACCESS.DISABLED' }));
  }

  function handleImported() {
    setModalOpen(false);
    setRosterState('provisioned');
    showToastSuccess(intl.formatMessage({ id: 'OFFLINE_ACCESS.ENABLED' }));
  }

  // Renders nothing until the dynamic import resolves. The panel sits at the
  // very bottom of the login screen, so nothing above it shifts.
  if (rosterState === 'unknown') return null;

  return (
    <div className="mt-4 text-center">
      {rosterState === 'absent' ? (
        <Button type="button" variant="outline" onClick={() => setModalOpen(true)}>
          {intl.formatMessage({ id: 'OFFLINE_ACCESS.ENABLE_BUTTON' })}
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={handleDisable}>
          {intl.formatMessage({ id: 'OFFLINE_ACCESS.DISABLE_BUTTON' })}
        </Button>
      )}

      {modalOpen && (
        <ImportRosterModal onImported={handleImported} onCancel={() => setModalOpen(false)} />
      )}
    </div>
  );
}

export default OfflineAccessPanel;
