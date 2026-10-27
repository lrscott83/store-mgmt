import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { StoreSyncFileDto } from '~/sync/lib/services/store-sync-file-http-service';
import { CorruptFileError, WrongPasswordError, WrongStoreError } from '~/sync/lib/services/data-serializer-service';
import type { SyncResult } from '~/sync/lib/services/data-synchronizer-service';
import { Modal } from '~/shared/components/ui/modal';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';
import { httpErrorKey } from '~/shared/lib/http/http-error';

export interface SyncServerDownloadDialogProps {
  /** Entry being imported; null keeps the dialog closed. */
  file: StoreSyncFileDto | null;
  onClose: () => void;
  /** Downloads the archive and imports it into `file.storeId`. */
  onImport: (file: StoreSyncFileDto, password: string) => Promise<SyncResult>;
}

/**
 * Password prompt for download + direct import. The password never leaves the
 * device: it is not part of any request (S7).
 */
function importErrorKey(error: unknown): string {
  if (error instanceof WrongPasswordError) return 'SYNC_SERVER.ERROR_WRONG_PASSWORD';
  if (error instanceof CorruptFileError) return 'SYNC_SERVER.ERROR_CORRUPT';
  if (error instanceof WrongStoreError) return 'SYNC.ERROR_WRONG_STORE';
  return httpErrorKey(error, 'SYNC_SERVER.IMPORT_ERROR');
}

export function SyncServerDownloadDialog({
  file,
  onClose,
  onImport,
}: SyncServerDownloadDialogProps) {
  const intl = useIntl();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setPassword('');
    setError('');
    setBusy(false);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError('');

    if (!password.trim()) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_EMPTY_PASSWORD' }));
      return;
    }

    setBusy(true);
    try {
      const result = await onImport(file, password);
      if (!result.succeeded) {
        setError(
          result.errors[0]?.message ?? intl.formatMessage({ id: 'SYNC_SERVER.IMPORT_ERROR' }),
        );
        return;
      }
      close();
    } catch (err) {
      setError(intl.formatMessage({ id: importErrorKey(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={file !== null}
      onClose={close}
      title={intl.formatMessage({ id: 'SYNC_SERVER.DOWNLOAD_TITLE' })}
      testId="sync-download-dialog"
    >
      {file && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border border-border bg-surface-hover px-3 py-2 text-sm">
            <p className="font-medium text-text">{file.storeName}</p>
            <p className="text-xs text-text-muted">
              {file.fileName} · {file.uploadedByFullName}
            </p>
          </div>

          <p className="text-sm text-text-muted">
            {intl.formatMessage({ id: 'SYNC_SERVER.DOWNLOAD_HELP' })}
          </p>

          <div>
            <label
              htmlFor="sync-server-import-password"
              className="block text-sm font-medium text-text"
            >
              {intl.formatMessage({ id: 'SYNC.PASSWORD_LABEL' })}
            </label>
            <div className="relative mt-1">
              <input
                id="sync-server-import-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                autoComplete="off"
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

          <div className="flex justify-end">
            <Button type="submit" variant="fab" disabled={busy}>
              {intl.formatMessage({
                id: busy ? 'SYNC_SERVER.IMPORTING' : 'SYNC_SERVER.IMPORT_BUTTON',
              })}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default SyncServerDownloadDialog;
