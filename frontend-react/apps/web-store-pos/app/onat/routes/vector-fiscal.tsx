import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { ExpenseType } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { ownerOnlyLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import {
  cierreAnual,
  cuotaMensual,
  fuerzaTrabajo,
  impuestoVentas,
} from '~/onat/lib/onat-calculations';
import { aggregateOnatMonths } from '~/onat/lib/onat-aggregation';
import type { OnatAggregationResult, OnatMonth } from '~/onat/lib/onat-aggregation';
import { ONAT_TAXONOMY } from '~/onat/lib/onat-taxonomy';
import type { OnatTaxonomyEntry } from '~/onat/lib/onat-taxonomy';
import { getOnatOverrides, setOnatOverride } from '~/onat/lib/onat-storage';
import type { OnatMonthOverrides, OnatOverride, OnatOverrides } from '~/onat/lib/onat-storage';

/**
 * S2: el Vector Fiscal es del Owner — `isOwnerAdmin` y NO `isSuperAdmin`.
 * Cualquier otro rol se deniega igual que en el resto de loaders (logout + /login).
 */
export const clientLoader = ownerOnlyLoader;

const CUP_FORMATTER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const MONTH_FORMATTER = new Intl.DateTimeFormat('es-ES', { month: 'long' });
const YEAR_RANGE = 5;
/** Año ancla del formateador: solo importa el índice del mes, no el año. */
const MONTH_ANCHOR_YEAR = 2020;

const LABEL_CLASSES = 'text-sm font-medium text-text';
const SELECT_CLASSES =
  'rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

type OverrideField = 'ingresos' | 'gastos';

interface VectorRow {
  month: OnatMonth;
  label: string;
  income: number;
  expenses: number;
  taxes: number;
  overrides: OnatMonthOverrides | undefined;
}

interface EditableAmountProps {
  month: OnatMonth;
  monthLabel: string;
  field: OverrideField;
  amount: number;
  override: OnatOverride | undefined;
  /** Devuelve `false` cuando la escritura falló; la celda sigue editable. */
  onSave: (month: OnatMonth, field: OverrideField, value: number) => boolean;
}

/**
 * Tributos deducibles de la base del cierre anual (S8): los tributos de la
 * sección F del DJ-08 que la taxonomía marca como deducibles. La contribución de
 * zonas, los arrendamientos y las exoneraciones se restan por su propia línea y
 * la cuota mensual es un pago a cuenta, así que quedan fuera de esta suma.
 */
const TAXONOMY_ENTRIES: readonly OnatTaxonomyEntry[] = Object.values(ONAT_TAXONOMY).filter(
  (entry): entry is OnatTaxonomyEntry => entry !== undefined,
);

const TRIBUTOS_DEDUCIBLES: readonly OnatTaxonomyEntry[] = TAXONOMY_ENTRIES.filter(
  (entry) => entry.deducibleDeLaBase && !entry.pagoACuenta && entry.seccionDj08 === 'F',
);

function formatCup(value: number): string {
  return CUP_FORMATTER.format(value);
}

function monthLabel(month: number): string {
  return MONTH_FORMATTER.format(new Date(MONTH_ANCHOR_YEAR, month, 1));
}

/**
 * S5: el vector consolida las tiendas que muestra el selector del Owner. Sin
 * lista de tiendas (sesiones antiguas) se usa la tienda seleccionada.
 */
function resolveStoreIds(user: UserModel | null): string[] {
  const stores = user?.storeList;
  if (Array.isArray(stores) && stores.length > 0) {
    return stores.filter((store) => store.isActive !== false).map((store) => store.id);
  }
  return user?.selectedStoreId ? [user.selectedStoreId] : [];
}

function monthOverridesFor(
  overrides: OnatOverrides,
  year: number,
  month: number,
): OnatMonthOverrides | undefined {
  const yearOverrides: Record<string, OnatMonthOverrides> | undefined = overrides[String(year)];
  return yearOverrides?.[String(month)];
}

function sumTaxBucket(months: readonly OnatMonth[], tipo: ExpenseType): number {
  return months.reduce((total, month) => total + (month.taxesByType[tipo] ?? 0), 0);
}

function AnnualLine({ labelId, value }: { labelId: string; value: number }) {
  const intl = useIntl();

  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1 last:border-b-0">
      <dt className="text-sm text-text-muted">{intl.formatMessage({ id: labelId })}</dt>
      <dd className="text-sm font-medium text-text">{formatCup(value)}</dd>
    </div>
  );
}

/**
 * Celda editable de ingresos/gastos (S3/S4). En reposo muestra el valor vigente
 * y, si el Owner ya lo sobrescribió, el original congelado entre paréntesis.
 */
function EditableAmount({
  month,
  monthLabel: rowMonthLabel,
  field,
  amount,
  override,
  onSave,
}: EditableAmountProps) {
  const intl = useIntl();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const editMessageId = field === 'ingresos' ? 'ONAT.EDIT_INCOME' : 'ONAT.EDIT_EXPENSES';
  const inputMessageId = field === 'ingresos' ? 'ONAT.INPUT_INCOME' : 'ONAT.INPUT_EXPENSES';
  const saveMessageId = field === 'ingresos' ? 'ONAT.SAVE_INCOME' : 'ONAT.SAVE_EXPENSES';

  const startEditing = () => {
    setDraft(String(amount));
    setInvalid(false);
    setSaveFailed(false);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setInvalid(false);
    setSaveFailed(false);
  };

  const save = () => {
    // Un borrador vacío no es un 0: `Number('')` sí da 0, así que el vacío se
    // rechaza explícitamente para no guardar un importe que el Owner no escribió.
    const trimmed = draft.trim();
    const parsed = trimmed === '' ? Number.NaN : Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setInvalid(true);
      setSaveFailed(false);
      return;
    }
    if (!onSave(month, field, parsed)) {
      // La celda sigue en edición para que el Owner pueda reintentar.
      setSaveFailed(true);
      return;
    }
    setEditing(false);
    setInvalid(false);
    setSaveFailed(false);
  };

  if (!editing) {
    const shown = override?.value ?? amount;
    const before = override
      ? ` (${intl.formatMessage({ id: 'ONAT.BEFORE' }, { value: formatCup(override.original) })})`
      : '';

    return (
      <button
        type="button"
        onClick={startEditing}
        aria-label={intl.formatMessage({ id: editMessageId }, { month: rowMonthLabel })}
        className="rounded px-1 text-right text-primary underline-offset-2 hover:underline"
      >
        {`${formatCup(shown)}${before}`}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-right text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
        type="text"
        inputMode="decimal"
        aria-label={intl.formatMessage({ id: inputMessageId }, { month: rowMonthLabel })}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
          setSaveFailed(false);
        }}
      />

      {invalid && (
        <span className="text-xs text-danger">{intl.formatMessage({ id: 'ONAT.INVALID_AMOUNT' })}</span>
      )}

      {saveFailed && (
        <span role="alert" className="text-xs text-danger">
          {intl.formatMessage({ id: 'ONAT.SAVE_ERROR' })}
        </span>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          aria-label={intl.formatMessage({ id: saveMessageId }, { month: rowMonthLabel })}
          className="text-xs font-medium text-primary"
        >
          {intl.formatMessage({ id: 'ONAT.SAVE_ROW' })}
        </button>
        <button
          type="button"
          onClick={cancelEditing}
          aria-label={intl.formatMessage({ id: 'ONAT.CANCEL_EDIT' }, { month: rowMonthLabel })}
          className="text-xs font-medium text-text-muted"
        >
          {intl.formatMessage({ id: 'ONAT.CANCEL_ROW' })}
        </button>
      </div>
    </div>
  );
}

export function VectorFiscalPage() {
  const intl = useIntl();
  const user = useAuthStore((state) => state.user);
  const ownerId = user?.id ?? '';

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [aggregation, setAggregation] = useState<OnatAggregationResult | null>(null);
  const [overrides, setOverrides] = useState<OnatOverrides>({});
  const [pagaAntesDel28Febrero, setPagaAntesDel28Febrero] = useState(false);

  const storeIds = useMemo(() => resolveStoreIds(user), [user]);
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: YEAR_RANGE }, (_, index) => current - index);
  }, []);

  useEffect(() => {
    setOverrides(ownerId ? getOnatOverrides(ownerId) : {});
  }, [ownerId]);

  useEffect(() => {
    let cancelled = false;
    setAggregation(null);
    void aggregateOnatMonths({ storeIds, year }).then((result) => {
      if (!cancelled) setAggregation(result);
    });
    return () => {
      cancelled = true;
    };
  }, [storeIds, year]);

  const rows = useMemo<VectorRow[]>(() => {
    if (!aggregation) return [];

    return aggregation.months.map((month) => {
      const overridesMes = monthOverridesFor(overrides, year, month.month);
      const income = overridesMes?.ingresos?.value ?? month.income;
      const expenses = overridesMes?.gastos?.value ?? month.expenses;

      return {
        month,
        label: monthLabel(month.month),
        income,
        expenses,
        // S6: lo calculado por el mes, sobre el ingreso vigente.
        taxes: impuestoVentas(income) + cuotaMensual(income) + fuerzaTrabajo(month.salaries),
        overrides: overridesMes,
      };
    });
  }, [aggregation, overrides, year]);

  const annualTotals = useMemo(() => {
    const months = aggregation?.months ?? [];

    return {
      ingresos: rows.reduce((total, row) => total + row.income, 0),
      // S8: solo los gastos no fiscales. Los tributos, zonas, arrendamientos,
      // exoneraciones y la cuota se restan por sus propias líneas del cierre.
      // S4: si el Owner sobrescribió el gasto de un mes, esa cifra manda; el
      // override es el gasto del mes que el Owner ve en la tabla.
      gastos: months.reduce((total, month) => {
        const override = monthOverridesFor(overrides, year, month.month)?.gastos;
        return total + (override?.value ?? month.nonTaxExpenses);
      }, 0),
      tributosDeducibles: TRIBUTOS_DEDUCIBLES.reduce(
        (total, entry) => total + sumTaxBucket(months, entry.tipo),
        0,
      ),
      contribucionZonas: sumTaxBucket(months, ExpenseType.ContribucionZonas),
      arrendamientos: sumTaxBucket(months, ExpenseType.ArrendamientoEntidades),
      exoneraciones: sumTaxBucket(months, ExpenseType.ExoneracionReparaciones),
      cuotasPagadas: sumTaxBucket(months, ExpenseType.CuotaMensual),
    };
  }, [aggregation, overrides, rows, year]);

  /** S6 — tributos pagados del año, con el código ONAT de la taxonomía. */
  const paidTaxes = useMemo(() => {
    if (!aggregation) return [];

    return TAXONOMY_ENTRIES.map((entry) => ({
      entry,
      amount: sumTaxBucket(aggregation.months, entry.tipo),
    })).filter((line) => line.amount > 0);
  }, [aggregation]);

  const cierre = useMemo(
    () =>
      cierreAnual({
        ingresos: annualTotals.ingresos,
        gastos: annualTotals.gastos,
        tributosDeducibles: annualTotals.tributosDeducibles,
        contribucionZonas: annualTotals.contribucionZonas,
        arrendamientos: annualTotals.arrendamientos,
        exoneraciones: annualTotals.exoneraciones,
        otrasBonificaciones: 0,
        cuotasPagadas: annualTotals.cuotasPagadas,
        retenciones: 0,
        bonificaciones: 0,
        pagaAntesDel28Febrero,
      }),
    [annualTotals, pagaAntesDel28Febrero],
  );

  const saveOverride = (month: OnatMonth, field: OverrideField, value: number): boolean => {
    if (!ownerId) return false;
    // S3/S4: `original` es el agregado de ESTE instante, no un valor recalculado.
    const aggregated = field === 'ingresos' ? month.income : month.expenses;
    const result = setOnatOverride({
      ownerId,
      year,
      month: month.month,
      field,
      original: aggregated,
      value,
    });
    if (!result.succeeded) return false;
    // Recargar para que el paréntesis del original salga del dato persistido.
    setOverrides(getOnatOverrides(ownerId));
    return true;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text">
          {intl.formatMessage({ id: 'ONAT.VECTOR_TITLE' })}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {intl.formatMessage({ id: 'ONAT.VECTOR_SUBTITLE' })}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {intl.formatMessage({ id: 'ONAT.CUP_NOTE' })}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className={LABEL_CLASSES} htmlFor="onat-year">
          {intl.formatMessage({ id: 'ONAT.YEAR' })}
        </label>
        <select
          id="onat-year"
          className={SELECT_CLASSES}
          value={String(year)}
          onChange={(event) => setYear(Number(event.target.value))}
        >
          {years.map((candidate) => (
            <option key={candidate} value={String(candidate)}>
              {candidate}
            </option>
          ))}
        </select>
      </div>

      {aggregation === null ? (
        <p className="text-sm text-text-muted">{intl.formatMessage({ id: 'GENERAL.LOADING' })}</p>
      ) : (
        <>
          <section className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-3 py-2 font-medium">{intl.formatMessage({ id: 'ONAT.MONTH' })}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {intl.formatMessage({ id: 'ONAT.INCOME' })}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {intl.formatMessage({ id: 'ONAT.EXPENSES' })}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {intl.formatMessage({ id: 'ONAT.TAXES' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.month.month} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-text">{row.label}</td>
                    <td className="px-3 py-2 text-right">
                      <EditableAmount
                        month={row.month}
                        monthLabel={row.label}
                        field="ingresos"
                        amount={row.income}
                        override={row.overrides?.ingresos}
                        onSave={saveOverride}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <EditableAmount
                        month={row.month}
                        monthLabel={row.label}
                        field="gastos"
                        amount={row.expenses}
                        override={row.overrides?.gastos}
                        onSave={saveOverride}
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-text">{formatCup(row.taxes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {paidTaxes.length > 0 && (
            <section
              aria-labelledby="onat-paid-taxes"
              className="space-y-2 rounded-lg border border-border bg-surface p-4"
            >
              <h2 id="onat-paid-taxes" className="text-sm font-semibold text-text">
                {intl.formatMessage({ id: 'ONAT.PAID_TAXES' })}
              </h2>
              <ul className="space-y-1">
                {paidTaxes.map(({ entry, amount }) => (
                  <li
                    key={entry.tipo}
                    className="flex items-baseline justify-between gap-3 border-b border-border pb-1 last:border-b-0"
                  >
                    <span className="text-sm text-text">
                      {`${entry.descripcion} (${entry.codigoOnat ?? intl.formatMessage({ id: 'ONAT.NO_CODE' })})`}
                    </span>
                    <span className="text-sm font-medium text-text">{formatCup(amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <div>
              <h2 className="text-sm font-semibold text-text">
                {intl.formatMessage({ id: 'ONAT.ANNUAL_CLOSE' })}
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                {intl.formatMessage({ id: 'ONAT.ANNUAL_CLOSE_HINT' })}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-primary"
                checked={pagaAntesDel28Febrero}
                onChange={(event) => setPagaAntesDel28Febrero(event.target.checked)}
              />
              {intl.formatMessage({ id: 'ONAT.CLOSE_PAY_BEFORE' })}
            </label>

            <dl className="grid gap-2 sm:grid-cols-2">
              <AnnualLine labelId="ONAT.CLOSE_BASE" value={cierre.baseImponible} />
              <AnnualLine labelId="ONAT.CLOSE_TAX" value={cierre.impuesto} />
              <AnnualLine labelId="ONAT.CLOSE_TAX_DUE" value={cierre.impuestoAPagar} />
              <AnnualLine
                labelId="ONAT.CLOSE_EARLY_BONUS"
                value={cierre.bonificacionProntoPago}
              />
              <AnnualLine labelId="ONAT.CLOSE_TOTAL" value={cierre.totalAPagar} />
            </dl>
          </section>

          {(aggregation.warnings.length > 0 || aggregation.skipped > 0) && (
            <section className="rounded-lg border border-border bg-surface p-3">
              <h2 className="text-sm font-semibold text-text">
                {intl.formatMessage({ id: 'ONAT.WARNINGS' })}
              </h2>
              <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-text-muted">
                {aggregation.skipped > 0 && (
                  <li>
                    {intl.formatMessage(
                      { id: 'ONAT.SKIPPED_RATES' },
                      { count: aggregation.skipped },
                    )}
                  </li>
                )}
                {aggregation.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default VectorFiscalPage;
