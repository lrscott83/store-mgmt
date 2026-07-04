import { useState, useRef } from 'react';
import { useIntl } from 'react-intl';
import type { SyncResult } from '~/sync/lib/services/data-synchronizer-service';
import { WrongPasswordError, CorruptFileError } from '~/sync/lib/services/data-serializer-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';

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
  const [showPassword, setShowPassword] = useState(false);
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
        // Non-typed/unexpected error: never surface a raw err.message, always
        // a translated catch-all (Stage 6 Slice B — Translated Error Fallback).
        setError(intl.formatMessage({ id: 'SYNC.ERROR_UNEXPECTED' }));
      }
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
          <input
            id="import-file"
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            disabled={busy}
            className="mt-1 block w-full text-sm text-text disabled:opacity-60"
          />
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
          {busy
            ? intl.formatMessage({ id: 'SYNC.IMPORTING' })
            : intl.formatMessage({ id: 'SYNC.IMPORT_BUTTON' })}
        </Button>

        {result && (
          <InfoBox variant="primary">
            <h2 className="mb-2 text-sm font-semibold">
              {intl.formatMessage({ id: 'SYNC.SUCCESS_TITLE' })}
            </h2>
            <ul className="space-y-1 text-sm">
              {result.merges.map((r) => (
                <li key={r.entity}>
                  <span className="font-medium">{r.entity}</span>:{' '}
                  {intl.formatMessage({ id: 'SYNC.RESULT_INSERTED' }, { count: r.inserted })},{' '}
                  {intl.formatMessage({ id: 'SYNC.RESULT_UPDATED' }, { count: r.updated })}
                </li>
              ))}
            </ul>
          </InfoBox>
        )}
      </form>
    </Card>
  );
}

export default ImportForm;
