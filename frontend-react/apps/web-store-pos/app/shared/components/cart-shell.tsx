import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { PaymentType } from '@store-mgmt/domain';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { createProductService } from '~/sales/lib/services/product-service.factory';
import { hasAvailableProductToSale } from '~/sales/lib/product-availability';
import { ProductErrors } from '@store-mgmt/domain';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { hasCreditsModuleAvailable, hasInventoryModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { getOrderTypeText } from '~/sales/lib/order-type-utils';
import { getPaymentTypeIconKind, type PaymentTypeIconKind } from '~/shared/lib/payment-type-icon';
import { getPaymentReturn, getPaymentReturnKind } from '~/shared/lib/payment-return';
import { validateCartSubmission } from '~/shared/lib/cart-submission-validation';
import { showBlockingError, showAcknowledgeError } from '~/shared/lib/blocking-alert';
import { showToastSuccess, showToastError } from '~/shared/lib/toast';
import { round2 } from '~/shared/lib/money';
import { formatCurrency } from '~/shared/lib/format-currency';
import { Switch } from '~/shared/components/ui/switch';
import { InfoBox } from '~/shared/components/ui/info-box';

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
    orderDescription,
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
  }

  // 1:1 port of Angular's NavRightComponent.increaseProduct/decreaseProduct ->
  // ShoppingCartService.increaseCartItem/decreaseCartItem -> addCartItem(orderType,
  // productId, ±1, null) -> addItem(), which ALWAYS re-validates
  // InventoryOfflineService.hasAvailableProductToSale(productId, delta + currentCartQty)
  // regardless of direction (nav-right.component.ts:393-417,
  // shopping-cart.service.ts:78-123) — re-fetches the LATEST product state (not the
  // possibly-stale one cached on the cart item) exactly like Angular's
  // productService.getProductById inside addCartItem.
  async function handleQuantityChange(productId: string, currentQuantity: number, delta: number) {
    const productService = createProductService(storeId);
    const inventoryService = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    const lookup = await productService.getProductById(productId);
    const product = lookup.succeeded ? lookup.data : undefined;
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
    // Same cart-reset as handleClear (Angular calls clearShoppingCart() after showing the
    // toastr success message — the two are independent side effects, not a single combined
    // reset).
    clear();
    resetTransientFields();
  }

  async function handleCreateOrder() {
    // 1:1 port of Angular's NavRightComponent.createOrder() validation sequence
    // (nav-right.component.ts:164/177/190) — each guard is a blocking, OK-only Swal
    // (icon 'info', GENERAL.INFORMATION title, #3456ff/#dc3545, confirmButtonText GENERAL.OK),
    // not an inline banner.
    const validationError = validateCartSubmission({
      itemCount,
      payment,
      total: totalAmount,
      isCredit,
      client: clientName,
    });
    if (validationError === 'EMPTY_CART') {
      showAcknowledgeError({
        title: intl.formatMessage({ id: 'GENERAL.INFORMATION' }),
        message: intl.formatMessage({ id: 'SHOPPING_CART.DON_NOT_PAY_EMPTY_CART' }),
        confirmButtonText: intl.formatMessage({ id: 'GENERAL.OK' }),
        icon: 'info',
      });
      return;
    }
    if (validationError === 'PAYMENT_LESS_THAN_TOTAL') {
      showAcknowledgeError({
        title: intl.formatMessage({ id: 'GENERAL.INFORMATION' }),
        message: intl.formatMessage({ id: 'SHOPPING_CART.DON_NOT_PAY_LESS_THAN_CART_TOTAL' }),
        confirmButtonText: intl.formatMessage({ id: 'GENERAL.OK' }),
        icon: 'info',
      });
      return;
    }
    if (validationError === 'CREDIT_WITHOUT_CLIENT') {
      showAcknowledgeError({
        title: intl.formatMessage({ id: 'GENERAL.INFORMATION' }),
        message: intl.formatMessage({ id: 'SHOPPING_CART.DON_NOT_SALE_CREDIT_WITHOUT_CLIENT' }),
        confirmButtonText: intl.formatMessage({ id: 'GENERAL.OK' }),
        icon: 'info',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const storeId = user?.selectedStoreId ?? '';
      const orderService = new OrderOfflineService(storeId);
      const result = await orderService.createOrder(
        items,
        orderType,
        isCredit,
        paymentType,
        orderDescription,
        clientName.trim(),
      );
      if (!result.succeeded) {
        // Angular createOrder `else` branch (nav-right.component.ts:222-225):
        // toastrService.error(SHOPPING_CART.ORDER_NOT_CREATED, ...) — a non-blocking error
        // toast, not a persisted inline banner. Title uses the corrected
        // GENERAL.RESPONSE.ERROR_TITLE ("Error"), not Angular's own broken
        // GENERAL.RESPONSE.ERROR key (TOAST-ERROR-TITLE-FIX).
        showToastError(
          intl.formatMessage({ id: 'SHOPPING_CART.ORDER_NOT_CREATED' }),
          intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
        );
        return;
      }
      // NOTE (parity, intentionally not implemented): Angular's mustGenerateFacture branch
      // calls generateTicket(), which is dead/disabled code in Angular itself (no-op
      // console.log — jsPDF generation is commented out). The toggle is preserved for
      // parity but produces no print output here either, matching Angular exactly.
      // Angular createOrder success order (nav-right.component.ts:213-221): toastrService.success(...)
      // FIRES FIRST, then clearShoppingCart() runs. Mirror that order exactly — toast, then clear.
      // The panel close is React-specific (Angular's ngbDropdown autoCloses); it follows the clear.
      // The "Éxito" title (GENERAL.RESPONSE.SUCCESS_TITLE) restores what the prior Swal stand-in dropped.
      showToastSuccess(
        intl.formatMessage({ id: 'SHOPPING_CART.ORDER_CREATED' }),
        intl.formatMessage({ id: 'GENERAL.RESPONSE.SUCCESS_TITLE' }),
      );
      clearCartAfterSuccessfulOrder();
      setIsOpen(false);
    } catch {
      // T2.0 verification (toast-notifications-parity, deviation from design ADR-4's literal
      // assumption): Angular's `.subscribe((response) => {...})` registers ONLY a `next`
      // handler (nav-right.component.ts:211-226) — no RxJS error callback — and
      // OrderOfflineService.createOrder always resolves via `Success$(order)`, never emitting
      // an Observable error (order-offline.service.ts:42-65). Angular therefore shows NO
      // user-facing feedback on a thrown/rejected createOrder call; this branch mirrors that
      // absence rather than firing the same error toast as the `succeeded:false` branch. Per
      // design §3.1 (non-negotiable regardless of the T2.0 finding): never surface a raw
      // `err.message`, and no persisted inline banner — both are satisfied by doing nothing
      // user-visible here.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    {/* Below the sm breakpoint the wrapper goes `static` so the panel below can
        span the full header width, mirroring Angular's `.pc-h-item { position: static }`
        rule (navbar.scss). On sm+ it stays `relative` for the narrow anchored dropdown. */}
    <div className="static sm:relative" ref={cartRef}>
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

      {/* Cart dropdown panel.
          Mobile: full-width (left-0 right-0, anchored to the `relative` header),
          mirroring Angular's `.pc-h-dropdown { left:0; right:0 }` under the sm breakpoint.
          sm+: narrow 20rem dropdown anchored to the right. */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 w-auto rounded-xl border border-border bg-surface shadow-card z-50 sm:left-auto sm:right-0 sm:w-80">
          {/* Header: "Venta actual" (hardcoded, matches Angular) + LIVE order type subtitle.
              Angular's NavRightComponent binds this to shoppingCartService.getOrderType()
              (nav-right.component.ts:427-429, nav-right.component.html:96) — NOT a fixed
              value; the cart's orderType changes per session (Normal/Mayorista/etc, see
              Egress/Mayorista realignment). */}
          {/* Header: "Venta actual" + order type on the left; Limpiar / Registrar on the
              right — matching Angular's nav-right header row (both mat-fab buttons live at
              the top, disabled when the cart is empty). React closes the panel via
              click-outside (useClickOutside), so no explicit close button is needed. */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-text">Venta actual</h3>
              <span className="text-xs text-text-muted">{getOrderTypeText(orderType)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                disabled={itemCount === 0}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-primary-light transition-colors disabled:opacity-50"
              >
                {intl.formatMessage({ id: 'SHOPPING_CART.CLEAR' })}
              </button>
              <button
                type="button"
                onClick={handleCreateOrder}
                disabled={itemCount === 0 || isSubmitting}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {intl.formatMessage({ id: 'SHOPPING_CART.REGISTER' })}
              </button>
            </div>
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
              Vuelto: {paymentReturn < 0 ? '-' : ''}{formatCurrency(Math.abs(paymentReturn))}
            </span>
            <input
              type="number"
              min={0}
              autoComplete="off"
              disabled={itemCount === 0}
              value={payment ?? ''}
              onChange={(e) => setPayment(e.target.value === '' ? undefined : Number(e.target.value))}
              aria-label={intl.formatMessage({ id: 'GENERAL.PAY' })}
              placeholder={intl.formatMessage({ id: 'GENERAL.PAY' })}
              className="w-36 rounded-md border border-border px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {/* Payment-type selector — radio group (Angular mat-radio-group parity), each
              option with its icon + label */}
          <div className="border-b border-border px-4 py-3">
            <div className="flex gap-4" role="radiogroup">
              {PAYMENT_TYPE_OPTIONS.map(({ type, labelKey }) => {
                const kind = getPaymentTypeIconKind(type);
                const label = intl.formatMessage({ id: labelKey });
                return (
                  <label
                    key={type}
                    className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-text"
                  >
                    <input
                      type="radio"
                      name="payment-type"
                      checked={paymentType === type}
                      onChange={() => setPaymentType(type)}
                      className="text-primary focus:ring-primary"
                    />
                    <PaymentTypeIcon kind={kind} />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Credit toggle + client input — gated by hasCreditsModuleAvailable, matching
              Angular's @if (hasCreditsModuleAvailable) block */}
          {creditsModuleAvailable && (
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Switch
                checked={isCredit}
                onChange={() => toggleCredit()}
                label={intl.formatMessage({ id: 'GENERAL.CREDIT' })}
              />
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
            <Switch
              checked={mustGenerateFacture}
              onChange={(v) => setMustGenerateFacture(v)}
              label={intl.formatMessage({ id: 'SHOPPING_CART.PRINT_INVOICE' })}
            />
          </div>

          {/* Items */}
          <div className="max-h-64 overflow-y-auto">
            {items.length === 0 ? (
              // Angular shows the empty-cart notice inside an alert-light-primary box;
              // InfoBox is React's design-system equivalent of that info banner.
              <div className="px-4 py-4">
                <InfoBox variant="primary">
                  {intl.formatMessage({ id: 'SHOPPING_CART.DON_NOT_PAY_EMPTY_CART' })}
                </InfoBox>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.product.id} className="flex items-center gap-3 px-4 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-text">
                        {item.product.name} ({item.quantity})
                      </p>
                      <p className="text-xs text-text-muted">
                        {intl.formatMessage({ id: 'SHOPPING_CART.PRICE_LABEL' })}{formatCurrency(item.price ?? item.product.price)}
                      </p>
                    </div>
                    <p className="text-sm text-text">{formatCurrency(round2((item.price ?? item.product.price) * item.quantity))}</p>
                    {/* Quantity controls */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.product.id, item.quantity, -1)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white text-2xl leading-none"
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
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white text-2xl leading-none"
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
        </div>
      )}
    </div>
    {/* Cart total, always visible next to the icon — matches Angular's header getCartTotal() */}
    <span className="text-sm font-medium text-primary whitespace-nowrap">
      {formatCurrency(totalAmount)}
    </span>
    </>
  );
}
