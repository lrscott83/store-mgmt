import { useState } from 'react';
import { Link } from 'react-router';
import { useIntl } from 'react-intl';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { FileInput } from '~/shared/components/ui/file-input';
import { InfoBox } from '~/shared/components/ui/info-box';
import { EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';
import { deserializeRoster } from '~/shared/lib/offline/roster-serializer';
import { importRoster } from '~/shared/lib/offline/roster-store';

// NOTE: no `clientLoader` here (design D-note, verified against
// `auth-layout.tsx`) — a `guestOnlyLoader` would redirect an already
// authenticated admin away from this route, but provisioning a new device
// must work regardless of the CURRENT device's auth state.

/**
 * Design D4 — dispatches by `err.name`, mirroring `login.tsx`'s
 * `offlineErrorMessageId`. Each of the 4 import failure modes
 * (`offline-device-provisioning` spec) gets its own distinct message id.
 */
function provisionErrorMessageId(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  switch (name) {
    case 'WrongPasswordError':
      return 'PROVISION.ERROR_WRONG_PASSWORD';
    case 'CorruptFileError':
      return 'PROVISION.ERROR_CORRUPT_FILE';
    case 'ExpiredBundleError':
      return 'PROVISION.ERROR_EXPIRED';
    case 'ReplayBundleError':
      return 'PROVISION.ERROR_REPLAY';
    default:
      return 'PROVISION.ERROR_CORRUPT_FILE';
  }
}

export function Provision() {
  const intl = useIntl();
  const [file, setFile] = useState<File | null>(null);
  const [storeId, setStoreId] = useState('');
  const [master, setMaster] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!file) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_NO_FILE' }));
      return;
    }
    if (!master.trim()) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_EMPTY_PASSWORD' }));
      return;
    }

    setBusy(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const payload = new Uint8Array(arrayBuffer);
      const bundle = await deserializeRoster(payload, master, storeId);
      // Throws ExpiredBundleError/ReplayBundleError/InvalidBundleError; on
      // success the roster is persisted and `isRosterProvisioned()` becomes
      // true (offline-device-provisioning spec).
      importRoster(bundle);
      setSuccess(true);
    } catch (err: unknown) {
      setError(intl.formatMessage({ id: provisionErrorMessageId(err) }));
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <Card padding="tight" title={intl.formatMessage({ id: 'PROVISION.TITLE' })}>
        <div className="space-y-4">
          <InfoBox variant="primary">
            {intl.formatMessage({ id: 'PROVISION.SUCCESS' })}
          </InfoBox>
          <Link to="/login" className="text-cyan-600 hover:text-cyan-700 font-medium text-sm">
            {intl.formatMessage({ id: 'AUTH.SIGN_IN' })}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="tight" title={intl.formatMessage({ id: 'PROVISION.TITLE' })}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="provision-file" className="block text-sm font-medium text-text">
            {intl.formatMessage({ id: 'PROVISION.FILE_LABEL' })}
          </label>
          <div className="mt-1">
            <FileInput
              id="provision-file"
              accept=".smcabundle"
              onFileChange={setFile}
              disabled={busy}
            />
          </div>
        </div>

        <div>
          <label htmlFor="provision-store-id" className="block text-sm font-medium text-text">
            {intl.formatMessage({ id: 'PROVISION.STORE_ID_LABEL' })}
          </label>
          <input
            id="provision-store-id"
            type="text"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            disabled={busy}
            className="mt-1 block w-full rounded border border-border px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="provision-master" className="block text-sm font-medium text-text">
            {intl.formatMessage({ id: 'PROVISION.MASTER_PASSWORD_LABEL' })}
          </label>
          <div className="relative mt-1">
            <input
              id="provision-master"
              type={showPassword ? 'text' : 'password'}
              value={master}
              onChange={(e) => setMaster(e.target.value)}
              disabled={busy}
              className="block w-full rounded border border-border px-3 py-2 pr-10 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
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

        <Button type="submit" variant="fab" disabled={busy}>
          {intl.formatMessage({ id: 'PROVISION.SUBMIT' })}
        </Button>
      </form>
    </Card>
  );
}

export default Provision;
