import { useIntl } from 'react-intl';
import { ExpenseType } from '@store-mgmt/domain';

const EXPENSE_TYPES = [
  ExpenseType.Salario,
  ExpenseType.Transporte,
  ExpenseType.Alquiler,
  ExpenseType.Corriente,
  ExpenseType.Agua,
  ExpenseType.Comida,
  ExpenseType.Operaciones,
  ExpenseType.Viaje,
  ExpenseType.Divisa,
  ExpenseType.Impuesto,
  ExpenseType.Otro,
];

const EXPENSE_TYPE_KEYS: Record<ExpenseType, string> = {
  [ExpenseType.Salario]: 'EXPENSES.TYPE.SALARIO',
  [ExpenseType.Transporte]: 'EXPENSES.TYPE.TRANSPORTE',
  [ExpenseType.Alquiler]: 'EXPENSES.TYPE.ALQUILER',
  [ExpenseType.Corriente]: 'EXPENSES.TYPE.CORRIENTE',
  [ExpenseType.Agua]: 'EXPENSES.TYPE.AGUA',
  [ExpenseType.Comida]: 'EXPENSES.TYPE.COMIDA',
  [ExpenseType.Operaciones]: 'EXPENSES.TYPE.OPERACIONES',
  [ExpenseType.Viaje]: 'EXPENSES.TYPE.VIAJE',
  [ExpenseType.Divisa]: 'EXPENSES.TYPE.DIVISA',
  [ExpenseType.Impuesto]: 'EXPENSES.TYPE.IMPUESTO',
  [ExpenseType.Otro]: 'EXPENSES.TYPE.OTRO',
};

export interface ExpenseFiltersValue {
  dateFrom: string;
  dateTo: string;
  types: ExpenseType[];
}

interface ExpenseFiltersProps {
  value: ExpenseFiltersValue;
  onChange: (filters: ExpenseFiltersValue) => void;
}

export function ExpenseFilters({ value, onChange }: ExpenseFiltersProps) {
  const intl = useIntl();

  function handleTypeToggle(type: ExpenseType) {
    const current = value.types;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    onChange({ ...value, types: next });
  }

  return (
    <div className="space-y-3 rounded border bg-white p-4">
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'EXPENSES.FILTER.DATE_FROM' })}
          </label>
          <input
            type="date"
            value={value.dateFrom}
            onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={intl.formatMessage({ id: 'EXPENSES.FILTER.DATE_FROM' })}
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'EXPENSES.FILTER.DATE_TO' })}
          </label>
          <input
            type="date"
            value={value.dateTo}
            onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={intl.formatMessage({ id: 'EXPENSES.FILTER.DATE_TO' })}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'EXPENSES.FILTER.TYPE' })}
        </p>
        <div className="flex flex-wrap gap-2">
          {EXPENSE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => handleTypeToggle(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                value.types.includes(t)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {intl.formatMessage({ id: EXPENSE_TYPE_KEYS[t] })}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
