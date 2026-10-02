import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Module, ModuleCatalogPricingPayload, Plan } from '@store-mgmt/domain';
import { superAdminLoader } from '~/auth/routes/loaders';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { Spinner } from '~/shared/components/ui/spinner';
import { showToastSuccess } from '~/shared/lib/toast';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import {
  ModuleCatalogTable,
  type ModuleCatalogField,
  type ModuleCatalogRow,
} from '~/admin/modules/components/module-catalog-table';

export const clientLoader = superAdminLoader;

/**
 * Draft price text -> the number the payload and the domain formula consume. The draft holds
 * text so a decimal point survives being typed; a half-typed or non-numeric value is 0 here,
 * which the formula clamps at zero rather than turning into NaN in the running totals. The
 * backend validator is the authority on the submitted values, not this conversion.
 */
function toPriceNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toRows(modules: Module[]): ModuleCatalogRow[] {
  return modules.map((module) => ({
    moduleId: module.id,
    name: module.name,
    // The two inputs to the price rule. Server-owned: the operator edits prices, never the
    // flags that decide whether a row reaches the total.
    isActive: module.isActive,
    priceIncluded: module.priceIncluded,
    // String() keeps the operator looking at the exact digits the server sent: the backend
    // prices are float32, so 10.1 must not become 10.100000000000001 in the input.
    price: String(module.price),
    discountPrice: String(module.discountPrice ?? 0),
    percentDiscountPrice: String(module.percentDiscountPrice ?? 0),
  }));
}

/**
 * SuperAdmin editor for the GLOBAL module catalog prices (base price, percent discount, flat
 * discount), grouped by plan with the offer shown as a struck-through base next to the live
 * effective price.
 *
 * SuperAdmin-only by construction: `clientLoader` refuses every other role before this
 * component renders and the endpoint is 403 for them too, so no role check is duplicated here.
 *
 * Prices are GLOBAL — one per module. The per-STORE frozen copies on `StoreModule` are a
 * different capability (PUT /v1/stores/{id}/module-pricing) and are untouched by this page, so
 * editing the catalog can never silently reprice a store.
 *
 * The save payload is the WHOLE table the operator was shown, never the plan groups: the
 * backend save is all-or-nothing and reads a module's absence as "leave it untouched", so a
 * grouped, filtered or deduplicated payload would silently skip rows the operator expected to
 * be saved. `GET /v1/modules/ToStore` already returns exactly the editable universe
 * (`IsActive && AvailableToStore`), so no client-side universe filter is needed.
 */
export function ModuleCatalogPage() {
  const { formatMessage } = useIntl();
  const [rows, setRows] = useState<ModuleCatalogRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      // The plan catalog drives the VISUAL grouping only; it never gates, filters or reorders
      // what is saved. Both reads are needed before the first render, hence Promise.all.
      const [modulesRes, plansRes] = await Promise.all([
        storeHttpService.getModulesToStore(),
        storeHttpService.getPlans(),
      ]);
      if (!modulesRes.succeeded || !plansRes.succeeded) {
        setError(formatMessage({ id: 'MODULE_CATALOG.ERROR' }));
        return;
      }
      setRows(toRows(modulesRes.data));
      setPlans(plansRes.data);
      setError(undefined);
    } catch (error) {
      setError(formatMessage({ id: httpErrorKey(error, 'MODULE_CATALOG.ERROR') }));
    } finally {
      setIsLoading(false);
    }
  }, [formatMessage]);

  useEffect(() => {
    load();
  }, [load]);

  function handleChangeField(
    moduleId: number,
    field: ModuleCatalogField,
    value: string,
  ): void {
    setRows((current) =>
      current.map((row) => (row.moduleId === moduleId ? { ...row, [field]: value } : row)),
    );
  }

  async function handleSave() {
    if (isSaving || isLoading || rows.length === 0) return;
    setError('');
    setIsSaving(true);
    try {
      const payload: ModuleCatalogPricingPayload[] = rows.map((row) => ({
        moduleId: row.moduleId,
        price: toPriceNumber(row.price),
        discountPrice: toPriceNumber(row.discountPrice),
        percentDiscountPrice: toPriceNumber(row.percentDiscountPrice),
      }));
      const saved = await storeHttpService.updateModulePricing(payload);
      if (!saved.succeeded) {
        setError(formatMessage({ id: 'MODULE_CATALOG.ERROR' }));
        return;
      }
      showToastSuccess(
        formatMessage({ id: 'MODULE_CATALOG.SAVE_SUCCESS' }),
        formatMessage({ id: 'GENERAL.RESPONSE.SUCCESS_TITLE' }),
      );
      // Refetch instead of trusting the echo: the save echo carries only the pricing fields,
      // and the catalog read is the authority on what the table now shows.
      await load();
    } catch (error) {
      // The edits stay on screen: the draft IS the state, and a failed save never clears it,
      // so the same correction can be retried without retyping the table.
      setError(formatMessage({ id: httpErrorKey(error, 'MODULE_CATALOG.ERROR') }));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{formatMessage({ id: 'MODULE_CATALOG.TITLE' })}</h1>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={isLoading || isSaving || rows.length === 0}
          data-testid="module-catalog-save"
        >
          {isSaving
            ? formatMessage({ id: 'MODULE_CATALOG.SAVING' })
            : formatMessage({ id: 'MODULE_CATALOG.SAVE' })}
        </Button>
      </div>

      <p className="text-xs text-text-muted">{formatMessage({ id: 'MODULE_CATALOG.HINT' })}</p>

      {error && (
        <p role="alert" className="text-sm text-red-600" data-testid="module-catalog-error">
          {error}
        </p>
      )}

      <Card padding="tight">
        {isLoading ? (
          <Spinner label={formatMessage({ id: 'MODULE_CATALOG.LOADING' })} />
        ) : (
          <ModuleCatalogTable
            rows={rows}
            plans={plans}
            disabled={isSaving}
            onChangeField={handleChangeField}
          />
        )}
      </Card>
    </div>
  );
}

export default ModuleCatalogPage;
