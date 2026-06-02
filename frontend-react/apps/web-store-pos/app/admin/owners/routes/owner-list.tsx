import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { ownerHttpService } from '~/admin/owners/lib/services/owner-http-service';
import type { Owner } from '@store-mgmt/domain';

export const loader = resellerFeatureLoader([EFeatures.Owners]);

function getCardClass(owner: Owner): string {
  if (!owner.isActive) return 'deactive-owner';
  if (!owner.approved) return 'guest-owner';
  return '';
}

export function OwnerListPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  async function loadOwners() {
    try {
      const res = await ownerHttpService.listOwners();
      setOwners(res.data);
      setError(undefined);
    } catch {
      setError(intl.formatMessage({ id: 'OWNER.ERROR' }));
    }
  }

  useEffect(() => {
    loadOwners();
  }, []);

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

      <div className="space-y-3">
        {owners.map((owner) => {
          const totalPrice = owner.storeModules.reduce(
            (sum, m) => sum + m.storeModuleTotalCurrentPrice,
            0
          );
          const storeCount = owner.storeModules.length;
          const cardClass = getCardClass(owner);

          return (
            <div
              key={owner.id}
              className={`rounded border p-4${cardClass ? ` ${cardClass}` : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{owner.fullName}</p>
                  <p className="text-sm text-gray-600">
                    {intl.formatMessage({ id: 'OWNER.STORE_PRICE_LABEL' }, { count: storeCount })}
                    {' — '}
                    {intl.formatNumber(totalPrice, { style: 'currency', currency: 'USD' })}
                  </p>
                  <p className="text-sm text-gray-600">
                    {intl.formatMessage({ id: 'GENERAL.RESELLER' })}{': '}{owner.reSellerName || 'ADMIN'}
                  </p>
                  <p className="text-sm text-gray-600">{owner.cellPhone}</p>
                  {owner.email && (
                    <p className="text-sm text-gray-600">{owner.email}</p>
                  )}
                  {owner.description && (
                    <p className="text-sm text-gray-600">{owner.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/owners/edit/${owner.id}`)}
                    className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
                  >
                    {intl.formatMessage({ id: 'OWNER.EDIT_OWNER' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(owner.id as string)}
                    className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                  >
                    {intl.formatMessage({ id: 'EXPENSES.DELETE' })}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default OwnerListPage;
