import { useState } from 'react';
import { useIntl } from 'react-intl';

export interface ExportFormProps {
  /** Called with the typed password. Should return the raw encrypted payload bytes. */
  onExport: (password: string) => Promise<Uint8Array>;
}

export function ExportForm({ onExport }: ExportFormProps) {
  const intl = useIntl();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!password.trim()) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_EMPTY_PASSWORD' }));
      return;
    }

    setBusy(true);
    try {
      await onExport(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : intl.formatMessage({ id: 'GENERAL.ERROR' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="export-password"
          className="block text-sm font-medium text-gray-700"
        >
          {intl.formatMessage({ id: 'SYNC.PASSWORD_LABEL' })}
        </label>
        <input
          id="export-password"
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
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy
          ? intl.formatMessage({ id: 'SYNC.EXPORTING' })
          : intl.formatMessage({ id: 'SYNC.EXPORT_BUTTON' })}
      </button>
    </form>
  );
}

export default ExportForm;
