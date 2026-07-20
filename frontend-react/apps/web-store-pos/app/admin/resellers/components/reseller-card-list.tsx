import { useIntl } from 'react-intl';
import type { ReSeller } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';

interface ResellerCardListProps {
  resellers: ReSeller[];
  onCreate: () => void;
  onEdit: (id: string) => void;
}

/**
 * Reseller card grid at `/admin/resellers`. L5 parity: shared Card/Button chrome + a
 * per-card gear action menu replace the old raw-div markup, mirroring
 * `admin/owners/components/owner-card-list.tsx` and
 * `management/users/components/user-card-list.tsx`. Angular's `resellers.component.html:30-55`
 * gear menu also renders Activate/Deactivate/Delete, but those handlers are empty no-op stubs
 * (`resellers.component.ts:47-61`) — only Edit (routerLink, LIVE) is wired here
 * (Req: Resellers Gear Menu — Edit Only). A FAB above the grid (`resellers.component.html:7-10`)
 * navigates to the create page and reads `RESELLERS.ADD` (Req: Resellers L6 Text Parity,
 * override 1 — value is literal Angular `GENERAL.ADD` = "Adicionar", NOT "Adicionar Gestor";
 * this component is `RESELLERS.ADD`'s sole runtime consumer, per Phase 5 reconciliation).
 */
function getCardClass(reseller: ReSeller): string {
  return reseller.isActive === false ? 'bg-danger/10 border border-danger' : '';
}

export function ResellerCardList({ resellers, onCreate, onEdit }: ResellerCardListProps) {
  const intl = useIntl();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="fab" onClick={onCreate}>
          <PlusIcon />
          {intl.formatMessage({ id: 'RESELLERS.ADD' })}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {resellers.map((reseller) => (
          <Card key={reseller.id} title={reseller.fullName} className={getCardClass(reseller)}>
            <div className="space-y-2">
              <p className="text-sm text-text-muted">
                {intl.formatMessage({ id: 'RESELLERS.PERCENT_DISCOUNT' })}
                {': '}
                {reseller.percentDiscountPrice}
              </p>
              <p className="text-sm text-text-muted">
                {intl.formatMessage({ id: 'RESELLERS.DISCOUNT_PRICE' })}
                {': '}
                {reseller.discountPrice}
              </p>
              <p className="text-sm text-text-muted">{reseller.cellPhone}</p>
              {reseller.email && <p className="text-sm text-text-muted">{reseller.email}</p>}
              {reseller.description && (
                <p className="text-sm text-text-muted">{reseller.description}</p>
              )}
              <div className="flex justify-end pt-2">
                <ActionMenu widthClass="min-w-40">
                  <ActionMenuItem intent="edit" onClick={() => onEdit(reseller.id)}>
                    {intl.formatMessage({ id: 'GENERAL.EDIT' })}
                  </ActionMenuItem>
                </ActionMenu>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ResellerCardList;
