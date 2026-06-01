import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { configurationHttpService } from '~/management/configurations/lib/services/configuration-http-service';
import { ConfigurationsForm } from '~/management/configurations/components/ConfigurationsForm';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import type { SystemConfiguration } from '@store-mgmt/domain';

// Platform-global: no store-scope; empty string key (DC8)
const configRepository = new BaseRepository<SystemConfiguration>('configurations', []);
const PLATFORM_KEY = '';

export const loader = adminFeatureLoader([EFeatures.Configurations]);

export function ConfigurationsPage() {
  const intl = useIntl();
  const isOnline = useOnlineStatus();

  // DC5: null = not yet resolved (LOADING gate); empty array = resolved empty
  const [configs, setConfigs] = useState<SystemConfiguration[] | null>(null);
  const [isDegraded, setIsDegraded] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOnline) {
      const cached = configRepository.getAll(PLATFORM_KEY);
      setConfigs(Array.from(cached.values()));
      setIsDegraded(true);
      return;
    }

    setIsDegraded(false);
    configurationHttpService
      .listConfigurations()
      .then((res) => {
        setConfigs(res.data);
        const map = new Map(res.data.map((c) => [c.id, c]));
        configRepository.save(PLATFORM_KEY, map);
        setError('');
      })
      .catch(() => {
        setError(intl.formatMessage({ id: 'CONFIGURATIONS.SAVE_ERROR' }));
        setConfigs([]);
      });
  }, [isOnline, intl]);

  async function handleSubmit(values: SystemConfiguration[]) {
    if (!isOnline) return;
    setSuccess('');
    setError('');
    try {
      await configurationHttpService.updateConfigurations(values);
      setSuccess(intl.formatMessage({ id: 'CONFIGURATIONS.SAVE_SUCCESS' }));
    } catch {
      setError(intl.formatMessage({ id: 'CONFIGURATIONS.SAVE_ERROR' }));
    }
  }

  // DC5: LOADING gate — form must NOT mount until configs resolved
  if (configs === null) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-500">
          {intl.formatMessage({ id: 'CONFIGURATIONS.LOADING' })}
        </p>
      </div>
    );
  }

  return (
    <>
      {success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mx-4 mt-4">
          {success}
        </p>
      )}
      <ConfigurationsForm
        initialValues={configs}
        isOnline={isOnline}
        isDegraded={isDegraded}
        onSubmit={handleSubmit}
        error={error}
      />
    </>
  );
}

export default ConfigurationsPage;
