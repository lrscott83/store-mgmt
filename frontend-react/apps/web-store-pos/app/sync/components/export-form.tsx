import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';

export interface ExportFormProps {
  /** Called with the typed password. Should return the raw encrypted payload bytes. */
  onExport: (password: string) => Promise<Uint8Array>;
}

export function ExportForm({ onExport }: ExportFormProps) {
  const intl = useIntl();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    } catch {
      // Non-typed/unexpected error: never surface a raw err.message, always
      // a translated catch-all (Stage 6 Slice B — Translated Error Fallback).
      setError(intl.formatMessage({ id: 'SYNC.ERROR_UNEXPECTED' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={intl.formatMessage({ id: 'SYNC.EXPORT_TITLE' })}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="export-password" className="block text-sm font-medium text-text">
            {intl.formatMessage({ id: 'SYNC.PASSWORD_LABEL' })}
          </label>
          <div className="relative mt-1">
            <input
              id="export-password"
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
            ? intl.formatMessage({ id: 'SYNC.EXPORTING' })
            : intl.formatMessage({ id: 'SYNC.EXPORT_BUTTON' })}
        </Button>
      </form>
    </Card>
  );
}

export default ExportForm;
