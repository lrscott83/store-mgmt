import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Module } from '@store-mgmt/domain';

interface ModulePickerProps {
  modules: Module[];
  onChange: (selectedIds: number[]) => void;
}

function computeChecked(modules: Module[]): Set<number> {
  return new Set(
    modules
      .filter((m) => m.priceIncluded || m.selected)
      .map((m) => m.id)
  );
}

function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ModulePicker({ modules, onChange }: ModulePickerProps) {
  const intl = useIntl();
  const [checked, setChecked] = useState<Set<number>>(() => computeChecked(modules));

  // Finding 5: sync checked state when modules prop arrives async (e.g. after API fetch)
  useEffect(() => {
    const next = computeChecked(modules);
    setChecked(next);
    // Don't call onChange here — just sync UI state; parent already has correct moduleIds
  }, [modules]);

  function handleToggle(moduleId: number, locked: boolean) {
    if (locked) return;
    const next = new Set(checked);
    if (next.has(moduleId)) {
      next.delete(moduleId);
    } else {
      next.add(moduleId);
    }
    setChecked(next);
    onChange(Array.from(next));
  }

  // Finding 8: select-all toggles all non-priceIncluded modules
  const nonLockedModules = modules.filter((m) => !m.priceIncluded);
  const allNonLockedSelected =
    nonLockedModules.length > 0 && nonLockedModules.every((m) => checked.has(m.id));

  function handleSelectAll(selected: boolean) {
    const next = new Set(checked);
    nonLockedModules.forEach((m) => {
      if (selected) {
        next.add(m.id);
      } else {
        next.delete(m.id);
      }
    });
    setChecked(next);
    onChange(Array.from(next));
  }

  const total = modules
    .filter((m) => checked.has(m.id))
    .reduce((sum, m) => sum + m.currentPrice, 0);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">
        {intl.formatMessage({ id: 'STORES.MODULES_LABEL' })}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-gray-500">
            <th className="py-1 pr-2">
              <input
                type="checkbox"
                id="module-select-all"
                aria-label={intl.formatMessage({ id: 'STORES.SELECT_ALL_MODULES' })}
                checked={allNonLockedSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
            </th>
            <th className="py-1 pr-2">{intl.formatMessage({ id: 'STORES.NAME' })}</th>
            <th className="py-1 text-right">{intl.formatMessage({ id: 'STORES.MODULES_PRICE' })}</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const isLocked = m.priceIncluded;
            const isChecked = checked.has(m.id);
            return (
              <tr key={m.id}>
                <td className="py-1 pr-2">
                  <input
                    type="checkbox"
                    id={`module-${m.id}`}
                    checked={isLocked ? true : isChecked}
                    disabled={isLocked}
                    onChange={() => handleToggle(m.id, isLocked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </td>
                <td className="py-1 pr-2">
                  <label htmlFor={`module-${m.id}`} className="text-sm text-gray-700">
                    {m.name}
                  </label>
                  {m.discountText && (
                    <span className="ml-1 text-xs text-green-600">{m.discountText}</span>
                  )}
                </td>
                <td className="py-1 text-right">
                  {/* Finding 6: offer-price UI — struck-through original when discounted */}
                  {!isLocked && (
                    m.price !== m.currentPrice ? (
                      <span className="inline-flex flex-col items-end">
                        <span className="font-semibold text-gray-900">{formatUSD(m.currentPrice)}</span>
                        <span className="text-xs text-gray-400 line-through">{formatUSD(m.price)}</span>
                      </span>
                    ) : (
                      <span className="font-semibold">{formatUSD(m.currentPrice)}</span>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t">
            <th />
            <td className="py-1 text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'STORES.MODULES_TOTAL' })}
            </td>
            <td className="py-1 text-right font-semibold">
              {/* Finding 7: format total as USD currency */}
              {formatUSD(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default ModulePicker;
