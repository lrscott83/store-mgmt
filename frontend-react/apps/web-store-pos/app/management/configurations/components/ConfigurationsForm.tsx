import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { SystemConfiguration } from '@store-mgmt/domain';

interface ConfigurationsFormProps {
  initialValues: SystemConfiguration[];
  isOnline: boolean;
  isLoading?: boolean;
  isDegraded?: boolean;
  onSubmit: (values: SystemConfiguration[]) => void;
  error?: string;
}

export function ConfigurationsForm({
  initialValues,
  isOnline,
  isDegraded,
  onSubmit,
  error,
}: ConfigurationsFormProps) {
  const intl = useIntl();
  const [values, setValues] = useState<SystemConfiguration[]>(initialValues);

  function handleValueChange(id: string, newValue: string) {
    setValues((prev) =>
      prev.map((cfg) => (cfg.id === id ? { ...cfg, value: newValue } : cfg))
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'CONFIGURATIONS.TITLE' })}
      </h1>

      {isDegraded && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
          {intl.formatMessage({ id: 'CONFIGURATIONS.DEGRADED_NOTICE' })}
        </p>
      )}

      {!isOnline && (
        <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded px-3 py-2">
          {intl.formatMessage({ id: 'CONFIGURATIONS.OFFLINE_NOTICE' })}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {values.length === 0 ? (
        <p className="text-sm text-gray-500">
          {intl.formatMessage({ id: 'CONFIGURATIONS.EMPTY' })}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {values.map((cfg) => (
            <div key={cfg.id} className="flex items-center gap-4">
              <span className="w-48 text-sm font-medium text-gray-700">{cfg.name}</span>
              <input
                type="text"
                value={cfg.value}
                onChange={(e) => handleValueChange(cfg.id, e.target.value)}
                aria-label={intl.formatMessage(
                  { id: 'CONFIGURATIONS.VALUE_LABEL' },
                  { name: cfg.name }
                )}
                className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={!isOnline}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {intl.formatMessage({ id: 'CONFIGURATIONS.SAVE' })}
          </button>
        </form>
      )}
    </div>
  );
}

export default ConfigurationsForm;
