import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { ownerHttpService } from '~/admin/owners/lib/services/owner-http-service';
import { ownerErrorMessageId } from '~/admin/owners/lib/owner-error-message';
import { OwnerCardList } from '~/admin/owners/components/owner-card-list';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import type { Owner } from '@store-mgmt/domain';

export const clientLoader = resellerFeatureLoader([EFeatures.Owners]);

// DELETE refuses an owner whose store carries payments with a 409 — the backend checks
// before the first delete is queued, so nothing was removed. That is a different problem
// with a different fix (deactivate, not delete), so it must not read as the generic
// "try again" error. Mirrors LOAD_ERROR_KEYS in owner-edit.tsx.
const DELETE_ERROR_KEYS: Record<number, string> = { 409: 'OWNER.HAS_PAYMENTS' };

/**
 * Super-admin owners list. No plan filter — every owner renders unfiltered
 * (the plan filter was removed; the stores list keeps its own plan buttons).
 */
export function OwnerListPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

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
      setError(intl.formatMessage({ id: ownerErrorMessageId(error, DELETE_ERROR_KEYS) }));
    }
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

      <OwnerCardList
        owners={owners}
        onEdit={(id) => navigate(`/admin/owners/edit/${id}`)}
        onDelete={handleDelete}
      />
    </div>
  );
}

export default OwnerListPage;
