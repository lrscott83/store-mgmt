import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Currency } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';

interface DenominationCountCardProps {
  /** Denominaciones a mostrar, de mayor a menor (S11). */
  denominations: readonly number[];
  /** Conteo por denominación: clave = String(valor). */
  counts: Readonly<Record<string, number>>;
  currency: Currency;
  /** Cierre `Closed`: conteo congelado, sin edición (S2). */
  disabled: boolean;
  onChangeCount: (value: number, count: number) => void;
  onAddDenomination: (value: number) => void;
}

/**
 * Formato de importe sin código de moneda (el card es de una sola moneda, la
 * del header): `20 000`, con separador NBSP — mismo agrupado que
 * `formatMoneyWithCurrency` (S10/S11).
 */
function formatAmount(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  const decimals = decPart === '00' ? '' : `.${decPart}`;
  return `${sign}${grouped}${decimals}`;
}

/**
 * Fila del conteo: denominación a la izquierda, botón `-` al centro, textbox de
 * cantidad (empieza en `0` y el cero se puede borrar), botón `+`, y el total
 * `denominación × cantidad` a la derecha (S10).
 */
function DenominationRow({
  value,
  count,
  disabled,
  onChange,
}: {
  value: number;
  count: number;
  disabled: boolean;
  onChange: (count: number) => void;
}) {
  // Estado de texto propio: permite borrar el `0` inicial y escribir otro número.
  const [text, setText] = useState(count > 0 ? String(count) : '0');

  function commit(raw: string) {
    const cleaned = raw.replace(/[^\d]/g, '');
    setText(cleaned);
    onChange(cleaned === '' ? 0 : Number(cleaned));
  }

  function step(delta: number) {
    const next = Math.max(0, count + delta);
    setText(String(next));
    onChange(next);
  }

  return (
    <div
      className="flex items-center gap-1.5 border-b border-border py-1.5 text-sm last:border-0"
      data-testid={`denomination-row-${value}`}
    >
      <span className="min-w-0 flex-1 font-medium text-text" data-testid="denomination-value">
        {formatAmount(value)}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={disabled}
          aria-label={`- ${formatAmount(value)}`}
          data-testid={`denomination-minus-${value}`}
          className="h-7 w-7 rounded-md border border-border text-base leading-none text-text hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={text}
          disabled={disabled}
          onChange={(e) => commit(e.target.value)}
          aria-label={`Cantidad ${formatAmount(value)}`}
          data-testid={`denomination-qty-${value}`}
          className="h-7 w-12 rounded-md border border-gray-300 px-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-surface-hover"
        />
        <button
          type="button"
          onClick={() => step(1)}
          disabled={disabled}
          aria-label={`+ ${formatAmount(value)}`}
          data-testid={`denomination-plus-${value}`}
          className="h-7 w-7 rounded-md border border-border text-base leading-none text-text hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          +
        </button>
      </div>
      <span
        className="min-w-0 flex-1 text-right font-semibold tabular-nums text-text"
        data-testid={`denomination-total-${value}`}
      >
        {formatAmount(value * count)}
      </span>
    </div>
  );
}

/**
 * Card `Conteo` (S10/S11): lista de denominaciones ordenadas de mayor a menor,
 * más la posibilidad de agregar una nueva (que el caller persiste por tienda).
 */
export function DenominationCountCard({
  denominations,
  counts,
  currency,
  disabled,
  onChangeCount,
  onAddDenomination,
}: DenominationCountCardProps) {
  const intl = useIntl();
  const [newValue, setNewValue] = useState('');

  function handleAdd() {
    const parsed = Number(newValue.replace(/[^\d]/g, ''));
    if (!parsed || parsed <= 0) return;
    onAddDenomination(parsed);
    setNewValue('');
  }

  return (
    <div data-testid="denomination-count-card">
      <div className="flex items-center gap-1.5 border-b border-border pb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">
        <span className="min-w-0 flex-1">
          {intl.formatMessage({ id: 'CASH_CLOSING.DENOMINATION' })}
        </span>
        <span className="w-28 shrink-0 text-center">
          {intl.formatMessage({ id: 'CASH_CLOSING.QUANTITY' })}
        </span>
        <span className="min-w-0 flex-1 text-right">
          {intl.formatMessage({ id: 'CASH_CLOSING.TOTAL' })}
        </span>
      </div>

      {denominations.map((value) => (
        <DenominationRow
          key={`${currency}-${value}`}
          value={value}
          count={counts[String(value)] ?? 0}
          disabled={disabled}
          onChange={(count) => onChangeCount(value, count)}
        />
      ))}

      {!disabled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm text-text-muted" htmlFor="new-denomination">
            {intl.formatMessage({ id: 'CASH_CLOSING.NEW_DENOMINATION' })}
          </label>
          <input
            id="new-denomination"
            type="text"
            inputMode="numeric"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value.replace(/[^\d]/g, ''))}
            data-testid="new-denomination-input"
            className="h-9 w-28 rounded-md border border-gray-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <Button variant="outline" onClick={handleAdd} disabled={!newValue}>
            {intl.formatMessage({ id: 'CASH_CLOSING.ADD_DENOMINATION' })}
          </Button>
        </div>
      )}
    </div>
  );
}

export { formatAmount as formatDenominationAmount };
