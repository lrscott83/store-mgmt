import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { StoreSyncFileUploadResult } from '~/sync/lib/services/store-sync-file-http-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';
import { httpErrorKey } from '~/shared/lib/http/http-error';

export interface SyncServerUploadFormProps {
  /** Builds and uploads one archive per store, in memory. Never writes to disk. */
  onUpload: (password: string) => Promise<StoreSyncFileUploadResult[]>;
  /** Store display name, resolved from the session's store list. */
  storeName: (storeId: string) => string;
}

const RESULT_STYLES: Record<StoreSyncFileUploadResult['status'], string> = {
  uploaded: 'text-success',
  skipped: 'text-text-muted',
  failed: 'text-danger',
};

const RESULT_LABEL_KEYS: Record<StoreSyncFileUploadResult['status'], string> = {
  uploaded: 'SYNC_SERVER.UPLOADED',
  skipped: 'SYNC_SERVER.SKIPPED',
  failed: 'SYNC_SERVER.FAILED',
};

export function SyncServerUploadForm({ onUpload, storeName }: SyncServerUploadFormProps) {
  const intl = useIntl();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<StoreSyncFileUploadResult[] | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!password.trim()) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_EMPTY_PASSWORD' }));
      return;
    }

    setBusy(true);
    setResults(null);
    try {
      setResults(await onUpload(password));
    } catch (err) {
      setError(intl.formatMessage({ id: httpErrorKey(err, 'SYNC_SERVER.LOAD_ERROR') }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="tight" title={intl.formatMessage({ id: 'SYNC_SERVER.UPLOAD_TITLE' })}>
      <form onSubmit={handleSubmit} className="space-y-4 p-2">
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'SYNC_SERVER.UPLOAD_HELP' })}
        </p>

        <div>
          <label htmlFor="sync-server-password" className="block text-sm font-medium text-text">
            {intl.formatMessage({ id: 'SYNC.PASSWORD_LABEL' })}
          </label>
          <div className="relative mt-1">
            <input
              id="sync-server-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              autoComplete="new-password"
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
              {showPassword ? (
                <EyeOffIcon className="h-5 w-5" />
              ) : (
                <EyeIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {error && <InfoBox variant="danger">{error}</InfoBox>}

        <Button type="submit" variant="fab" disabled={busy}>
          {intl.formatMessage({
            id: busy ? 'SYNC_SERVER.UPLOADING' : 'SYNC_SERVER.UPLOAD_BUTTON',
          })}
        </Button>

        {results !== null && (
          <div className="space-y-2" data-testid="sync-upload-results">
            <h4 className="text-sm font-medium text-text">
              {intl.formatMessage({ id: 'SYNC_SERVER.UPLOAD_RESULTS_TITLE' })}
            </h4>
            {results.length === 0 ? (
              <p className="text-sm text-text-muted">
                {intl.formatMessage({ id: 'SYNC_SERVER.NO_STORES' })}
              </p>
            ) : (
              <ul className="space-y-1">
                {results.map((result) => (
                  <li
                    key={result.storeId}
                    data-testid={`sync-upload-result-${result.storeId}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-text">{storeName(result.storeId)}</span>
                    <span className={RESULT_STYLES[result.status]}>
                      {intl.formatMessage({ id: RESULT_LABEL_KEYS[result.status] })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}

export default SyncServerUploadForm;
