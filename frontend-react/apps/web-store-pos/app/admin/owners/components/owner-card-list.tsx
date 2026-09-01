import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Owner } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { ConfirmDialog } from '~/shared/components/ui/confirm-dialog';
import { formatCurrency } from '~/shared/lib/format-currency';

interface OwnerCardListProps {
  owners: Owner[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Owner card grid at `/admin/owners`. The `{date}T00:00:00Z` ISO-parse in `daysFromToday`
 * keeps the next-payment-date calendar day stable across local timezone offsets, so the
 * overdue window matches the backend's `DateOnly` today.
 */
function daysFromToday(isoDate: string, today: Date): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / 86_400_000);
}

function getCardClass(owner: Owner): string {
  if (!owner.isActive) return 'bg-danger/10 border border-danger';
  if (!owner.approved) return 'bg-success/10 border border-success';
  return '';
}

// Worst-store-wins overdue state: danger overrides warning overrides normal. A store is
// overdue when its next payment date is in the past (`daysOverdue = today - due > 0`).
function getOverdueClass(owner: Owner, today: Date): string {
  let worst: 'danger' | 'warning' | '' = '';
  for (const module of owner.storeModules) {
    if (!module.nextDueDate) continue;
    const daysOverdue = -daysFromToday(module.nextDueDate, today);
    if (daysOverdue > 5) worst = 'danger';
    else if (daysOverdue >= 1 && worst !== 'danger') worst = 'warning';
  }
  return worst;
}

export function OwnerCardList({ owners, onEdit, onDelete }: OwnerCardListProps) {
  const intl = useIntl();
  const today = new Date();
  const [ownerToDelete, setOwnerToDelete] = useState<Owner | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {owners.map((owner) => {
          const totalPrice = owner.storeModules.reduce(
            (sum, m) => sum + m.storeModuleTotalCurrentPrice,
            0
          );
          const storeCount = owner.storeModules.length;
          const nextDueDates = owner.storeModules
            .filter((m) => m.nextDueDate !== null)
            .map((m) => m.nextDueDate as string)
            .sort();
          const daysRemaining = nextDueDates.length > 0 ? daysFromToday(nextDueDates[0], today) : null;
          const showDaysRemaining = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 5;
          const overdueClass = getOverdueClass(owner, today);

          return (
            <Card
              key={owner.id}
              title={
                <>
                  {owner.fullName}
                  {showDaysRemaining && (
                    <span className="text-sm text-warning">
                      {' ('}
                      {intl.formatMessage({ id: 'OWNER.DAYS_LEFT' }, { count: daysRemaining })}
                      {')'}
                    </span>
                  )}
                </>
              }
              className={overdueClass || getCardClass(owner)}
              headerAction={
                <ActionMenu widthClass="min-w-40">
                  <ActionMenuItem intent="edit" onClick={() => onEdit(owner.id)}>
                    {intl.formatMessage({ id: 'OWNER.EDIT_OWNER' })}
                  </ActionMenuItem>
                  <ActionMenuItem
                    intent="delete"
                    separatorBefore
                    onClick={() => setOwnerToDelete(owner)}
                  >
                    {intl.formatMessage({ id: 'GENERAL.DELETE' })}
                  </ActionMenuItem>
                </ActionMenu>
              }
            >
              <div className="space-y-2">
                <p className="text-sm text-text-muted">
                  {formatCurrency(totalPrice)}
                  {' en '}
                  {intl.formatMessage({ id: 'OWNER.STORE_PRICE_LABEL' }, { count: storeCount })}
                  {nextDueDates.length > 0 && (
                    <span className="text-success">
                      {' ('}
                      {nextDueDates.join(', ')}
                      {')'}
                    </span>
                  )}
                </p>
                <p className="text-sm text-text-muted">
                  {intl.formatMessage({ id: 'GENERAL.RESELLER' })}
                  {': '}
                  {owner.reSellerName || 'ADMIN'}
                </p>
                <p className="text-sm text-text-muted">{owner.cellPhone}</p>
                {owner.description && <p className="text-sm text-text-muted">{owner.description}</p>}
              </div>
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={ownerToDelete !== null}
        onClose={() => setOwnerToDelete(null)}
        onConfirm={() => {
          if (ownerToDelete) {
            onDelete(ownerToDelete.id);
            setOwnerToDelete(null);
          }
        }}
        title={intl.formatMessage({ id: 'OWNER.DELETE_CONFIRM_TITLE' })}
        description={intl.formatMessage(
          { id: 'OWNER.DELETE_CONFIRM_MESSAGE' },
          { name: ownerToDelete?.fullName ?? '' }
        )}
        confirmLabel={intl.formatMessage({ id: 'OWNER.DELETE_CONFIRM_BUTTON' })}
      />
    </>
  );
}

export default OwnerCardList;