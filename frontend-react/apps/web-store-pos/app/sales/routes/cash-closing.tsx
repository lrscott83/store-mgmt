import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { DEFAULT_CURRENCY, EFeatures } from '@store-mgmt/domain';
import type { Currency as CurrencyType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useDataRevisionStore } from '~/shared/lib/stores/data-revision-store';
import { toLocalDayKey } from '~/shared/lib/date-utils';
import { presentCurrencies } from '~/shared/lib/currency-totals';
import { useCurrencyFilter } from '~/shared/components/multimonedas/use-currency-filter';
import { CurrencyFilter } from '~/shared/components/multimonedas/currency-filter';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { Modal } from '~/shared/components/ui/modal';
import { showToastSuccess, showToastError } from '~/shared/lib/toast';
import { DenominationCountCard } from '../components/denomination-count-card';
import {
  CashClosingOfflineService,
  differenceOf,
} from '../lib/cash-closing/cash-closing-offline-service';
import {
  CashClosingStatus,
  countedTotalOf,
  sortDenominationsDesc,
} from '../lib/cash-closing/cash-closing-types';
import type {
  CashClosingDenomination,
} from '../lib/cash-closing/cash-closing-types';

export const clientLoader = featureLoader([EFeatures.Sale]);

/** Parsea un importe tecleado (dígitos y un punto); vacío/ inválido → 0. */
function parseAmount(raw: string): number {
  const parsed = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Conteo a denominaciones persistibles `{ value, count }` (mayor a menor). */
function toDenominations(counts: Readonly<Record<string, number>>): CashClosingDenomination[] {
  return sortDenominationsDesc(Object.keys(counts).map(Number)).map((value) => ({
    value,
    count: counts[String(value)] ?? 0,
  }));
}

/**
 * Cierre Efectivo (cierre-efectivo, 2026-10-14): cuadre diario del EFECTIVO.
 * Solo efectivo (S1). Un registro por (día local, moneda) (S13). Header con el
 * botón `Cerrar Caja` a la derecha (S3/S6), resumen Esperado/Contado/Diferencia
 * (S7/S8), textbox de Apertura (S9) y card de Conteo por denominaciones (S10/S11).
 */
export function CashClosingPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const actor = user?.login ?? '';
  // Relee al cambiar los datos de la tienda (una venta del día mueve el Esperado).
  const revision = useDataRevisionStore((s) => s.revision);

  const dayKey = useMemo(() => toLocalDayKey(new Date()), []);
  const service = useMemo(() => new CashClosingOfflineService(storeId), [storeId]);

  const currencyOptions = useMemo(
    () =>
      presentCurrencies([
        ...service.getCashSalesEntries(dayKey, storeId),
        // expense-fund-source (2026-10-24): una moneda que solo aparece en
        // gastos de caja también debe poder cerrarse.
        ...service.getCashExpensesEntries(dayKey, storeId),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [service, dayKey, storeId, revision],
  );
  const { visible: filterVisible, currency, setCurrency } = useCurrencyFilter(currencyOptions);
  const selectedCurrency: CurrencyType = currency ?? DEFAULT_CURRENCY;

  const closing = service.getClosing(dayKey, selectedCurrency, storeId);
  const isClosed = closing?.status === CashClosingStatus.Closed;
  const denominationValues = service.getDenominationValues(selectedCurrency, storeId);

  // Estado de edición local: se reinicia al cambiar (día, moneda).
  const recordKey = `${dayKey}|${selectedCurrency}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [openingText, setOpeningText] = useState('0');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  if (loadedKey !== recordKey) {
    setLoadedKey(recordKey);
    setOpeningText(closing ? String(closing.openingCash) : '0');
    setCounts(
      closing
        ? Object.fromEntries(closing.denominations.map((d) => [String(d.value), d.count]))
        : {},
    );
    setComment(closing?.comment ?? '');
  }

  // Denominaciones a mostrar: el catálogo de la moneda más cualquier valor que
  // ya venga en el conteo (por si el catálogo cambió después).
  const allDenominations = sortDenominationsDesc([
    ...denominationValues,
    ...Object.keys(counts).map(Number),
  ]);

  const openingCash = parseAmount(openingText);
  // expense-fund-source (2026-10-24): el Esperado del cierre resta los gastos
  // pagados con dinero de la caja. Delegado al servicio: una sola fórmula para
  // la vista, el borrador y el snapshot del cierre cerrado.
  const cashExpensesTotal = service.getCashExpensesTotal(dayKey, selectedCurrency, storeId);
  const expectedTotal = service.getExpectedTotal(
    dayKey,
    selectedCurrency,
    openingCash,
    storeId,
  );
  const countedTotal = countedTotalOf(toDenominations(counts));
  const difference = differenceOf(countedTotal, expectedTotal);
  const differenceClassName = difference < 0 ? 'text-danger' : 'text-success';
  const commentRequired = difference !== 0;
  const canConfirm = !commentRequired || comment.trim().length > 0;

  function persist(nextOpening: number, nextCounts: Record<string, number>, nextComment: string) {
    try {
      service.saveDraft(
        {
          dayKey,
          currency: selectedCurrency,
          openingCash: nextOpening,
          denominations: toDenominations(nextCounts),
          comment: nextComment,
        },
        actor,
        storeId,
      );
    } catch {
      showToastError(intl.formatMessage({ id: 'CASH_CLOSING.SAVE_ERROR' }));
    }
  }

  function handleOpeningChange(raw: string) {
    const cleaned = raw.replace(/[^\d.]/g, '');
    setOpeningText(cleaned);
    persist(parseAmount(cleaned), counts, comment);
  }

  function handleCountChange(value: number, count: number) {
    const next = { ...counts, [String(value)]: count };
    setCounts(next);
    persist(openingCash, next, comment);
  }

  function handleCommentChange(raw: string) {
    setComment(raw);
    persist(openingCash, counts, raw);
  }

  function handleAddDenomination(value: number) {
    service.addDenominationValue(selectedCurrency, value, storeId);
    if (!allDenominations.includes(value)) {
      setCounts((prev) => ({ ...prev, [String(value)]: prev[String(value)] ?? 0 }));
    }
  }

  function handleConfirmClose() {
    try {
      service.closeClosing(
        {
          dayKey,
          currency: selectedCurrency,
          openingCash,
          denominations: toDenominations(counts),
          comment,
        },
        actor,
        storeId,
      );
      setIsConfirmOpen(false);
      showToastSuccess(intl.formatMessage({ id: 'CASH_CLOSING.CLOSED_SUCCESS' }));
    } catch {
      showToastError(intl.formatMessage({ id: 'CASH_CLOSING.SAVE_ERROR' }));
    }
  }

  return (
    <Card
      padding="tight"
      title={
        <span className="flex items-center gap-2">
          {intl.formatMessage({ id: 'CASH_CLOSING.TITLE' })}
          <span
            data-testid="cash-closing-status"
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              isClosed ? 'bg-gray-200 text-gray-700' : 'bg-success/10 text-success'
            }`}
          >
            {intl.formatMessage({
              id: isClosed ? 'CASH_CLOSING.STATUS_CLOSED' : 'CASH_CLOSING.STATUS_OPEN',
            })}
          </span>
        </span>
      }
      headerAction={
        <Button
          variant="primary"
          onClick={() => setIsConfirmOpen(true)}
          disabled={isClosed}
        >
          {intl.formatMessage({ id: 'CASH_CLOSING.CLOSE_BUTTON' })}
        </Button>
      }
    >
      {filterVisible && (
        <div className="mb-3">
          <CurrencyFilter
            currencies={currencyOptions}
            value={selectedCurrency}
            onChange={setCurrency}
          />
        </div>
      )}

      {isClosed && (
        <p
          data-testid="cash-closing-closed-notice"
          className="mb-3 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700"
        >
          {intl.formatMessage({ id: 'CASH_CLOSING.CLOSED_NOTICE' })}
        </p>
      )}

      {/* Resumen: Esperado / Contado / Diferencia (S7/S8) */}
      <div
        data-testid="cash-closing-summary"
        className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        <SummaryTile
          label={intl.formatMessage({ id: 'CASH_CLOSING.EXPECTED' })}
          value={formatMoneyWithCurrency(expectedTotal, selectedCurrency)}
          testId="cash-closing-expected"
        />
        <SummaryTile
          label={intl.formatMessage({ id: 'CASH_CLOSING.COUNTED' })}
          value={formatMoneyWithCurrency(countedTotal, selectedCurrency)}
          testId="cash-closing-counted"
        />
        <SummaryTile
          label={intl.formatMessage({ id: 'CASH_CLOSING.DIFFERENCE' })}
          value={formatMoneyWithCurrency(difference, selectedCurrency)}
          valueClassName={differenceClassName}
          testId="cash-closing-difference"
        />
      </div>

      {/* expense-fund-source (2026-10-24): qué parte del Esperado son gastos
          pagados con dinero de la caja. Solo informativo — ya está restado. */}
      <p
        data-testid="cash-closing-cash-expenses"
        className="mb-4 text-sm text-text-muted"
      >
        {intl.formatMessage(
          { id: 'CASH_CLOSING.CASH_EXPENSES' },
          { amount: formatMoneyWithCurrency(cashExpensesTotal, selectedCurrency) },
        )}
      </p>

      {/* Apertura (S9) */}
      <div className="mb-4 flex flex-col gap-1">
        <label htmlFor="cash-closing-opening" className="text-sm font-medium text-text">
          {intl.formatMessage({ id: 'CASH_CLOSING.OPENING' })}
        </label>
        <input
          id="cash-closing-opening"
          type="text"
          inputMode="decimal"
          value={openingText}
          disabled={isClosed}
          onChange={(e) => handleOpeningChange(e.target.value)}
          data-testid="cash-closing-opening"
          className="h-10 w-full max-w-xs rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-surface-hover"
        />
      </div>

      {/* Conteo (S10/S11) */}
      <Card
        padding="default"
        title={intl.formatMessage({ id: 'CASH_CLOSING.COUNT_TITLE' })}
      >
        <DenominationCountCard
          denominations={allDenominations}
          counts={counts}
          currency={selectedCurrency}
          disabled={isClosed}
          onChangeCount={handleCountChange}
          onAddDenomination={handleAddDenomination}
        />
      </Card>

      {/* Comentario (S4): obligatorio al cerrar cuando la diferencia no es cero */}
      <div className="mt-4 flex flex-col gap-1">
        <label htmlFor="cash-closing-comment" className="text-sm font-medium text-text">
          {intl.formatMessage({ id: 'CASH_CLOSING.COMMENT' })}
        </label>
        <textarea
          id="cash-closing-comment"
          value={comment}
          disabled={isClosed}
          rows={2}
          onChange={(e) => handleCommentChange(e.target.value)}
          data-testid="cash-closing-comment"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-surface-hover"
        />
        {commentRequired && !isClosed && (
          <p data-testid="cash-closing-comment-required" className="text-xs text-danger">
            {intl.formatMessage({ id: 'CASH_CLOSING.COMMENT_REQUIRED' })}
          </p>
        )}
      </div>

      {/* Confirmación de cierre (S3/S4) */}
      <Modal
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title={intl.formatMessage({ id: 'CASH_CLOSING.CONFIRM_TITLE' })}
        testId="cash-closing-confirm"
      >
        <p className="mb-3 text-sm text-text">
          {intl.formatMessage({ id: 'CASH_CLOSING.CONFIRM_MESSAGE' })}
        </p>
        <dl className="mb-3 space-y-1 text-sm" data-testid="cash-closing-confirm-summary">
          <ConfirmRow
            label={intl.formatMessage({ id: 'CASH_CLOSING.EXPECTED' })}
            value={formatMoneyWithCurrency(expectedTotal, selectedCurrency)}
          />
          <ConfirmRow
            label={intl.formatMessage({ id: 'CASH_CLOSING.COUNTED' })}
            value={formatMoneyWithCurrency(countedTotal, selectedCurrency)}
          />
          <ConfirmRow
            label={intl.formatMessage({ id: 'CASH_CLOSING.DIFFERENCE' })}
            value={formatMoneyWithCurrency(difference, selectedCurrency)}
            valueClassName={differenceClassName}
          />
        </dl>
        {commentRequired && (
          <p data-testid="cash-closing-confirm-comment-warning" className="mb-2 text-xs text-danger">
            {intl.formatMessage({ id: 'CASH_CLOSING.COMMENT_REQUIRED' })}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsConfirmOpen(false)}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover"
          >
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </button>
          <Button
            variant="primary"
            onClick={handleConfirmClose}
            disabled={!canConfirm}
            data-testid="cash-closing-confirm-button"
          >
            {intl.formatMessage({ id: 'CASH_CLOSING.CLOSE_BUTTON' })}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  valueClassName = 'text-text',
  testId,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  testId: string;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`text-lg font-bold ${valueClassName}`} data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

function ConfirmRow({
  label,
  value,
  valueClassName = 'text-text',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`font-semibold ${valueClassName}`}>{value}</dd>
    </div>
  );
}

export default CashClosingPage;
