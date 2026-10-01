import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import type { ProductCategory, WholesaleConfig } from '@store-mgmt/domain';
import { DEFAULT_CURRENCY, EModules } from '@store-mgmt/domain';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';
import { Button } from '~/shared/components/ui/button';
import { BarcodeInput } from './barcode-input';
import { validateWholesaleConfig } from '~/sales/lib/wholesale';
import { WholesaleConfigSection } from './wholesale-config-section';
import { CurrencySelect } from '~/shared/components/multimonedas/currency-select';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isOwnerAdmin } from '~/shared/lib/auth/authorization-service';

interface CreateProductForm {
  name: string;
  price: string;
  barcode: string;
  order: string;
  isActive: boolean;
  availableToSale: boolean;
  discountFromInvantory: boolean;
  /** Optional entry cost. Empty = absent = no day entry (mirrors the CSV importer's optional column). */
  cost: string;
  /** Optional opening quantity. Any fraction, `.` separator. Empty/<=0 = no day entry. */
  quantity: string;
}

interface CreateProductModalProps {
  category: ProductCategory;
  defaultOrder: number;
  onSave: (data: {
    name: string;
    price: number;
    currency: number;
    barcode?: string;
    categoryId: string;
    order: number;
    isActive: boolean;
    availableToSale: boolean;
    discountFromInvantory: boolean;
    wholesale?: WholesaleConfig;
    /** Present only when BOTH cost and quantity qualify — see handleSubmit. */
    cost?: number;
    quantity?: number;
    costCurrency?: number;
  }) => void;
  onClose: () => void;
}

// Angular parity source: edit-product-modal.component.html — the ONE real modal, reused for
// both create+edit. Field order: Nombre, Precio, Código de barras, Orden, Activo, Disponible
// para Vender, Descuenta del Inventario. Barcode stayed commented out in Angular (never
// rendered there) — the React form now OWNS an editable barcode field with scanner capture
// (Angular is legacy; its commented-out control is history). The category dropdown stays
// pinned to the click-context `category` prop instead.
export function CreateProductModal({
  category,
  defaultOrder,
  onSave,
  onClose,
}: CreateProductModalProps) {
  const intl = useIntl();
  const [form, setForm] = useState<CreateProductForm>({
    name: '',
    price: '',
    barcode: '',
    order: defaultOrder.toString(),
    isActive: true,
    availableToSale: true,
    discountFromInvantory: true,
    cost: '',
    quantity: '',
  });
  const [wholesale, setWholesale] = useState<WholesaleConfig | undefined>(undefined);
  // MultiMonedas: CUP salvo que el usuario elija otra (selector visible solo con el módulo).
  const [currency, setCurrency] = useState<number>(DEFAULT_CURRENCY);
  const [costCurrency, setCostCurrency] = useState<number>(DEFAULT_CURRENCY);
  // Costo + cantidad solo para el owner Y solo con el módulo de Inventario (3) activo.
  // La entrada del día es un movimiento de inventario: la controla el dueño de la tienda
  // (mismo gate que products.tsx:52), y sin el módulo Inventario no existe la pantalla donde
  // esa compra quedaría contabilizada, así que el popup no debe ofrecer campos sin destino.
  // Defensivo igual que hasMultiMonedasAvailable: un perfil cacheado de una sesión previa
  // puede cargar sin `storeModuleIds`.
  const user = useAuthStore((s) => s.user);
  const showEntryControls =
    !!user &&
    isOwnerAdmin(user) &&
    Array.isArray(user.storeModuleIds) &&
    user.storeModuleIds.includes(EModules.Inventory);
  // El PRIMER cambio de la moneda del costo arrastra la del precio: es el atajo para quien
  // compra y vende en la misma moneda, y evita tener que elegir dos veces lo mismo. El latch
  // asegura que ocurra SOLO esa primera vez — después el usuario fija la moneda del precio que
  // quiera y seguir cambiando la del costo ya no se lo pisa.
  const priceCurrencyFollowedCostRef = useRef(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateProductForm, string>>>({});
  const [wholesaleError, setWholesaleError] = useState<string | undefined>(undefined);

  function validate(): boolean {
    const newErrors: Partial<Record<keyof CreateProductForm, string>> = {};
    if (!form.name.trim()) {
      newErrors.name = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' }) },
      );
    }
    if (!form.price.trim() || isNaN(parseFloat(form.price))) {
      newErrors.price = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'PRODUCTS.FORM.PRICE' }) },
      );
    } else if (parseFloat(form.price) < 0) {
      // Angular parity: Validators.min(0) on price (edit-product-modal.component.ts:147)
      newErrors.price = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO' },
        { name: intl.formatMessage({ id: 'GENERAL.PRICE' }) },
      );
    }
    // Angular parity: Validators.pattern(RegExExtensions.numeric = /^[0-9]\d*$/) on order
    // (edit-product-modal.component.ts:148-150). Angular has NO mat-error for the pattern
    // failure (html:61-64 only renders the required error) — a pattern mismatch must block
    // submit silently, with no visible message.
    let orderPatternValid = true;
    if (!form.order.trim() || isNaN(parseFloat(form.order))) {
      newErrors.order = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'GENERAL.ORDER' }) },
      );
    } else if (!/^[0-9]\d*$/.test(form.order.trim())) {
      orderPatternValid = false;
    }
    // Costo y cantidad son OPCIONALES (decisión del usuario): vacíos no bloquean la creación.
    // Solo bloquean si el usuario escribió algo que no es número — un valor presente pero
    // inválido nunca debe descartarse en silencio. Un costo explícito de 0 SÍ es válido
    // (espeja la decisión #7/#16 del importador); "vacío" es lo único que significa ausente.
    if (showEntryControls) {
      if (form.cost.trim() !== '' && isNaN(parseFloat(form.cost))) {
        newErrors.cost = intl.formatMessage(
          { id: 'GENERAL.VALIDATION.REQUIRED' },
          { name: intl.formatMessage({ id: 'INVENTORY.ENTRY.COST_PRICE' }) },
        );
      }
      if (form.quantity.trim() !== '' && isNaN(parseFloat(form.quantity))) {
        newErrors.quantity = intl.formatMessage(
          { id: 'GENERAL.VALIDATION.REQUIRED' },
          { name: intl.formatMessage({ id: 'GENERAL.QUANTITY' }) },
        );
      }
    }
    // Mayorista: solo se valida si el usuario activó la sección. La validación es por
    // reglas de negocio (validateWholesaleConfig) y muestra el primer error en pantalla.
    const wholesaleValidation = validateWholesaleConfig(wholesale, parseFloat(form.price) || 0);
    if (!wholesaleValidation.succeeded) {
      setWholesaleError(wholesaleValidation.errors[0]?.description);
      setErrors(newErrors);
      return false;
    }
    setWholesaleError(undefined);

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0 && orderPatternValid;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      name: form.name.trim(),
      price: parseFloat(form.price),
      currency,
      barcode: form.barcode.trim() || undefined,
      categoryId: category.id,
      order: parseInt(form.order, 10),
      isActive: form.isActive,
      availableToSale: form.availableToSale,
      discountFromInvantory: form.discountFromInvantory,
      wholesale,
      ...qualifyingEntry(),
    });
  }

  /**
   * Costo y cantidad SOLO se envían cuando la entrada del día puede crearse de verdad: ambos
   * presentes y cantidad > 0. El importador usa `cost ?? price` como fallback; aquí NO, por
   * decisión del usuario — sin costo no se contabiliza nada, en vez de registrar el precio de
   * venta como si fuera el costo.
   *
   * La cantidad admite decimales con `.` como separador decimal y cualquier fracción
   * (`step="any"`, decisión del usuario 2026-10-01): es la misma regla que ya aplica la fila de
   * venta del POS — se venden kilos, litros y medias unidades. Un `parseInt` truncaría `1.5` a
   * `1` en silencio y bookearía una cantidad equivocada, y un `step="0.01"` impediría escribir
   * `0.333` en una pantalla donde el propio POS sí lo permite.
   */
  function qualifyingEntry(): { cost?: number; quantity?: number; costCurrency?: number } {
    if (!showEntryControls) return {};
    const cost = form.cost.trim() === '' ? undefined : parseFloat(form.cost);
    const quantity = form.quantity.trim() === '' ? undefined : parseFloat(form.quantity);
    if (cost === undefined || isNaN(cost)) return {};
    // `!quantity` no basta: `!(-3)` es `false` en JS. Mismo guardia que products.tsx:389.
    if (quantity === undefined || isNaN(quantity) || quantity <= 0) return {};
    return { cost, quantity, costCurrency };
  }

  function handleCostCurrencyChange(next: number) {
    setCostCurrency(next);
    if (!priceCurrencyFollowedCostRef.current) {
      priceCurrencyFollowedCostRef.current = true;
      setCurrency(next);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-6">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {intl.formatMessage({ id: 'PRODUCT.NEW_PRODUCT' })}
        </h2>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' })}
            </label>
            <input
              type="text"
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="product-name-input"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* Costo + Precio en la misma fila (costo antes), o Precio solo si el owner no ve la entrada. */}
          <div className={showEntryControls ? 'flex gap-3' : undefined}>
            {showEntryControls && (
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {intl.formatMessage({ id: 'INVENTORY.ENTRY.COST_PRICE' })}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  data-testid="product-cost-input"
                />
                {errors.cost && <p className="mt-1 text-xs text-red-500">{errors.cost}</p>}
              </div>
            )}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {intl.formatMessage({ id: 'PRODUCTS.FORM.PRICE' })}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                data-testid="product-price-input"
              />
              {errors.price && <p className="mt-1 text-xs text-red-500">{errors.price}</p>}
            </div>
          </div>

          {/* Moneda del costo + moneda del precio en la misma fila (costo antes), o la moneda del
              precio sola si el owner no ve la entrada. CurrencySelect ya devuelve null sin el
              módulo MultiMonedas — sin él, ambas monedas quedan en CUP. */}
          <div className={showEntryControls ? 'flex gap-3 items-start' : undefined}>
            {showEntryControls && (
              <div className="flex-1">
                <CurrencySelect
                  value={costCurrency}
                  onChange={handleCostCurrencyChange}
                  label={intl.formatMessage({ id: 'PRODUCTS.FORM.COST_CURRENCY' })}
                  testId="product-cost-currency-select"
                />
              </div>
            )}
            <div className="flex-1">
              <CurrencySelect
                value={currency}
                onChange={setCurrency}
                label={intl.formatMessage({ id: 'PRODUCTS.FORM.PRICE_CURRENCY' })}
                testId="product-currency-select"
              />
            </div>
          </div>

          {/* Cantidad: fila propia, después de la moneda (owner). Opcional, admite decimales. */}
          {showEntryControls && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {intl.formatMessage({ id: 'GENERAL.QUANTITY' })}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                data-testid="product-quantity-input"
              />
              {errors.quantity && <p className="mt-1 text-xs text-red-500">{errors.quantity}</p>}
            </div>
          )}

          {/* Barcode */}
          <BarcodeInput
            value={form.barcode}
            onChange={(barcode) => setForm((f) => ({ ...f, barcode }))}
            inputTestId="product-barcode-input"
            scanTestId="product-barcode-scan"
          />

          {/* Order */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'GENERAL.ORDER' })}
            </label>
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="product-order-input"
            />
            {errors.order && <p className="mt-1 text-xs text-red-500">{errors.order}</p>}
          </div>

          {/* Wholesale config — right below Orden per UX decision (2026-09-04). */}
          <WholesaleConfigSection
            value={wholesale}
            retailPrice={parseFloat(form.price) || 0}
            onChange={setWholesale}
          />
          {wholesaleError && <p className="text-xs text-red-500">{wholesaleError}</p>}

          {/* Active */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600"
              data-testid="product-active-checkbox"
            />
            <span className="text-xs font-medium text-gray-600">
              {intl.formatMessage({ id: 'GENERAL.ACTIVE' })}
            </span>
          </label>

          {/* Available to sale */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.availableToSale}
              onChange={(e) => setForm((f) => ({ ...f, availableToSale: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600"
              data-testid="product-available-checkbox"
            />
            <span className="text-xs font-medium text-gray-600">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.AVAILABLE_TO_SALE' })}
            </span>
          </label>

          {/* Discount from inventory */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.discountFromInvantory}
              onChange={(e) => setForm((f) => ({ ...f, discountFromInvantory: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600"
              data-testid="product-discount-checkbox"
            />
            <span className="text-xs font-medium text-gray-600">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.DISCOUNT_FROM_INVENTORY' })}
            </span>
          </label>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="fab" type="button" onClick={onClose}>
              <CloseIcon />
              {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            </Button>
            <Button variant="fab" type="submit" data-testid="create-product-submit">
              <SaveIcon />
              {intl.formatMessage({ id: 'GENERAL.SAVE' })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
