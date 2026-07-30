import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { resellerHttpService } from '~/admin/resellers/lib/services/reseller-http-service';
import { ResellerCardList } from '~/admin/resellers/components/reseller-card-list';
import type { ReSeller } from '@store-mgmt/domain';

export const clientLoader = superAdminLoader;

export function ResellerListPage() {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();
  const [resellers, setResellers] = useState<ReSeller[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const loadResellers = useCallback(async () => {
    try {
      const res = await resellerHttpService.listResellers();
      setResellers(res.data);
      setError(undefined);
    } catch {
      setError(formatMessage({ id: 'RESELLERS.ERROR' }));
    }
  }, [formatMessage]);

  useEffect(() => {
    loadResellers();
  }, [loadResellers]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {formatMessage({ id: 'RESELLERS.LIST_TITLE' })}
        </h1>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <ResellerCardList
        resellers={resellers}
        onCreate={() => navigate('/admin/resellers/create')}
        onEdit={(id) => navigate(`/admin/resellers/edit/${id}`)}
      />
    </div>
  );
}

export default ResellerListPage;
