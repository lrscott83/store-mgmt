import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { ExpenseType, EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { ownerModuleLoader, ownerOnlyLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { round2 } from '~/shared/lib/money';
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
import { getOnatVector, setCanalPago, setObligacionPagada } from '~/onat/lib/onat-vector';
import type { OnatCanalPago, OnatObligacion } from '~/onat/lib/onat-vector';

/**
 * S2: el Vector Fiscal es del Owner — `isOwnerAdmin` y NO `isSuperAdmin`.
 * Cualquier otro rol se deniega igual que en el resto de loaders (logout + /login).
 *
 * Encima va el módulo ONAT (22), que nace inactivo: mientras `/me` no lo devuelva
 * en `storeModuleIds` la pantalla queda apagada aunque el usuario sea el dueño.
 * `ownerModuleLoader` solo no basta para el "solo el Owner": no excluye a un
 * SuperAdmin que además sea OwnerAdmin (`loaders.ts`), por eso se encadenan los
 * dos guards.
 */
export async function clientLoader() {
  const ownerResult = await ownerOnlyLoader();
  if (ownerResult) return ownerResult;
  return ownerModuleLoader(EModules.Onat)();
}

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

interface AgendaGroup {
  periodo: string;
  obligaciones: OnatObligacion[];
}

const PERIODO_MENSUAL = /^\d{4}-(0[1-9]|1[0-2])$/;
const PERIODO_TRIMESTRAL = /^\d{4}-Q[1-4]$/;
const PERIODO_ANUAL = /^\d{4}-A$/;

/** Meses (0-11) que cubre el período; `null` si no es un período reconocible. */
function monthsOfPeriod(periodo: string): number[] | null {
  if (PERIODO_MENSUAL.test(periodo)) return [Number(periodo.slice(5)) - 1];

  if (PERIODO_TRIMESTRAL.test(periodo)) {
    const first = (Number(periodo.slice(6)) - 1) * 3;
    return [first, first + 1, first + 2];
  }

  if (PERIODO_ANUAL.test(periodo)) return Array.from({ length: 12 }, (_, month) => month);

  return null;
}

/**
 * S6: la base del tributo es el ingreso o el salario del período, ya con las
 * correcciones del Owner aplicadas (los salarios no se corrigen: solo ingresos
 * y gastos tienen override).
 */
function baseAmount(
  obligacion: OnatObligacion,
  rowsByMonth: ReadonlyMap<number, VectorRow>,
): number | null {
  const months = monthsOfPeriod(obligacion.periodo);
  if (months === null) return null;

  if (obligacion.base === 'ingresos') {
    return months.reduce((total, month) => total + (rowsByMonth.get(month)?.income ?? 0), 0);
  }

  if (obligacion.base === 'salarios') {
    return months.reduce(
      (total, month) => total + (rowsByMonth.get(month)?.month.salaries ?? 0),
      0,
    );
  }

  return null;
}

/**
 * S3: el importe del vector manda; sin importe se calcula `base × porcentaje`;
 * sin ninguno de los dos la obligación queda pendiente de declarar.
 */
function obligationAmount(
  obligacion: OnatObligacion,
  rowsByMonth: ReadonlyMap<number, VectorRow>,
): number | null {
  if (obligacion.importe !== null) return obligacion.importe;
  if (obligacion.porcentaje === null) return null;

  const base = baseAmount(obligacion, rowsByMonth);
  return base === null ? null : round2(base * obligacion.porcentaje);
}

function statusMessageId(obligacion: OnatObligacion): string {
  if (!obligacion.pagado) return 'ONAT.UNPAID';
  if (obligacion.canalPago === 'efectivo') return 'ONAT.PAID_CASH';
  if (obligacion.canalPago === 'electronico') return 'ONAT.PAID_ELECTRONIC';
  return 'ONAT.PAID';
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
  const [aggregationFailed, setAggregationFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [overrides, setOverrides] = useState<OnatOverrides>({});
  const [pagaAntesDel28Febrero, setPagaAntesDel28Febrero] = useState(false);
  const [obligaciones, setObligaciones] = useState<OnatObligacion[]>([]);
  const [agendaFailed, setAgendaFailed] = useState(false);

  const storeIds = useMemo(() => resolveStoreIds(user), [user]);
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: YEAR_RANGE }, (_, index) => current - index);
  }, []);

  useEffect(() => {
    setOverrides(ownerId ? getOnatOverrides(ownerId) : {});
  }, [ownerId]);

  // S1/S5: la agenda es la del vector de ESTE Owner y ESTE año; se relee al
  // cambiar de ejercicio porque cada uno tiene sus propias obligaciones.
  useEffect(() => {
    setObligaciones(ownerId ? getOnatVector(ownerId, year).obligaciones : []);
    setAgendaFailed(false);
  }, [ownerId, year]);

  useEffect(() => {
    let cancelled = false;
    setAggregation(null);
    setAggregationFailed(false);
    void aggregateOnatMonths({ storeIds, year })
      .then((result) => {
        if (!cancelled) setAggregation(result);
      })
      .catch(() => {
        // Un rechazo (por ejemplo, el almacenamiento no se puede leer) no puede
        // dejar la pantalla en "cargando" para siempre: se ofrece reintentar.
        if (!cancelled) setAggregationFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storeIds, year, retryToken]);

  const rows = useMemo<VectorRow[]>(() => {
    if (!aggregation) return [];

    return aggregation.months.map((month) => {
      const overridesMes = monthOverridesFor(overrides, year, month.month);
      const income = overridesMes?.ingresos?.value ?? month.income;
      // S4/S8: la columna Gastos muestra solo el gasto deducible del período
      // (sin los tributos fiscales, que se restan por sus propias líneas del
      // cierre). Así el override sustituye exactamente la misma magnitud.
      const expenses = overridesMes?.gastos?.value ?? month.nonTaxExpenses;

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

  const rowsByMonth = useMemo(
    () => new Map(rows.map((row) => [row.month.month, row])),
    [rows],
  );

  const agenda = useMemo<AgendaGroup[]>(() => {
    const groups = new Map<string, OnatObligacion[]>();

    for (const obligacion of obligaciones) {
      const group = groups.get(obligacion.periodo);
      if (group === undefined) {
        groups.set(obligacion.periodo, [obligacion]);
      } else {
        group.push(obligacion);
      }
    }

    return [...groups].map(([periodo, group]) => ({ periodo, obligaciones: group }));
  }, [obligaciones]);

  const annualTotals = useMemo(() => {
    const months = aggregation?.months ?? [];

    return {
      // S8: ingresos y gastos salen de la MISMA fila que pinta la tabla, así que
      // un override tiene una sola precedencia y no hay dos fuentes que puedan
      // discrepar. El gasto de la fila es el deducible: los tributos, zonas,
      // arrendamientos, exoneraciones y la cuota se restan por sus propias líneas.
      ingresos: rows.reduce((total, row) => total + row.income, 0),
      gastos: rows.reduce((total, row) => total + row.expenses, 0),
      tributosDeducibles: TRIBUTOS_DEDUCIBLES.reduce(
        (total, entry) => total + sumTaxBucket(months, entry.tipo),
        0,
      ),
      contribucionZonas: sumTaxBucket(months, ExpenseType.ContribucionZonas),
      arrendamientos: sumTaxBucket(months, ExpenseType.ArrendamientoEntidades),
      exoneraciones: sumTaxBucket(months, ExpenseType.ExoneracionReparaciones),
      cuotasPagadas: sumTaxBucket(months, ExpenseType.CuotaMensual),
    };
  }, [aggregation, rows]);

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
        year,
        ingresos: annualTotals.ingresos,
        gastos: annualTotals.gastos,
        tributosDeducibles: annualTotals.tributosDeducibles,
        contribucionZonas: annualTotals.contribucionZonas,
        arrendamientos: annualTotals.arrendamientos,
        exoneraciones: annualTotals.exoneraciones,
        cuotasPagadas: annualTotals.cuotasPagadas,
        pagaAntesDel28Febrero,
      }),
    [annualTotals, pagaAntesDel28Febrero, year],
  );

  const saveOverride = (month: OnatMonth, field: OverrideField, value: number): boolean => {
    if (!ownerId) return false;
    // S3/S4: `original` es el agregado de ESTE instante, no un valor recalculado.
    const aggregated = field === 'ingresos' ? month.income : month.nonTaxExpenses;
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

  const refreshAgenda = () => {
    setObligaciones(ownerId ? getOnatVector(ownerId, year).obligaciones : []);
  };

  const toggleObligacionPagada = (obligacion: OnatObligacion) => {
    if (!ownerId) return;
    const result = setObligacionPagada(
      ownerId,
      year,
      obligacion.periodo,
      obligacion.codigo,
      !obligacion.pagado,
    );
    setAgendaFailed(!result.succeeded);
    if (result.succeeded) refreshAgenda();
  };

  const chooseChannel = (obligacion: OnatObligacion, canalPago: OnatCanalPago) => {
    if (!ownerId) return;
    const result = setCanalPago(ownerId, year, obligacion.periodo, obligacion.codigo, canalPago);
    setAgendaFailed(!result.succeeded);
    if (result.succeeded) refreshAgenda();
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

      {aggregationFailed ? (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-border bg-surface p-3"
        >
          <p className="text-sm font-medium text-danger">
            {intl.formatMessage({ id: 'ONAT.LOAD_ERROR' })}
          </p>
          <button
            type="button"
            onClick={() => setRetryToken((token) => token + 1)}
            className="text-sm font-medium text-primary"
          >
            {intl.formatMessage({ id: 'ONAT.RETRY' })}
          </button>
        </div>
      ) : aggregation === null ? (
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

          <section
            aria-labelledby="onat-agenda"
            className="space-y-3 rounded-lg border border-border bg-surface p-4"
          >
            <div>
              <h2 id="onat-agenda" className="text-sm font-semibold text-text">
                {intl.formatMessage({ id: 'ONAT.AGENDA' })}
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                {intl.formatMessage({ id: 'ONAT.AGENDA_HINT' })}
              </p>
            </div>

            {agendaFailed && (
              <p role="alert" className="text-sm font-medium text-danger">
                {intl.formatMessage({ id: 'ONAT.SAVE_ERROR' })}
              </p>
            )}

            {agenda.length === 0 ? (
              <p className="text-sm text-text-muted">
                {intl.formatMessage({ id: 'ONAT.AGENDA_EMPTY' })}
              </p>
            ) : (
              agenda.map((group) => (
                <section
                  key={group.periodo}
                  aria-labelledby={`onat-periodo-${group.periodo}`}
                  className="space-y-2"
                >
                  <h3
                    id={`onat-periodo-${group.periodo}`}
                    className="text-sm font-medium text-text"
                  >
                    {group.periodo}
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-text-muted">
                          <th className="px-3 py-2 font-medium">
                            {intl.formatMessage({ id: 'ONAT.DUE_DATE' })}
                          </th>
                          <th className="px-3 py-2 font-medium">
                            {intl.formatMessage({ id: 'ONAT.CODE' })}
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            {intl.formatMessage({ id: 'ONAT.AMOUNT' })}
                          </th>
                          <th className="px-3 py-2 font-medium">
                            {intl.formatMessage({ id: 'ONAT.RC04A' })}
                          </th>
                          <th className="px-3 py-2 font-medium">
                            {intl.formatMessage({ id: 'ONAT.STATUS' })}
                          </th>
                          <th className="px-3 py-2 font-medium">
                            {intl.formatMessage({ id: 'ONAT.ACTIONS' })}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.obligaciones.map((obligacion, index) => {
                          const amount = obligationAmount(obligacion, rowsByMonth);

                          return (
                            <tr
                              key={`${obligacion.codigo}-${index}`}
                              className="border-b border-border last:border-b-0"
                            >
                              <td className="px-3 py-2 text-text">{obligacion.vence}</td>
                              <td className="px-3 py-2 text-text">{obligacion.codigo}</td>
                              <td className="px-3 py-2 text-right text-text">
                                {amount === null
                                  ? intl.formatMessage({ id: 'ONAT.PENDING_DECLARATION' })
                                  : formatCup(amount)}
                              </td>
                              <td className="px-3 py-2 text-text">{obligacion.rc04a}</td>
                              <td className="px-3 py-2 text-text">
                                {intl.formatMessage({ id: statusMessageId(obligacion) })}
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="space-y-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleObligacionPagada(obligacion)}
                                    aria-label={intl.formatMessage(
                                      {
                                        id: obligacion.pagado
                                          ? 'ONAT.MARK_UNPAID_FOR'
                                          : 'ONAT.MARK_PAID_FOR',
                                      },
                                      {
                                        codigo: obligacion.codigo,
                                        periodo: obligacion.periodo,
                                      },
                                    )}
                                    className="text-xs font-medium text-primary"
                                  >
                                    {intl.formatMessage({
                                      id: obligacion.pagado
                                        ? 'ONAT.MARK_UNPAID'
                                        : 'ONAT.MARK_PAID',
                                    })}
                                  </button>

                                  {obligacion.pagado && obligacion.canalPago === null && (
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium text-text">
                                        {intl.formatMessage({ id: 'ONAT.CHANNEL_QUESTION' })}
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            chooseChannel(obligacion, 'efectivo')
                                          }
                                          aria-label={intl.formatMessage(
                                            { id: 'ONAT.CHANNEL_CASH_FOR' },
                                            {
                                              codigo: obligacion.codigo,
                                              periodo: obligacion.periodo,
                                            },
                                          )}
                                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text"
                                        >
                                          {intl.formatMessage({ id: 'ONAT.CHANNEL_CASH' })}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            chooseChannel(obligacion, 'electronico')
                                          }
                                          aria-label={intl.formatMessage(
                                            { id: 'ONAT.CHANNEL_ELECTRONIC_FOR' },
                                            {
                                              codigo: obligacion.codigo,
                                              periodo: obligacion.periodo,
                                            },
                                          )}
                                          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text"
                                        >
                                          {intl.formatMessage({
                                            id: 'ONAT.CHANNEL_ELECTRONIC',
                                          })}
                                        </button>
                                      </div>
                                      <p className="text-xs text-text-muted">
                                        {intl.formatMessage({ id: 'ONAT.CHANNEL_NOTE' })}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))
            )}
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

          {(aggregation.warnings.length > 0 ||
            aggregation.skipped.withoutRate > 0 ||
            aggregation.skipped.undated > 0) && (
            <section className="rounded-lg border border-border bg-surface p-3">
              <h2 className="text-sm font-semibold text-text">
                {intl.formatMessage({ id: 'ONAT.WARNINGS' })}
              </h2>
              <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-text-muted">
                {aggregation.skipped.withoutRate > 0 && (
                  <li>
                    {intl.formatMessage(
                      { id: 'ONAT.SKIPPED_RATES' },
                      { count: aggregation.skipped.withoutRate },
                    )}
                  </li>
                )}
                {aggregation.skipped.undated > 0 && (
                  <li>
                    {intl.formatMessage(
                      { id: 'ONAT.SKIPPED_UNDATED' },
                      { count: aggregation.skipped.undated },
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
