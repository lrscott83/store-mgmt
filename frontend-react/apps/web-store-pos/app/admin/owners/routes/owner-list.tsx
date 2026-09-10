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
import type { Owner, OwnerStoreModule } from '@store-mgmt/domain';

export const clientLoader = resellerFeatureLoader([EFeatures.Owners]);

export function OwnerListPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  // Filter by plan type: 'all' shows all owners, 'not-free' excludes owners with only Gratis stores,
  // and specific plan types filter owners by their store's plan. Default is 'not-free'.
  const [filter, setFilter] = useState<string>('not-free');

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

  // Determine the primary plan type for an owner based on their store modules.
  // If any store has a nextDueDate, consider it a paid plan owner.
  // If all stores have null nextDueDate, it's a free plan owner.
  function getOwnerPlanType(owner: Owner): string {
    if (owner.storeModules.length === 0) {
      return 'Gratis'; // No stores = treat as free
    }
    const hasPaidStore = owner.storeModules.some((m) => m.nextDueDate !== null);
    if (hasPaidStore) {
      // For owners with multiple stores, we can't determine the exact plan type (Pago/Superior/VIP)
      // without additional data. We treat them as 'Pago' (paid but unspecified tier).
      return 'Pago';
    }
    return 'Gratis';
  }

  function getFilteredOwners(): Owner[] {
    if (filter === 'all') {
      return owners;
    }
    if (filter === 'not-free') {
      // Show owners who have at least one store with a paid plan (nextDueDate !== null)
      return owners.filter((o) => o.storeModules.some((m) => m.nextDueDate !== null));
    }
    // Filter by specific plan type
    const planType = filter.charAt(0).toUpperCase() + filter.slice(1);
    if (planType === 'Gratis') {
      return owners.filter((o) => o.storeModules.every((m) => m.nextDueDate === null));
    }
    // For Pago, Superior, VIP - show owners with at least one store on a paid plan
    // Note: Without planType in OwnerStoreModule, we can't distinguish between Pago/Superior/VIP
    if (['Pago', 'Superior', 'VIP'].includes(planType)) {
      return owners.filter((o) => o.storeModules.some((m) => m.nextDueDate !== null));
    }
    return owners;
  }

  function getOwnerCountByPlan(): Record<string, number> {
    const counts: Record<string, number> = {
      all: owners.length,
      'not-free': owners.filter((o) => o.storeModules.some((m) => m.nextDueDate !== null)).length,
      VIP: owners.filter((o) => o.storeModules.some((m) => m.nextDueDate !== null)).length, // Can't distinguish VIP without planType
      Superior: owners.filter((o) => o.storeModules.some((m) => m.nextDueDate !== null)).length, // Can't distinguish Superior without planType
      Pago: owners.filter((o) => o.storeModules.some((m) => m.nextDueDate !== null)).length,
      Gratis: owners.filter((o) => o.storeModules.every((m) => m.nextDueDate === null)).length,
    };
    return counts;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{intl.formatMessage({ id: 'OWNER.LIST_TITLE' })}</h1>
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

      <OwnerPlanFilterButtons
        filter={filter}
        onFilterChange={setFilter}
        ownerCountByPlan={getOwnerCountByPlan()}
        labelId="owner-visibility-filter"
      />

      <OwnerCardList
        owners={getFilteredOwners()}
        onEdit={(id) => navigate(`/admin/owners/edit/${id}`)}
        onDelete={handleDelete}
      />
    </div>
  );
}

interface OwnerPlanFilterButtonsProps {
  filter: string;
  onFilterChange: (value: string) => void;
  ownerCountByPlan: Record<string, number>;
  labelId: string;
}

const OWNER_PLAN_FILTER_ORDER = ['VIP', 'Superior', 'Pago', 'Gratis'] as const;

function OwnerPlanFilterButtons({ filter, onFilterChange, ownerCountByPlan, labelId }: OwnerPlanFilterButtonsProps) {
  const { formatMessage } = useIntl();

  const plans: { value: string; labelKey: string; count: number }[] = [
    { value: 'all', labelKey: 'OWNER.FILTER_ALL', count: ownerCountByPlan.all },
    { value: 'not-free', labelKey: 'OWNER.FILTER_NOT_FREE', count: ownerCountByPlan['not-free'] },
    ...OWNER_PLAN_FILTER_ORDER.map((planType) => ({
      value: planType.toLowerCase(),
      labelKey: `OWNER.FILTER_${planType}`,
      count: ownerCountByPlan[planType],
    })),
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label htmlFor={labelId} className="text-sm font-medium text-text">
        {formatMessage({ id: 'OWNER.FILTER_LABEL' })}
      </label>
      {plans.map(({ value, labelKey, count }) => (
        <Button
          key={value}
          variant={filter === value ? 'primary' : 'secondary'}
          onClick={() => onFilterChange(value)}
          className="transition-colors text-sm"
        >
          <span className="flex items-center gap-1">
            {formatMessage({ id: labelKey })}
            {count > 0 && (
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-text-muted">
                {count}
              </span>
            )}
          </span>
        </Button>
      ))}
    </div>
  );
}

export default OwnerListPage;
