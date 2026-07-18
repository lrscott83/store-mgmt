import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';
import type { PaymentType } from '@store-mgmt/domain';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { EditSaleCreditModal } from './edit-sale-credit-modal';
import { SaleCreditPaymentModal } from './sale-credit-payment-modal';

interface SaleCreditListProps {
  saleCredits: SaleCredit[];
  /** Angular default is `true` (read-only, no actions column). */
  readOnly?: boolean;
  /** Returns `true` on success, `false` on failure. */
  onSave?: (creditId: string, client: string, note: string) => boolean;
  /** Returns `true` on success, `false` on failure. */
  onPay?: (creditId: string, paidType: PaymentType, note: string) => boolean;
}

function formatDateOnly(date: Date): string {
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Matches Angular's `sale-credit-list.component.html`: a bare table (no
 * header row) — client, total (colored by `getSaleCreditClassName`: success
 * when paid, danger otherwise), paid date label (only when `isPaid`), and an
 * optional actions column (settings menu: Editar always, Pagar only when
 * `!saleCredit.paid`). Angular opens both `EditSaleCreditModalComponent` and
 * `SaleCreditPaymentModalComponent` from THIS component (not the parent
 * page) — mirrored here by owning both modals' state locally.
 */
export function SaleCreditList({ saleCredits, readOnly = true, onSave, onPay }: SaleCreditListProps) {
  const intl = useIntl();
  const [editingCredit, setEditingCredit] = useState<SaleCredit | null>(null);
  const [payingCredit, setPayingCredit] = useState<SaleCredit | null>(null);

  // Only closes the modal on success — a failed save/pay keeps it open so the modal's own
  // Swal error dialog (showBlockingError) stays visible and the user can retry.
  function handleSave(creditId: string, client: string, note: string): boolean {
    const succeeded = onSave ? onSave(creditId, client, note) : true;
    if (succeeded) setEditingCredit(null);
    return succeeded;
  }

  function handlePay(creditId: string, paidType: PaymentType, note: string): boolean {
    const succeeded = onPay ? onPay(creditId, paidType, note) : true;
    if (succeeded) setPayingCredit(null);
    return succeeded;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {saleCredits.map((saleCredit) => (
            <tr key={saleCredit.id} className="border-b border-border last:border-0">
              <td className="p-1">
                <span className="text-text">{saleCredit.client}</span>
              </td>
              <td className="p-1 text-right">
                <span className={saleCredit.isPaid ? 'text-success' : 'text-danger'}>
                  ${saleCredit.total.toFixed(2)}
                </span>
              </td>
              <td className="p-1 text-right">
                {saleCredit.isPaid && (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                    {formatDateOnly(saleCredit.paidDate)}
                  </span>
                )}
              </td>
              {!readOnly && (
                <td className="p-0 text-right">
                  <ActionMenu testId={`sale-credit-actions-toggle-${saleCredit.id}`}>
                    <ActionMenuItem intent="edit" onClick={() => setEditingCredit(saleCredit)}>
                      {/* GENERAL.EDIT */}
                      {intl.formatMessage({ id: 'GENERAL.EDIT' })}
                    </ActionMenuItem>
                    {!saleCredit.paid && (
                      <ActionMenuItem intent="pay" onClick={() => setPayingCredit(saleCredit)}>
                        {/* SALE_CREDIT.TO_PAY */}
                        {intl.formatMessage({ id: 'SALE_CREDIT.TO_PAY' })}
                      </ActionMenuItem>
                    )}
                  </ActionMenu>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {editingCredit && (
        <EditSaleCreditModal
          saleCredit={editingCredit}
          isOpen={true}
          onClose={() => setEditingCredit(null)}
          onSave={handleSave}
        />
      )}

      {payingCredit && (
        <SaleCreditPaymentModal
          saleCredit={payingCredit}
          isOpen={true}
          onClose={() => setPayingCredit(null)}
          onConfirm={handlePay}
        />
      )}
    </div>
  );
}
