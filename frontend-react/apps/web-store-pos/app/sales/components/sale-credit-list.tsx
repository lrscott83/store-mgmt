import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';
import type { PaymentType } from '@store-mgmt/domain';
import { EditSaleCreditModal } from './edit-sale-credit-modal';
import { SaleCreditPaymentModal } from './sale-credit-payment-modal';

interface SaleCreditListProps {
  saleCredits: SaleCredit[];
  /** Angular default is `true` (read-only, no actions column). */
  readOnly?: boolean;
  onSave?: (creditId: string, client: string, note: string) => void;
  onPay?: (creditId: string, paidType: PaymentType, note: string) => void;
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingCredit, setEditingCredit] = useState<SaleCredit | null>(null);
  const [payingCredit, setPayingCredit] = useState<SaleCredit | null>(null);

  function handleSave(creditId: string, client: string, note: string) {
    onSave?.(creditId, client, note);
    setEditingCredit(null);
  }

  function handlePay(creditId: string, paidType: PaymentType, note: string) {
    onPay?.(creditId, paidType, note);
    setPayingCredit(null);
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
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenuId((prev) => (prev === saleCredit.id ? null : saleCredit.id))
                    }
                    data-testid={`sale-credit-actions-toggle-${saleCredit.id}`}
                    aria-label="Acciones"
                    className="rounded-full p-2 text-primary hover:bg-primary-light"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34ZM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858Z" />
                    </svg>
                  </button>
                  {openMenuId === saleCredit.id && (
                    <div
                      role="menu"
                      className="absolute z-10 mt-1 rounded-md border border-border bg-surface shadow-card"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text hover:bg-primary-light"
                        onClick={() => {
                          setEditingCredit(saleCredit);
                          setOpenMenuId(null);
                        }}
                      >
                        {/* GENERAL.EDIT */}
                        {intl.formatMessage({ id: 'GENERAL.EDIT' })}
                      </button>
                      {!saleCredit.paid && (
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text hover:bg-primary-light"
                          onClick={() => {
                            setPayingCredit(saleCredit);
                            setOpenMenuId(null);
                          }}
                        >
                          {/* SALE_CREDIT.TO_PAY */}
                          {intl.formatMessage({ id: 'SALE_CREDIT.TO_PAY' })}
                        </button>
                      )}
                    </div>
                  )}
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
