import { useState, useRef } from 'react';
import { useIntl } from 'react-intl';
import type { SyncResult } from '~/sync/lib/services/data-synchronizer-service';
import { WrongPasswordError, CorruptFileError } from '~/sync/lib/services/data-serializer-service';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SyncResult | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null);
    setError('');
    setResult(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

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
      const syncResult = await onImport(selectedFile, password);
      if (syncResult.succeeded) {
        setResult(syncResult);
      } else {
        setError(syncResult.errors.map((e) => e.message).join(' '));
      }
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        setError(intl.formatMessage({ id: 'SYNC.ERROR_WRONG_PASSWORD' }));
      } else if (err instanceof CorruptFileError) {
        setError(intl.formatMessage({ id: 'SYNC.ERROR_CORRUPT_FILE' }));
      } else {
        setError(err instanceof Error ? err.message : intl.formatMessage({ id: 'GENERAL.ERROR' }));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="import-file"
          className="block text-sm font-medium text-gray-700"
        >
          {intl.formatMessage({ id: 'SYNC.FILE_LABEL' })}
        </label>
        <input
          id="import-file"
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          disabled={busy}
          className="mt-1 block w-full text-sm text-gray-700 disabled:opacity-60"
        />
      </div>

      <div>
        <label
          htmlFor="import-password"
          className="block text-sm font-medium text-gray-700"
        >
          {intl.formatMessage({ id: 'SYNC.PASSWORD_LABEL' })}
        </label>
        <input
          id="import-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {busy
          ? intl.formatMessage({ id: 'SYNC.IMPORTING' })
          : intl.formatMessage({ id: 'SYNC.IMPORT_BUTTON' })}
      </button>

      {result && (
        <div className="rounded border bg-green-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-green-800">
            {intl.formatMessage({ id: 'SYNC.SUCCESS_TITLE' })}
          </h2>
          <ul className="space-y-1 text-sm text-green-700">
            {result.merges.map((r) => (
              <li key={r.entity}>
                <span className="font-medium">{r.entity}</span>:{' '}
                {intl.formatMessage({ id: 'SYNC.RESULT_INSERTED' }, { count: r.inserted })},{' '}
                {intl.formatMessage({ id: 'SYNC.RESULT_UPDATED' }, { count: r.updated })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

export default ImportForm;
