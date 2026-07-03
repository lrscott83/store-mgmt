import { useIntl } from 'react-intl';
import type { Store } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { EditIcon } from '~/shared/components/ui/icons';

interface StoreCardListProps {
  stores: Store[];
  onEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onDisapprove: (id: string) => void;
}

/**
 * Super-admin store lifecycle grid at /admin/stores. L5 parity: shared Card/Button chrome +
 * icons replace the old raw-table markup (`shared/components/ui/{card,button,icons}.tsx`,
 * same precedent as Expenses). Angular's `store-list.component.html:40-50` dead-codes
 * Activate/Deactivate out of the DOM entirely for every role — neither control exists here
 * (Req: Activate/Deactivate Controls Removed).
 */
export function StoreCardList({ stores, onEdit, onApprove, onDisapprove }: StoreCardListProps) {
  const intl = useIntl();

  if (stores.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        {intl.formatMessage({ id: 'STORES.EMPTY_STATE' })}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stores.map((store) => (
        <Card key={store.id} title={store.name}>
          <div className="space-y-2">
            <p className="text-sm text-text-muted">{store.address}</p>
            {store.description && <p className="text-sm text-text-muted">{store.description}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={() => onEdit(store.id)}>
                <EditIcon className="h-4 w-4" />
                {intl.formatMessage({ id: 'STORES.EDIT' })}
              </Button>
              <Button variant="primary" onClick={() => onApprove(store.id)}>
                {intl.formatMessage({ id: 'STORES.APPROVE' })}
              </Button>
              <Button variant="danger" onClick={() => onDisapprove(store.id)}>
                {intl.formatMessage({ id: 'STORES.DISAPPROVE' })}
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default StoreCardList;
