import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { EyeIcon, EyeOffIcon, DownloadIcon } from '~/shared/components/ui/icons';
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
 * **BLOCKED-for-verification**: `GET /v1/storeusers/{storeId}/offline-roster`
 * does not exist server-side yet (§7a, 0% implemented). This wiring is
 * buildable and unit-testable against a mocked `rosterHttpService` only.
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

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <DownloadIcon className="h-4 w-4" />
        {intl.formatMessage({ id: 'USERS.EXPORT_ROSTER' })}
      </Button>
    );
  }

  return (
    <form onSubmit={handleConfirm} className="flex items-center gap-2">
      <div className="relative">
        <input
          id="roster-export-master"
          type={showPassword ? 'text' : 'password'}
          value={master}
          onChange={(e) => setMaster(e.target.value)}
          disabled={busy}
          aria-label={intl.formatMessage({ id: 'PROVISION.MASTER_PASSWORD_LABEL' })}
          className="rounded border border-border px-3 py-1.5 pr-9 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => setShowPassword((visible) => !visible)}
          aria-label={intl.formatMessage({
            id: showPassword ? 'SYNC.HIDE_PASSWORD' : 'SYNC.SHOW_PASSWORD',
          })}
          className="absolute inset-y-0 right-0 flex items-center px-2 text-text-muted hover:text-text"
        >
          {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      </div>
      <Button type="submit" variant="primary" disabled={busy}>
        {intl.formatMessage({ id: 'GENERAL.CONFIRM' })}
      </Button>
      {error && <InfoBox variant="danger">{error}</InfoBox>}
    </form>
  );
}

export default RosterExportPanel;
