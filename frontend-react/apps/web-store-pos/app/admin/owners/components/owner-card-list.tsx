import { useIntl } from 'react-intl';
import type { Owner } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';

interface OwnerCardListProps {
  owners: Owner[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Owner card grid at `/admin/owners`. L5 parity: shared Card chrome + a per-card gear action
 * menu replace the old raw-div markup, mirroring `management/users/components/user-card-list.tsx`
 * and `admin/stores/components/store-card-list.tsx`. Angular's `owners.component.html:31-59`
 * gear menu also renders Approve/Activate/Deactivate, but those handlers are empty no-op stubs
 * (`owners.component.ts:345-355`) — only Edit (routerLink, LIVE) and Delete (`deleteOwner`,
 * LIVE ts:337, no confirm dialog) are wired here (Req: Owners Gear Menu — Live Actions Only).
 */
function getCardClass(owner: Owner): string {
  if (!owner.isActive) return 'bg-danger/10 border border-danger';
  if (!owner.approved) return 'bg-success/10 border border-success';
  return '';
}

export function OwnerCardList({ owners, onEdit, onDelete }: OwnerCardListProps) {
  const intl = useIntl();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {owners.map((owner) => {
        const totalPrice = owner.storeModules.reduce(
          (sum, m) => sum + m.storeModuleTotalCurrentPrice,
          0
        );
        const storeCount = owner.storeModules.length;

        return (
          <Card key={owner.id} title={owner.fullName} className={getCardClass(owner)}>
            <div className="space-y-2">
              <p className="text-sm text-text-muted">
                {intl.formatMessage({ id: 'OWNER.STORE_PRICE_LABEL' }, { count: storeCount })}
                {' — '}
                {intl.formatNumber(totalPrice, { style: 'currency', currency: 'USD' })}
              </p>
              <p className="text-sm text-text-muted">
                {intl.formatMessage({ id: 'GENERAL.RESELLER' })}
                {': '}
                {owner.reSellerName || 'ADMIN'}
              </p>
              <p className="text-sm text-text-muted">{owner.cellPhone}</p>
              {owner.email && <p className="text-sm text-text-muted">{owner.email}</p>}
              {owner.description && <p className="text-sm text-text-muted">{owner.description}</p>}
              <div className="flex justify-end pt-2">
                <ActionMenu widthClass="min-w-40">
                  <ActionMenuItem intent="edit" onClick={() => onEdit(owner.id)}>
                    {intl.formatMessage({ id: 'OWNER.EDIT_OWNER' })}
                  </ActionMenuItem>
                  <ActionMenuItem intent="delete" separatorBefore onClick={() => onDelete(owner.id)}>
                    {intl.formatMessage({ id: 'GENERAL.DELETE' })}
                  </ActionMenuItem>
                </ActionMenu>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default OwnerCardList;
