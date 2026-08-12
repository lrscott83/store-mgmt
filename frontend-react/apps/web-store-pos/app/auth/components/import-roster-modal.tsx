import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { FileInput } from '~/shared/components/ui/file-input';
import { InfoBox } from '~/shared/components/ui/info-box';
import { EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';

interface ImportRosterModalProps {
  /** Fired only after the roster is actually stored. */
  onImported: () => void;
  onCancel: () => void;
}

/**
 * Activation dialog for the login screen. Asks for the file and the password
 * only — the store id `deserializeRoster` needs is recovered from the
 * filename by `importRosterFile` (design D1), so the user is never asked for
 * an identifier they have no way of knowing.
 *
 * Overlay shape follows `shared/components/unsaved-changes-dialog.tsx`.
 */
export function ImportRosterModal({ onImported, onCancel }: ImportRosterModalProps) {
  const intl = useIntl();
  const [file, setFile] = useState<File | null>(null);
  const [master, setMaster] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!file) {
      setError(intl.formatMessage({ id: 'OFFLINE_ACCESS.ERROR_NO_FILE' }));
      return;
    }
    if (!master.trim()) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_EMPTY_PASSWORD' }));
      return;
    }

    setBusy(true);
    // Dynamic import: this is the login screen, and a device that never
    // activates offline access must not pay for the offline modules
    // (design D4).
    const { importRosterFile, rosterImportErrorMessageId } = await import(
      '~/shared/lib/offline/roster-import'
    );
    try {
      await importRosterFile({ file, master });
      onImported();
    } catch (err: unknown) {
      // Stay open on failure — the chosen file and typed password survive,
      // so the user retries the one thing that was wrong.
      setBusy(false);
      setError(intl.formatMessage({ id: rosterImportErrorMessageId(err) }));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 text-left">
        <h3 className="text-base font-semibold text-gray-800 mb-2">
          {intl.formatMessage({ id: 'OFFLINE_ACCESS.MODAL_TITLE' })}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {intl.formatMessage({ id: 'OFFLINE_ACCESS.MODAL_INTRO' })}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label
              htmlFor="offline-access-file"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {intl.formatMessage({ id: 'OFFLINE_ACCESS.FILE_LABEL' })}
            </label>
            <FileInput
              id="offline-access-file"
              accept=".smcabundle"
              onFileChange={setFile}
              disabled={busy}
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="offline-access-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {intl.formatMessage({ id: 'OFFLINE_ACCESS.PASSWORD_LABEL' })}
            </label>
            <div className="relative">
              <input
                id="offline-access-password"
                type={showPassword ? 'text' : 'password'}
                value={master}
                onChange={(e) => setMaster(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={intl.formatMessage({
                  id: showPassword ? 'SYNC.HIDE_PASSWORD' : 'SYNC.SHOW_PASSWORD',
                })}
                className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeIcon className="h-5 w-5" /> : <EyeOffIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4">
              <InfoBox variant="danger">{error}</InfoBox>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {intl.formatMessage({ id: 'OFFLINE_ACCESS.SUBMIT' })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ImportRosterModal;
