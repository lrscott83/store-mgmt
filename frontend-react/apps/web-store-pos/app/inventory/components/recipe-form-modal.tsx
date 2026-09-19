import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, Recipe } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, PlusIcon, SaveIcon, TrashIcon } from '~/shared/components/ui/icons';
import type { RecipeInput } from '../lib/services/recipe-offline-service';

interface RecipeFormModalProps {
  open: boolean;
  /** Present → edit mode (prefilled). Absent → create mode. */
  recipe?: Recipe;
  /** Selectable products (active only) for the finished product and the ingredients. */
  products: Product[];
  onClose: () => void;
  onSave: (input: RecipeInput) => void;
}

/** One editable component row — strings so an empty field is preserved while typing. */
interface ComponentDraft {
  productId: string;
  qty: string;
  scrapPct: string;
}

const EMPTY_COMPONENT: ComponentDraft = { productId: '', qty: '', scrapPct: '' };

const inputClass =
  'w-full rounded border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary';

function parseOptional(value: string, fallback: number): number {
  if (value.trim() === '') return fallback;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Recipe (BoM) create/edit dialog. Model: warehouse-form-modal.tsx (role="dialog",
 * backdrop click closes, Escape closes). The domain service re-validates every
 * field — the disabled Save is a best-effort UI guard, not the source of truth.
 */
export function RecipeFormModal({ open, recipe, products, onClose, onSave }: RecipeFormModalProps) {
  const intl = useIntl();
  const [productId, setProductId] = useState('');
  const [outputQty, setOutputQty] = useState('');
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [laborCost, setLaborCost] = useState('');
  const [overheadPct, setOverheadPct] = useState('');

  useEffect(() => {
    if (!open) return;
    setProductId(recipe?.productId ?? '');
    setOutputQty(recipe ? String(recipe.outputQty) : '');
    setComponents(
      recipe
        ? recipe.components.map((component) => ({
            productId: component.productId,
            qty: String(component.qty),
            scrapPct: String(component.scrapPct),
          }))
        : [{ ...EMPTY_COMPONENT }],
    );
    setLaborCost(recipe && recipe.laborCost !== 0 ? String(recipe.laborCost) : '');
    setOverheadPct(recipe && recipe.overheadPct !== 0 ? String(recipe.overheadPct) : '');
  }, [open, recipe]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  function updateComponent(index: number, patch: Partial<ComponentDraft>) {
    setComponents((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addComponent() {
    setComponents((prev) => [...prev, { ...EMPTY_COMPONENT }]);
  }

  function removeComponent(index: number) {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  }

  const output = parseFloat(outputQty);
  const labor = parseOptional(laborCost, 0);
  const overhead = parseOptional(overheadPct, 0);
  const componentsValid =
    components.length >= 1 &&
    components.every((row) => {
      const qty = parseFloat(row.qty);
      const scrap = parseOptional(row.scrapPct, 0);
      return (
        row.productId !== '' &&
        Number.isFinite(qty) &&
        qty > 0 &&
        Number.isFinite(scrap) &&
        scrap >= 0 &&
        scrap <= 100
      );
    });
  // The same ingredient on two rows is not a valid BoM: the elaboration service
  // collapses components by productId (last-wins), so the stored cost would
  // diverge from the preview. Empty rows are ignored here.
  const seenProductIds = new Set<string>();
  const hasDuplicateComponents = components.some((row) => {
    if (row.productId === '') return false;
    if (seenProductIds.has(row.productId)) return true;
    seenProductIds.add(row.productId);
    return false;
  });
  const isValid =
    productId !== '' &&
    Number.isFinite(output) &&
    output > 0 &&
    componentsValid &&
    !hasDuplicateComponents &&
    labor >= 0 &&
    overhead >= 0 &&
    overhead <= 100;

  function handleSave() {
    onSave({
      productId,
      outputQty: output,
      components: components.map((row) => ({
        productId: row.productId,
        qty: parseFloat(row.qty),
        scrapPct: parseOptional(row.scrapPct, 0),
      })),
      laborCost: labor,
      overheadPct: overhead,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="recipe-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">
            {recipe
              ? intl.formatMessage({ id: 'RECIPE.EDIT' })
              : intl.formatMessage({ id: 'RECIPE.NEW' })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto">
          <div>
            <label htmlFor="recipe-product" className="mb-1 block text-sm font-medium text-text">
              {intl.formatMessage({ id: 'RECIPE.FINISHED_PRODUCT' })}
            </label>
            <select
              id="recipe-product"
              data-testid="recipe-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={inputClass}
            >
              <option value="">{intl.formatMessage({ id: 'RECIPE.SELECT_PRODUCT' })}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="recipe-output-qty" className="mb-1 block text-sm font-medium text-text">
              {intl.formatMessage({ id: 'RECIPE.OUTPUT_QTY' })}
            </label>
            <input
              id="recipe-output-qty"
              data-testid="recipe-output-qty"
              type="number"
              min="0"
              step="0.01"
              value={outputQty}
              onChange={(e) => setOutputQty(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-text">
                {intl.formatMessage({ id: 'RECIPE.COMPONENTS_TITLE' })}
              </span>
              <button
                type="button"
                onClick={addComponent}
                data-testid="recipe-add-component"
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover"
              >
                <PlusIcon />
                {intl.formatMessage({ id: 'RECIPE.ADD_COMPONENT' })}
              </button>
            </div>
            <div className="space-y-2">
              {components.map((row, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="flex-1">
                    <select
                      aria-label={intl.formatMessage({ id: 'RECIPE.COMPONENT' })}
                      data-testid={`recipe-component-product-${index}`}
                      value={row.productId}
                      onChange={(e) => updateComponent(index, { productId: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">
                        {intl.formatMessage({ id: 'RECIPE.SELECT_PRODUCT' })}
                      </option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="block text-[10px] text-text-muted">
                      {intl.formatMessage({ id: 'RECIPE.COMPONENT_QTY' })}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.qty}
                      onChange={(e) => updateComponent(index, { qty: e.target.value })}
                      className={inputClass}
                      data-testid={`recipe-component-qty-${index}`}
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-[10px] text-text-muted">
                      {intl.formatMessage({ id: 'RECIPE.SCRAP_PCT' })}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={row.scrapPct}
                      onChange={(e) => updateComponent(index, { scrapPct: e.target.value })}
                      className={inputClass}
                      data-testid={`recipe-component-scrap-${index}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeComponent(index)}
                    aria-label={intl.formatMessage({ id: 'RECIPE.REMOVE_COMPONENT' })}
                    data-testid={`recipe-remove-component-${index}`}
                    className="mt-5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-danger hover:bg-danger/10"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
            {hasDuplicateComponents && (
              <p
                role="alert"
                data-testid="recipe-duplicate-error"
                className="mt-2 text-sm text-danger"
              >
                {intl.formatMessage({ id: 'RECIPE.DUPLICATE_COMPONENT' })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="recipe-labor-cost"
                className="mb-1 block text-sm font-medium text-text"
              >
                {intl.formatMessage({ id: 'RECIPE.LABOR_COST' })}
              </label>
              <input
                id="recipe-labor-cost"
                data-testid="recipe-labor-cost"
                type="number"
                min="0"
                step="0.01"
                value={laborCost}
                onChange={(e) => setLaborCost(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="recipe-overhead-pct"
                className="mb-1 block text-sm font-medium text-text"
              >
                {intl.formatMessage({ id: 'RECIPE.OVERHEAD_PCT' })}
              </label>
              <input
                id="recipe-overhead-pct"
                data-testid="recipe-overhead-pct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={overheadPct}
                onChange={(e) => setOverheadPct(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="fab" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </Button>
          <Button
            variant="fab"
            className="flex-1 justify-center"
            disabled={!isValid}
            onClick={handleSave}
            data-testid="recipe-save"
          >
            <SaveIcon />
            {intl.formatMessage({ id: 'RECIPE.SAVE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
