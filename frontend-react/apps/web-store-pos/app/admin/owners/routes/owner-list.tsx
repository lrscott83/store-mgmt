import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { ownerHttpService } from '~/admin/owners/lib/services/owner-http-service';
import { OwnerCardList } from '~/admin/owners/components/owner-card-list';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import type { Owner } from '@store-mgmt/domain';

export const clientLoader = resellerFeatureLoader([EFeatures.Owners]);

export function OwnerListPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  // "paid plan only" is the default visibility: an owner counts as on a paid plan
  // when at least one store has a calculable next payment date (`nextDueDate`).
  const [filter, setFilter] = useState<'paid-plan-only' | 'all'>('paid-plan-only');

  const loadOwners = useCallback(async () => {
    try {
      const res = await ownerHttpService.listOwners();
      if (!res.succeeded) {
        setError(intl.formatMessage({ id: 'OWNER.ERROR' }));
        return;
      }
      setOwners(res.data);
      setError(undefined);
    } catch (error) {
      setError(intl.formatMessage({ id: httpErrorKey(error, 'OWNER.ERROR') }));
    }
  }, [intl]);

  useEffect(() => {
    loadOwners();
  }, [loadOwners]);

  async function handleDelete(id: string) {
    try {
      await ownerHttpService.deleteOwner(id);
      await loadOwners();
    } catch (error) {
      setError(intl.formatMessage({ id: httpErrorKey(error, 'OWNER.ERROR') }));
    }
  }

  const visibleOwners = filter === 'paid-plan-only'
    ? owners.filter((o) => o.storeModules.some((m) => m.nextDueDate !== null))
    : owners;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'OWNER.LIST_TITLE' })}
        </h1>
        <Button variant="fab" onClick={() => navigate('/admin/owners/create')}>
          <PlusIcon />
          {intl.formatMessage({ id: 'GENERAL.ADD' })}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor="owner-visibility-filter" className="text-sm font-medium text-text">
          {intl.formatMessage({ id: 'OWNER.FILTER_LABEL' })}
        </label>
        <select
          id="owner-visibility-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'paid-plan-only' | 'all')}
          className="rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="paid-plan-only">
            {intl.formatMessage({ id: 'OWNER.PAID_PLAN_ONLY' })}
          </option>
          <option value="all">
            {intl.formatMessage({ id: 'OWNER.ALL_OWNERS' })}
          </option>
        </select>
      </div>

      <OwnerCardList
        owners={visibleOwners}
        onEdit={(id) => navigate(`/admin/owners/edit/${id}`)}
        onDelete={handleDelete}
      />
    </div>
  );
}

export default OwnerListPage;