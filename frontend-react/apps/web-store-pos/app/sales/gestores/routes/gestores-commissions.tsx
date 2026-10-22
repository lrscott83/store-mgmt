import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Currency, EFeatures, SalesCommissionType, type Product } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Spinner } from '~/shared/components/ui/spinner';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { createProductCategoryService } from '~/sales/lib/services/product-category-service.factory';
import { createProductService } from '~/sales/lib/services/product-service.factory';
import {
  salesCommissionHttpService,
  type ProductSalesCommissionDto,
} from '../lib/sales-commission-http-service';

/**
 * Gate de la configuración de comisiones (módulo 21 + feature 125): el backend exige
 * `GestoresVentasAdmin`, que solo mapea al OwnerAdmin. `featureLoader` deja pasar al dueño con el
 * módulo activo; sin módulo no hay feature 125 en `/me` y el backend respondería 403.
 */
export const clientLoader = featureLoader([EFeatures.GestoresVentas]);

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

const CURRENCIES: readonly Currency[] = [
  Currency.CUP,
  Currency.USD,
  Currency.EUR,
  Currency.CLA,
  Currency.MLC,
  Currency.CAD,
  Currency.MXN,
];

/** `null` = el producto no genera comisión. */
type CommissionChoice = SalesCommissionType | null;

interface Draft {
  type: CommissionChoice;
  value: string;
  currency: Currency;
}

/**
 * T8b: el Owner define, producto por producto, si el gestor gana un porcentaje sobre el precio o
 * un monto fijo por unidad, y en qué moneda se le paga. Sin configuración no se genera comisión.
 * La comisión se calcula y se congela al entregar el pedido, por eso aquí solo se configuran las
 * reglas vigentes.
 */
export default function GestoresCommissionsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [products, setProducts] = useState<Product[]>([]);
  const [configs, setConfigs] = useState<Record<string, ProductSalesCommissionDto>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [categories, configsResult] = await Promise.all([
        createProductCategoryService(storeId).getProductCategoriesView(),
        salesCommissionHttpService.list(),
      ]);

      const productService = createProductService(storeId);
      const perCategory = await Promise.all(
        (categories.data ?? []).map((category) =>
          productService.getAvailableProductsByCategoryId(category.id),
        ),
      );
      const loadedProducts = perCategory.flatMap((result) => result.data ?? []);

      const configMap: Record<string, ProductSalesCommissionDto> = {};
      for (const config of configsResult.data ?? []) {
        configMap[config.productId] = config;
      }

      const nextDrafts: Record<string, Draft> = {};
      for (const product of loadedProducts) {
        const config = configMap[product.id];
        nextDrafts[product.id] = {
          type: config?.type ?? null,
          value: config ? String(config.value) : '',
          currency: config?.currency ?? product.currency ?? Currency.CUP,
        };
      }

      setProducts(loadedProducts);
      setConfigs(configMap);
      setDrafts(nextDrafts);
    } catch {
      setError(intl.formatMessage({ id: 'GESTORES.LOAD_ERROR' }));
    } finally {
      setIsLoading(false);
    }
  }, [intl, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDraft = (productId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const current = prev[productId];
      if (!current) return prev;
      return { ...prev, [productId]: { ...current, ...patch } };
    });
  };

  const save = async (product: Product) => {
    const draft = drafts[product.id];
    if (!draft || draft.type === null) return;

    setSavingId(product.id);
    try {
      const value = Number(draft.value.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) {
        showBlockingError(
          intl.formatMessage({ id: 'GESTORES.TITLE' }),
          intl.formatMessage({ id: 'GESTORES.INVALID_VALUE' }),
        );
        return;
      }

      const type = draft.type;
      const currency = draft.currency;
      const result = await salesCommissionHttpService.upsert(product.id, {
        type,
        value,
        currency,
      });
      if (!result.succeeded) {
        throw new Error('upsert rejected');
      }

      setConfigs((prev) => ({
        ...prev,
        [product.id]: { productId: product.id, type, value, currency },
      }));
      showToastSuccess(intl.formatMessage({ id: 'GESTORES.SAVED' }));
    } catch {
      showBlockingError(
        intl.formatMessage({ id: 'GESTORES.TITLE' }),
        intl.formatMessage({ id: 'GESTORES.SAVE_ERROR' }),
      );
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (product: Product) => {
    if (!configs[product.id]) return;

    setSavingId(product.id);
    try {
      const result = await salesCommissionHttpService.remove(product.id);
      if (!result.succeeded) {
        throw new Error('delete rejected');
      }
      setConfigs((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      updateDraft(product.id, { type: null, value: '' });
      showToastSuccess(intl.formatMessage({ id: 'GESTORES.REMOVED' }));
    } catch {
      showBlockingError(
        intl.formatMessage({ id: 'GESTORES.TITLE' }),
        intl.formatMessage({ id: 'GESTORES.SAVE_ERROR' }),
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card padding="tight" title={intl.formatMessage({ id: 'GESTORES.TITLE' })}>
        <p className="text-sm text-text-muted">{intl.formatMessage({ id: 'GESTORES.SUBTITLE' })}</p>
      </Card>

      {isLoading && <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />}

      {!isLoading && error && (
        <InfoBox variant="danger" className="text-center">
          <span data-testid="gestores-error">{error}</span>
        </InfoBox>
      )}

      {!isLoading && !error && products.length === 0 && (
        <InfoBox className="text-center">{intl.formatMessage({ id: 'GESTORES.EMPTY' })}</InfoBox>
      )}

      {!isLoading && !error && products.length > 0 && (
        <Card padding="tight">
          <ul className="divide-y divide-border" data-testid="gestores-products">
            {products.map((product) => {
              const draft = drafts[product.id];
              if (!draft) return null;
              const hasConfig = configs[product.id] !== undefined;
              const currency = product.currency ?? Currency.CUP;

              return (
                <li
                  key={product.id}
                  className="flex flex-col gap-3 py-3 lg:flex-row lg:items-end"
                  data-testid={`gestores-product-${product.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{product.name}</p>
                    <p className="text-xs text-text-muted">
                      {product.price} {Currency[currency]}
                    </p>
                  </div>

                  <div className="w-full lg:w-44">
                    <label
                      className="mb-1 block text-xs font-medium text-text"
                      htmlFor={`type-${product.id}`}
                    >
                      {intl.formatMessage({ id: 'GESTORES.TYPE' })}
                    </label>
                    <select
                      id={`type-${product.id}`}
                      className={INPUT_CLASSES}
                      value={draft.type === null ? '' : String(draft.type)}
                      onChange={(event) =>
                        updateDraft(product.id, {
                          type:
                            event.target.value === ''
                              ? null
                              : (Number(event.target.value) as SalesCommissionType),
                        })
                      }
                    >
                      <option value="">{intl.formatMessage({ id: 'GESTORES.NONE' })}</option>
                      <option value={String(SalesCommissionType.Percentage)}>
                        {intl.formatMessage({ id: 'GESTORES.PERCENTAGE' })}
                      </option>
                      <option value={String(SalesCommissionType.Fixed)}>
                        {intl.formatMessage({ id: 'GESTORES.FIXED' })}
                      </option>
                    </select>
                  </div>

                  <div className="w-full lg:w-32">
                    <label
                      className="mb-1 block text-xs font-medium text-text"
                      htmlFor={`value-${product.id}`}
                    >
                      {draft.type === SalesCommissionType.Percentage
                        ? intl.formatMessage({ id: 'GESTORES.PERCENT_VALUE' })
                        : intl.formatMessage({ id: 'GESTORES.FIXED_VALUE' })}
                    </label>
                    <input
                      id={`value-${product.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      className={INPUT_CLASSES}
                      disabled={draft.type === null}
                      value={draft.value}
                      onChange={(event) => updateDraft(product.id, { value: event.target.value })}
                    />
                  </div>

                  <div className="w-full lg:w-28">
                    <label
                      className="mb-1 block text-xs font-medium text-text"
                      htmlFor={`currency-${product.id}`}
                    >
                      {intl.formatMessage({ id: 'GESTORES.CURRENCY' })}
                    </label>
                    <select
                      id={`currency-${product.id}`}
                      className={INPUT_CLASSES}
                      disabled={draft.type === null}
                      value={draft.currency}
                      onChange={(event) =>
                        updateDraft(product.id, {
                          currency: Number(event.target.value) as Currency,
                        })
                      }
                    >
                      {CURRENCIES.map((option) => (
                        <option key={option} value={option}>
                          {Currency[option]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => void save(product)}
                      disabled={savingId === product.id || draft.type === null}
                      data-testid={`gestores-save-${product.id}`}
                    >
                      {intl.formatMessage({ id: 'GESTORES.SAVE' })}
                    </Button>
                    {hasConfig && (
                      <Button
                        variant="outline"
                        onClick={() => void remove(product)}
                        disabled={savingId === product.id}
                        data-testid={`gestores-remove-${product.id}`}
                      >
                        {intl.formatMessage({ id: 'GESTORES.REMOVE' })}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
