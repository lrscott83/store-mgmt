import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { SyncResult } from '~/sync/lib/services/data-synchronizer-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { FileInput } from '~/shared/components/ui/file-input';
import { InfoBox } from '~/shared/components/ui/info-box';
import { EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';

export interface ImportFormProps {
  /**
   * Called with the selected file and typed password.
   * Should decrypt, parse, and run the synchronizer.
   * Should throw WrongPasswordError or CorruptFileError on failure.
   * Resolves with a SyncResult even when the domain-validated merge itself
   * fails (`succeeded: false` + typed `errors`) — the synchronizer never
   * throws for merge-validation failures, only the serializer's decrypt
   * step throws (WrongPasswordError/CorruptFileError, before any write).
   */
  onImport: (file: File, password: string) => Promise<SyncResult>;
}

export function ImportForm({ onImport }: ImportFormProps) {
  const intl = useIntl();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handleFileChange(file: File | null) {
    setSelectedFile(file);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!selectedFile) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_NO_FILE' }));
      return;
    }

    if (!password.trim()) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_EMPTY_PASSWORD' }));
      return;
    }

    setBusy(true);
    try {
      const syncResult: SyncResult = await onImport(selectedFile, password);
      if (syncResult.succeeded) {
        // Angular shows only a single success toast — no per-entity counts, no title.
        showToastSuccess(intl.formatMessage({ id: 'SYNC.IMPORT_SUCCESS' }));
      } else {
        // Angular parity (receive-data.component.ts:48-54): a blocking error Swal (icon
        // 'error', GENERAL.RESPONSE.ERROR_TITLE), text = the first domain error, else the
        // generic message — not an inline banner.
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
          syncResult.errors[0]?.message ??
            intl.formatMessage({ id: 'SYNC.IMPORT_ERROR' }),
        );
      }
    } catch {
      // Angular parity (receive-data.component.ts:55-59): same blocking error Swal shape.
      // Angular collapses every failure (wrong password, corrupt file, unexpected) into one
      // generic message; never leak a raw err.message.
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
        intl.formatMessage({ id: 'SYNC.IMPORT_ERROR' }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={intl.formatMessage({ id: 'SYNC.IMPORT_TITLE' })}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="import-file" className="block text-sm font-medium text-text">
            {intl.formatMessage({ id: 'SYNC.FILE_LABEL' })}
          </label>
          <div className="mt-1">
            <FileInput
              id="import-file"
              accept=".zip"
              onFileChange={handleFileChange}
              disabled={busy}
            />
          </div>
        </div>

        <div>
          <label htmlFor="import-password" className="block text-sm font-medium text-text">
            {intl.formatMessage({ id: 'SYNC.PASSWORD_LABEL' })}
          </label>
          <div className="relative mt-1">
            <input
              id="import-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          {intl.formatMessage({ id: 'SYNC.IMPORT_BUTTON' })}
        </Button>
      </form>
    </Card>
  );
}

export default ImportForm;
