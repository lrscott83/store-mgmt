import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { resellerHttpService } from '~/admin/resellers/lib/services/reseller-http-service';
import type { ReSeller } from '@store-mgmt/domain';

export const loader = superAdminLoader;

export function ResellerListPage() {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();
  const [resellers, setResellers] = useState<ReSeller[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  async function loadResellers() {
    try {
      const res = await resellerHttpService.listResellers();
      setResellers(res.data);
      setError(undefined);
    } catch {
      setError(formatMessage({ id: 'RESELLERS.ERROR' }));
    }
  }

  useEffect(() => {
    loadResellers();
  }, []);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {formatMessage({ id: 'RESELLERS.LIST_TITLE' })}
        </h1>
        <button
          type="button"
          onClick={() => navigate('/admin/resellers/create')}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {formatMessage({ id: 'RESELLERS.ADD' })}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {resellers.map((reseller) => (
          <div
            key={reseller.id}
            className={`rounded border p-4${reseller.isActive === false ? ' deactive-reSeller' : ''}`}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="font-medium">{reseller.fullName}</p>
                <p className="text-sm text-gray-600">
                  {formatMessage({ id: 'RESELLERS.PERCENT_DISCOUNT' })}: {reseller.percentDiscountPrice}
                </p>
                <p className="text-sm text-gray-600">
                  {formatMessage({ id: 'RESELLERS.DISCOUNT_PRICE' })}: {reseller.discountPrice}
                </p>
                <p className="text-sm text-gray-600">{reseller.cellPhone}</p>
                {reseller.email && (
                  <p className="text-sm text-gray-600">{reseller.email}</p>
                )}
                {reseller.description && (
                  <p className="text-sm text-gray-600">{reseller.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate(`/admin/resellers/edit/${reseller.id}`)}
                className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
              >
                {formatMessage({ id: 'USERS.EDIT' })}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ResellerListPage;
