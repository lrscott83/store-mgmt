import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { ReSeller } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon, SettingsIcon } from '~/shared/components/ui/icons';

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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  function toggleMenu(id: string) {
    setOpenMenuId((current) => (current === id ? null : id));
  }

  function handleEdit(id: string) {
    onEdit(id);
    setOpenMenuId(null);
  }

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
              <div className="relative flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => toggleMenu(reseller.id)}
                  aria-label="Acciones"
                  className="rounded-full p-2 text-primary hover:bg-primary-light"
                >
                  <SettingsIcon />
                </button>
                {openMenuId === reseller.id && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-border bg-surface shadow-card"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleEdit(reseller.id)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text hover:bg-primary-light"
                    >
                      {intl.formatMessage({ id: 'GENERAL.EDIT' })}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ResellerCardList;
