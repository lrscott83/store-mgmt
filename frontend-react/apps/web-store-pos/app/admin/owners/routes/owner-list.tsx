import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { ownerHttpService } from '~/admin/owners/lib/services/owner-http-service';
import { OwnerCardList } from '~/admin/owners/components/owner-card-list';
import type { Owner } from '@store-mgmt/domain';

export const clientLoader = resellerFeatureLoader([EFeatures.Owners]);

export function OwnerListPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const loadOwners = useCallback(async () => {
    try {
      const res = await ownerHttpService.listOwners();
      setOwners(res.data);
      setError(undefined);
    } catch {
      setError(intl.formatMessage({ id: 'OWNER.ERROR' }));
    }
  }, [intl]);

  useEffect(() => {
    loadOwners();
  }, [loadOwners]);

  async function handleDelete(id: string) {
    try {
      await ownerHttpService.deleteOwner(id);
      await loadOwners();
    } catch {
      setError(intl.formatMessage({ id: 'OWNER.ERROR' }));
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'OWNER.LIST_TITLE' })}
        </h1>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <OwnerCardList
        owners={owners}
        onEdit={(id) => navigate(`/admin/owners/edit/${id}`)}
        onDelete={handleDelete}
      />
    </div>
  );
}

export default OwnerListPage;
