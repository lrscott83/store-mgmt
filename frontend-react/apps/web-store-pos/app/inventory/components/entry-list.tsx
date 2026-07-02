import { useIntl } from 'react-intl';
import type { InventoryEntryView } from '@store-mgmt/domain';

interface EntryListProps {
  entries: InventoryEntryView[];
  onEdit?: (entry: InventoryEntryView) => void;
  onDeactivate?: (entry: InventoryEntryView) => void;
  /**
   * Mirrors Angular's `entry-list.component.ts:22` `@Input() readOnly: boolean = true`.
   * When true, the edit/deactivate action column is hidden. Defaults to `false` here (not
   * Angular's default) because the only current caller that omits an explicit override is
   * `today-entries.tsx`, which — like Angular's own `today-entries.component.html:24`
   * `[readOnly]="false"` — needs actions enabled by default.
   */
  readOnly?: boolean;
  /**
   * Mirrors Angular's `entry-list.component.ts:32` `isOwnerAdmin()` (`currentUser.isOwnerAdmin`).
   * Gates BOTH the cost-price column (`@if (isOwnerAdmin())`, entry-list.component.html:16) and
   * the actions column (`@if (isOwnerAdmin() && !readOnly)`, entry-list.component.html:23).
   * Defaults to `false` (fail-closed), matching Angular hiding pricing/actions from non-owner-
   * admin users.
   */
  isOwnerAdmin?: boolean;
}

export function EntryList({
  entries,
  onEdit,
  onDeactivate,
  readOnly = false,
  isOwnerAdmin = false,
}: EntryListProps) {
  const intl = useIntl();
  const showActions = isOwnerAdmin && !readOnly;

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-text-muted">
        {intl.formatMessage({ id: 'INVENTORY.NO_ENTRY_FOUND' })}
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-background">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-text-muted">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' })}
            </th>
            <th className="px-4 py-2 text-right font-medium text-text-muted">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.QUANTITY' })}
            </th>
            {isOwnerAdmin && (
              <th className="px-4 py-2 text-right font-medium text-text-muted">
                {intl.formatMessage({ id: 'INVENTORY.ENTRY.COST_PRICE' })}
              </th>
            )}
            <th className="px-4 py-2 text-left font-medium text-text-muted">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.DATE' })}
            </th>
            {showActions && <th className="px-4 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-background">
              <td className="px-4 py-3 font-medium text-text">
                {entry.productName || entry.productId}
              </td>
              <td className="px-4 py-3 text-right text-text-muted">{entry.quantity}</td>
              {isOwnerAdmin && (
                <td className="px-4 py-3 text-right text-success">
                  ${entry.costPrice.toFixed(2)}
                </td>
              )}
              <td className="px-4 py-3 text-text-muted">
                {new Date(entry.date).toLocaleDateString('es')}
              </td>
              {showActions && (
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onEdit?.(entry)}
                      className="rounded bg-primary-light px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                    >
                      {intl.formatMessage({ id: 'GENERAL.EDIT' })}
                    </button>
                    <button
                      onClick={() => onDeactivate?.(entry)}
                      className="rounded bg-danger/10 px-2 py-1 text-xs font-medium text-danger hover:bg-danger/20"
                    >
                      {/* CRITICAL bug fix (Angular parity: entry-list.component.html:36
                          GENERAL.DELETE) — was wrongly wired to ORDERS.DEACTIVATE
                          ("Anular pedido"), the cancel-order label, not delete-entry. */}
                      {intl.formatMessage({ id: 'GENERAL.DELETE' })}
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
