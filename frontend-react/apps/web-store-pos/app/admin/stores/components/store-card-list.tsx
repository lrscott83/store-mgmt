import { useIntl } from 'react-intl';
import type { Store } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';

interface StoreCardListProps {
  stores: Store[];
  onEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onDisapprove: (id: string) => void;
}

/**
 * Super-admin store lifecycle grid at /admin/stores. Gear/action menu (shared `ActionMenu`
 * primitive) replaces the old flat Editar/Aprobar/Desaprobar buttons, matching Angular
 * `store-list.component.html:17-51` (gear-menu-action-styling change). Angular
 * `store-list.component.html:40-50` dead-codes Activate/Deactivate out of the DOM entirely
 * for every role — neither control exists here (Req: Activate/Deactivate Controls Removed).
 * State CSS and Approve/Disapprove XOR mirror `admin/owners/components/owner-card-list.tsx
 * getCardClass` (Req: Store Card Visual Lifecycle State, Req: Card-Grid List Uses Shared
 * Chrome).
 */
function getStoreCardClass(store: Store): string {
  if (!store.isActive) return 'bg-danger/10 border border-danger';
  if (!store.approved) return 'bg-success/10 border border-success';
  return '';
}

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
        <Card key={store.id} title={store.name} className={getStoreCardClass(store)}>
          <div className="space-y-2">
            <p className="text-sm text-text-muted">{store.address}</p>
            {store.description && <p className="text-sm text-text-muted">{store.description}</p>}
            <div className="flex justify-end pt-2">
              <ActionMenu testId={`store-actions-toggle-${store.id}`} widthClass="min-w-40">
                <ActionMenuItem intent="edit" onClick={() => onEdit(store.id)}>
                  {intl.formatMessage({ id: 'STORES.EDIT' })}
                </ActionMenuItem>
                {store.approved ? (
                  <ActionMenuItem intent="disapprove" onClick={() => onDisapprove(store.id)}>
                    {intl.formatMessage({ id: 'STORES.DISAPPROVE' })}
                  </ActionMenuItem>
                ) : (
                  <ActionMenuItem intent="approve" onClick={() => onApprove(store.id)}>
                    {intl.formatMessage({ id: 'STORES.APPROVE' })}
                  </ActionMenuItem>
                )}
              </ActionMenu>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default StoreCardList;
