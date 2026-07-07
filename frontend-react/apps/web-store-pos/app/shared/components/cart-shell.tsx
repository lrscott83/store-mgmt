import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { PaymentType } from '@store-mgmt/domain';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { hasAvailableProductToSale } from '~/sales/lib/product-availability';
import { ProductErrors } from '@store-mgmt/domain';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { hasCreditsModuleAvailable, hasInventoryModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { getOrderTypeText } from '~/sales/lib/order-type-utils';
import { getPaymentTypeIconKind, type PaymentTypeIconKind } from '~/shared/lib/payment-type-icon';
import { getPaymentReturn, getPaymentReturnKind } from '~/shared/lib/payment-return';
import { validateCartSubmission } from '~/shared/lib/cart-submission-validation';
import { showBlockingError } from '~/shared/lib/blocking-alert';

const PAYMENT_TYPE_OPTIONS: { type: PaymentType; labelKey: string }[] = [
  { type: PaymentType.Efectivo, labelKey: 'CART.EFECTIVO' },
  { type: PaymentType.Tarjeta, labelKey: 'CART.TARJETA' },
  { type: PaymentType.Zelle, labelKey: 'CART.ZELLE' },
];

function PaymentTypeIcon({ kind }: { kind: PaymentTypeIconKind }) {
  const testId = `payment-type-icon-${kind}`;
  if (kind === 'cash') {
    return (
      <svg data-testid={testId} className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 6h18M3 6v12a1 1 0 001 1h16a1 1 0 001-1V6M3 6l2-3h14l2 3M12 10a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
      </svg>
    );
  }
  if (kind === 'card') {
    return (
      <svg data-testid={testId} className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zM2 10h20M6 15h4" />
      </svg>
    );
  }
  if (kind === 'phone') {
    return (
      <svg data-testid={testId} className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 3h10a1 1 0 011 1v16a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2" />
      </svg>
    );
  }
  return (
    <svg data-testid={testId} className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2m0-8c1.11 0 2.08.402 2.599 1M9.401 15c.52.598 1.489 1 2.599 1" />
    </svg>
  );
}

export function CartShell() {
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // UI-only state, NOT persisted to the order — matches Angular's NavRightComponent
  // fields `payment` and `mustGenerateFacture`, which live on the component, not the
  // shopping-cart service or the created Order.
  const [payment, setPayment] = useState<number | undefined>(undefined);
  const [mustGenerateFacture, setMustGenerateFacture] = useState(false);
  const cartRef = useRef<HTMLDivElement>(null);

  useClickOutside(cartRef, () => setIsOpen(false));
  const {
    items,
    orderType,
    paymentType,
    isCredit,
    clientName,
    setPaymentType,
    setClientName,
    toggleCredit,
    updateQuantity,
    removeItem,
    clear,
    total,
  } = useCartStore();
  const user = useAuthStore((s) => s.user);
  const creditsModuleAvailable = user ? hasCreditsModuleAvailable(user) : false;
  const storeId = user?.selectedStoreId ?? '';

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmount = total();
  const paymentReturn = getPaymentReturn(payment, totalAmount);
  const paymentReturnKind = getPaymentReturnKind(paymentReturn);

  function resetTransientFields() {
    setPayment(undefined);
    setMustGenerateFacture(false);
  }

  function handleClear() {
    clear();
    resetTransientFields();
    setSubmitError(null);
    setSubmitSuccess(null);
  }

  // 1:1 port of Angular's NavRightComponent.increaseProduct/decreaseProduct ->
  // ShoppingCartService.increaseCartItem/decreaseCartItem -> addCartItem(orderType,
  // productId, ±1, null) -> addItem(), which ALWAYS re-validates
  // InventoryOfflineService.hasAvailableProductToSale(productId, delta + currentCartQty)
  // regardless of direction (nav-right.component.ts:393-417,
  // shopping-cart.service.ts:78-123) — re-fetches the LATEST product state (not the
  // possibly-stale one cached on the cart item) exactly like Angular's
  // productService.getProductById inside addCartItem.
  function handleQuantityChange(productId: string, currentQuantity: number, delta: number) {
    const productService = new ProductOfflineService(storeId);
    const inventoryService = new InventoryOfflineService(storeId);
    const product = productService.getById(productId);
    const result = hasAvailableProductToSale({
      product,
      quantity: delta,
      cartQuantity: currentQuantity,
      hasInventoryModule: user ? hasInventoryModuleAvailable(user) : false,
      inventory: inventoryService.getAvailableQuantity(productId),
    });
    if (!result.succeeded) {
      // Angular: Swal.fire({ title: GENERAL.RESPONSE.ERROR_TITLE, text: message,
      // icon: 'error' }) — blocking, aborts the quantity change. Angular reads
      // `availableResult.errors[0].description` directly (hardcoded Spanish text).
      const message = result.errors[0]?.description ?? ProductErrors.ProductNotAvailable.description;
      showBlockingError(intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }), message);
      return;
    }
    updateQuantity(productId, currentQuantity + delta);
  }

  function clearCartAfterSuccessfulOrder() {
    // Same cart-reset as handleClear, but preserves the just-set success message
    // (Angular calls clearShoppingCart() after showing the toastr success message —
    // the two are independent side effects, not a single combined reset).
    clear();
    resetTransientFields();
    setSubmitError(null);
  }

  async function handleCreateOrder() {
    setSubmitError(null);
    setSubmitSuccess(null);

    // 1:1 port of Angular's NavRightComponent.createOrder() validation sequence.
    const validationError = validateCartSubmission({
      itemCount,
      payment,
      total: totalAmount,
      isCredit,
      client: clientName,
    });
    if (validationError === 'EMPTY_CART') {
      setSubmitError(intl.formatMessage({ id: 'SHOPPING_CART.DON_NOT_PAY_EMPTY_CART' }));
      return;
    }
    if (validationError === 'PAYMENT_LESS_THAN_TOTAL') {
      setSubmitError(intl.formatMessage({ id: 'SHOPPING_CART.DON_NOT_PAY_LESS_THAN_CART_TOTAL' }));
      return;
    }
    if (validationError === 'CREDIT_WITHOUT_CLIENT') {
      setSubmitError(intl.formatMessage({ id: 'SHOPPING_CART.DON_NOT_SALE_CREDIT_WITHOUT_CLIENT' }));
      return;
    }

    setIsSubmitting(true);
    try {
      const storeId = user?.selectedStoreId ?? '';
      const orderService = new OrderOfflineService(storeId);
      orderService.create(
        items,
        paymentType,
        isCredit,
        clientName.trim(),
        orderType,
        user ? hasInventoryModuleAvailable(user) : false,
      );
      // NOTE (parity, intentionally not implemented): Angular's mustGenerateFacture branch
      // calls generateTicket(), which is dead/disabled code in Angular itself (no-op
      // console.log — jsPDF generation is commented out). The toggle is preserved for
      // parity but produces no print output here either, matching Angular exactly.
      setSubmitSuccess(intl.formatMessage({ id: 'SHOPPING_CART.ORDER_CREATED' }));
      clearCartAfterSuccessfulOrder();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : intl.formatMessage({ id: 'GENERAL.ERROR' }));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <div className="relative" ref={cartRef}>
      {/* Cart button with badge */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative rounded-lg p-2 text-text-muted hover:bg-primary-light transition-colors"
        aria-label={intl.formatMessage({ id: 'CART.TITLE' })}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {/* Badge is always visible, matching Angular's {{getItemsCount()}} (shows 0 too) */}
        <span
          data-testid="cart-badge"
          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      </button>

      {/* Cart dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-surface shadow-card z-50">
          {/* Header: "Venta actual" (hardcoded, matches Angular) + LIVE order type subtitle.
              Angular's NavRightComponent binds this to shoppingCartService.getOrderType()
              (nav-right.component.ts:427-429, nav-right.component.html:96) — NOT a fixed
              value; the cart's orderType changes per session (Normal/Mayorista/etc, see
              Egress/Mayorista realignment). */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-text">Venta actual</h3>
              <span className="text-xs text-text-muted">{getOrderTypeText(orderType)}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-text-muted hover:text-text"
              aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Payment / Vuelto row */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span
              className={
                paymentReturnKind === 'positive'
                  ? 'text-xs font-medium text-success'
                  : paymentReturnKind === 'negative'
                  ? 'text-xs font-medium text-danger'
                  : 'text-xs font-medium text-text-muted'
              }
            >
              Vuelto: {paymentReturn < 0 ? '-' : ''}${Math.abs(paymentReturn).toFixed(2)}
            </span>
            <input
              type="number"
              min={0}
              autoComplete="off"
              disabled={itemCount === 0}
              value={payment ?? ''}
              onChange={(e) => setPayment(e.target.value === '' ? undefined : Number(e.target.value))}
              aria-label={intl.formatMessage({ id: 'GENERAL.PAY' })}
              className="w-24 rounded-md border border-border px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {/* Payment-type selector with icons */}
          <div className="border-b border-border px-4 py-3">
            <div className="flex gap-1">
              {PAYMENT_TYPE_OPTIONS.map(({ type, labelKey }) => {
                const kind = getPaymentTypeIconKind(type);
                const label = intl.formatMessage({ id: labelKey });
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPaymentType(type)}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-xs font-medium transition-colors ${
                      paymentType === type
                        ? 'bg-primary text-white'
                        : 'border border-border text-text-muted hover:bg-primary-light'
                    }`}
                  >
                    <PaymentTypeIcon kind={kind} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Credit toggle + client input — gated by hasCreditsModuleAvailable, matching
              Angular's @if (hasCreditsModuleAvailable) block */}
          {creditsModuleAvailable && (
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCredit}
                  onChange={toggleCredit}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-xs font-medium text-text">
                  {intl.formatMessage({ id: 'CART.CREDIT_SALE' })}
                </span>
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                disabled={!isCredit}
                aria-label={intl.formatMessage({ id: 'GENERAL.CLIENT' })}
                placeholder={intl.formatMessage({ id: 'GENERAL.CLIENT' })}
                className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
          )}

          {/* Print-invoice toggle — UI-only, no print behavior (Angular's
              generateTicket/generateFacture are disabled no-ops) */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mustGenerateFacture}
                onChange={() => setMustGenerateFacture((v) => !v)}
                aria-label={intl.formatMessage({ id: 'SHOPPING_CART.PRINT_INVOICE' })}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-xs font-medium text-text">
                {intl.formatMessage({ id: 'SHOPPING_CART.PRINT_INVOICE' })}
              </span>
            </label>
          </div>

          {/* Items */}
          <div className="max-h-64 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-text-muted">
                {intl.formatMessage({ id: 'SHOPPING_CART.DON_NOT_PAY_EMPTY_CART' })}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.product.id} className="flex items-center gap-3 px-4 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-text">
                        {item.product.name} ({item.quantity})
                      </p>
                      <p className="text-xs text-text-muted">
                        {intl.formatMessage({ id: 'SHOPPING_CART.PRICE_LABEL' })}${(item.price ?? item.product.price).toFixed(2)}
                      </p>
                    </div>
                    <p className="text-sm text-text">${((item.price ?? item.product.price) * item.quantity).toFixed(2)}</p>
                    {/* Quantity controls */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.product.id, item.quantity, -1)}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs"
                        aria-label={intl.formatMessage(
                          { id: 'CART.DECREASE_QUANTITY' },
                          { name: item.product.name },
                        )}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.product.id, item.quantity, 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs"
                        aria-label={intl.formatMessage(
                          { id: 'CART.INCREASE_QUANTITY' },
                          { name: item.product.name },
                        )}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.product.id)}
                      className="text-border hover:text-danger transition-colors"
                      aria-label={intl.formatMessage({ id: 'CART.REMOVE_ITEM' }, { name: item.product.name })}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Feedback messages */}
          {submitError && (
            <p className="px-4 py-2 text-xs text-danger text-center" role="alert">
              {submitError}
            </p>
          )}
          {submitSuccess && (
            <p className="px-4 py-2 text-xs text-success text-center" role="status">
              {submitSuccess}
            </p>
          )}

          {/* Action buttons: Limpiar / Registrar, both disabled when cart is empty,
              matching Angular's [disabled]="getItemsCount() === 0" on both mat-fab buttons */}
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              type="button"
              onClick={handleClear}
              disabled={itemCount === 0}
              className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-text-muted hover:bg-primary-light transition-colors disabled:opacity-50"
            >
              {intl.formatMessage({ id: 'SHOPPING_CART.CLEAR' })}
            </button>
            <button
              type="button"
              onClick={handleCreateOrder}
              disabled={itemCount === 0 || isSubmitting}
              className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-semibold text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {isSubmitting
                ? intl.formatMessage({ id: 'GENERAL.LOADING' })
                : intl.formatMessage({ id: 'SHOPPING_CART.REGISTER' })}
            </button>
          </div>
        </div>
      )}
    </div>
    {/* Cart total, always visible next to the icon — matches Angular's header getCartTotal() */}
    <span className="text-sm font-medium text-primary whitespace-nowrap">
      ${totalAmount.toFixed(2)}
    </span>
    </>
  );
}
