import { useState } from 'react';
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

export function ModulePicker({ modules, onChange }: ModulePickerProps) {
  const intl = useIntl();
  const [checked, setChecked] = useState<Set<number>>(() => computeChecked(modules));

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

  const total = modules
    .filter((m) => checked.has(m.id))
    .reduce((sum, m) => sum + m.currentPrice, 0);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">
        {intl.formatMessage({ id: 'STORES.MODULES_LABEL' })}
      </p>
      <ul className="space-y-1">
        {modules.map((m) => {
          const isLocked = m.priceIncluded;
          const isChecked = checked.has(m.id);
          return (
            <li key={m.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`module-${m.id}`}
                checked={isLocked ? true : isChecked}
                disabled={isLocked}
                onChange={() => handleToggle(m.id, isLocked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor={`module-${m.id}`} className="text-sm text-gray-700">
                {m.name}
              </label>
              {m.discountText && (
                <span className="text-xs text-green-600">{m.discountText}</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-sm font-medium text-gray-700">
        {intl.formatMessage({ id: 'STORES.MODULES_TOTAL' })}: {total}
      </p>
    </div>
  );
}

export default ModulePicker;
