import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { CloseIcon, EyeIcon, EyeOffIcon, DownloadIcon } from '~/shared/components/ui/icons';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { rosterHttpService } from '~/shared/lib/http/roster-http-service';
import { serializeRoster } from '~/shared/lib/offline/roster-serializer';

/**
 * Admin "Export offline roster" action (offline-device-provisioning spec).
 * A DEDICATED component (design's File Changes table + orchestrator
 * resolution) rather than inline in `user-list.tsx`, keeping the list page
 * thin.
 *
 * UX: the export action opens a POPUP (password + Confirm/Close), mirroring
 * the import-roster flow's password entry instead of an inline form.
 *
 * WU14 correction: `GET /v1/storeusers/{storeId}/offline-roster` DOES exist
 * server-side — `StoreUsersController.cs` implements exactly this route.
 */
export function RosterExportPanel() {
  const intl = useIntl();
  const isOnline = useOnlineStatus();
  // Selector hook, NOT `getState()` (design correction #4 — export.tsx:16 /
  // payment-banner.tsx:21 convention).
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [open, setOpen] = useState(false);
  const [master, setMaster] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const disabled = !isOnline || !storeId;

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!master.trim()) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_EMPTY_PASSWORD' }));
      return;
    }

    setBusy(true);
    try {
      const bundle = await rosterHttpService.getOfflineRoster(storeId);
      const payload = await serializeRoster(bundle, master, storeId);

      // Delivery: `export.tsx:61-67`'s Blob→createObjectURL→anchor→revoke
      // pattern, inlined verbatim (design D7 explicitly rejects extracting a
      // shared `downloadBlob()` helper — it would touch the already-verified
      // sync export path for DRY alone).
      const blob = new Blob([payload], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roster-${storeId}.smcabundle`;
      a.click();
      URL.revokeObjectURL(url);

      setOpen(false);
      setMaster('');
    } catch {
      setError(intl.formatMessage({ id: 'USERS.ERROR' }));
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setMaster('');
    setError('');
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <DownloadIcon className="h-4 w-4" />
        {intl.formatMessage({ id: 'USERS.EXPORT_ROSTER' })}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={intl.formatMessage({ id: 'USERS.EXPORT_ROSTER' })}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="w-full max-w-md">
            <Card
              title={
                <div className="flex items-center justify-between">
                  <span>{intl.formatMessage({ id: 'USERS.EXPORT_ROSTER' })}</span>
                  <button
                    onClick={handleClose}
                    className="text-text-muted hover:text-text"
                    aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
                  >
                    <CloseIcon />
                  </button>
                </div>
              }
            >
              <form onSubmit={handleConfirm} className="space-y-3">
                <div>
                  <label htmlFor="roster-export-master" className="mb-1 block text-sm font-medium text-text">
                    {intl.formatMessage({ id: 'PROVISION.MASTER_PASSWORD_LABEL' })}
                  </label>
                  <div className="relative">
                    <input
                      id="roster-export-master"
                      type={showPassword ? 'text' : 'password'}
                      value={master}
                      onChange={(e) => setMaster(e.target.value)}
                      disabled={busy}
                      aria-label={intl.formatMessage({ id: 'PROVISION.MASTER_PASSWORD_LABEL' })}
                      className="w-full rounded border border-border px-3 py-2 pr-10 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={intl.formatMessage({
                        id: showPassword ? 'SYNC.HIDE_PASSWORD' : 'SYNC.SHOW_PASSWORD',
                      })}
                      className="absolute inset-y-0 right-0 flex items-center px-2 text-text-muted hover:text-text"
                    >
                      {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {error && <InfoBox variant="danger">{error}</InfoBox>}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="fab" onClick={handleClose}>
                    <CloseIcon />
                    {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
                  </Button>
                  <Button type="submit" variant="primary" disabled={busy}>
                    {intl.formatMessage({ id: 'GENERAL.CONFIRM' })}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

export default RosterExportPanel;
