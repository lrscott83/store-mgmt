import { useRef, useState, useEffect, useMemo } from 'react';
import { useIntl } from 'react-intl';
import type { Product } from '@store-mgmt/domain';
import type { ChannelRate } from '@store-mgmt/domain';
import { Currency } from '@store-mgmt/domain';
import {
  SalePaymentMethod,
  applyPaymentPricing,
  isCashMethod,
  paymentMethodOptionsForCurrency,
  paymentPricingFor,
  salePaymentMethodLabel,
  salePaymentMethodToLegacyPaymentType,
} from '@store-mgmt/domain';
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
import {
  hasCreditsModuleAvailable,
  hasInventoryModuleAvailable,
  hasMultiPaymentsModuleAvailable,
} from '~/shared/lib/auth/authorization-service';
import { getOrderTypeText } from '~/sales/lib/order-type-utils';
import { wholesaleCartDisplay } from '~/sales/lib/wholesale-cart-display';
import {
  getWholesaleMinPacks,
  wholesaleTierUnitPrice,
  wholesaleUnitPlural,
} from '~/sales/lib/wholesale';
import { getPaymentReturn, getPaymentReturnKind } from '~/shared/lib/payment-return';
import { validateCartSubmission } from '~/shared/lib/cart-submission-validation';
import { showBlockingError, showAcknowledgeError } from '~/shared/lib/blocking-alert';
import { showToastSuccess, showToastError } from '~/shared/lib/toast';
import { round2 } from '~/shared/lib/money';
import { currencyLabel, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { readCartCurrencyPreference } from '~/shared/lib/cart-currency-preference';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import {
  DEFAULT_ENABLED_PAYMENT_METHODS,
  StorePaymentMethodsConfigService,
  applyStorePaymentMethodsConfig,
} from '~/shared/lib/payment-methods/store-payment-methods-config-service';
import { CartCurrencySelect } from '~/shared/components/multipayments/cart-currency-select';
import { MultiPaymentList, createPaymentRow } from '~/shared/components/multipayments/multi-payment-list';
import { settleMultiPayments } from '~/shared/components/multipayments/multi-payment-settlement';
import { convertCartLines } from '~/shared/components/multipayments/cart-line-conversion';
import { ChannelRateOfflineService } from '~/management/channel-rates/lib/services/channel-rate-offline-service';
import { Switch } from '~/shared/components/ui/switch';
import { InfoBox } from '~/shared/components/ui/info-box';

// Zelle removed from the visual options (user request 2026-09-08) — the enum
// member stays and historical Zelle data still renders (display maps elsewhere
// keep it). Re-add here when Zelle goes live again.
// payment-methods-percent-tax (plan 2026-09-17): las opciones ya no son una
// constante fija — el catálogo depende de la MONEDA de la venta
// (paymentMethodOptionsForCurrency) y la Tarjeta se reemplaza por Transferencia.

/**
 * Config mayorista del producto (para el paso de +/- en paquetes) sin depender
 * del orden de imports: getWholesaleConfig puro sobre los campos del Product.
 */
function getWholesaleConfigSafe(product: Product) {
  if (
    !product.wholesaleEnabled ||
    !product.wholesalePackSize ||
    product.wholesalePackSize <= 0 ||
    !product.wholesaleTiers ||
    product.wholesaleTiers.length === 0
  ) {
    return undefined;
  }
  return { packSize: product.wholesalePackSize };
}

/**
 * Línea de precio del carrito:
 * - Venta mayorista: "Cajas: 2 · Precio: $15 840" — cantidad en PAQUETES y el precio
 *   DEL PAQUETE (unitPrice × packSize).
 * - Venta normal: "Precio: $5 (10)" — precio unitario + unidades, como siempre.
 */
function formatWholesaleLine(
  item: { product: Product; quantity: number; price?: number },
  currency: number,
): string {
  const config = getWholesaleConfigSafe(item.product);
  if (!config) {
    return `${intlPriceLabel()}${formatMoneyWithCurrency(item.price ?? item.product.price, currency)} (${item.quantity})`;
  }
  const packs = wholesaleCartDisplay.packsFromUnits(item.quantity, item.product);
  const packPrice = wholesaleCartDisplay.packPrice(item.product, item.price);
  const unitPlural = wholesaleUnitPlural(item.product.wholesaleUnitLabel?.trim() || 'paquete');
  const capitalized = unitPlural.charAt(0).toUpperCase() + unitPlural.slice(1);
  return `${capitalized}: ${packs} · ${intlPriceLabel()}${formatMoneyWithCurrency(packPrice, currency)}`;
}

/** SHOPPING_CART.PRICE_LABEL necesita intl; helper con lazy access al DOM no funciona —
 *  usamos el valor literal del mensaje (es.ts: 'Precio: ') como en Angular. */
function intlPriceLabel(): string {
  return 'Precio: ';
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
    isCredit,
    clientName,
    setClientName,
    toggleCredit,
    updateQuantity,
    removeItem,
    clear,
    total,
    // MultiMonedas: acción nueva — con fallback CUP para stores sin ella (mocks de test,
    // perfiles persistidos de sesiones previas).
    cartCurrency = () => 0,
    // payment-methods-percent-tax (plan 2026-09-17): método real de la venta en curso
    // (persistido con el carrito). Defaults defensivos para mocks de test y perfiles
    // viejos sin el campo.
    salePaymentMethod = SalePaymentMethod.Efectivo,
    setSalePaymentMethod = () => {},
    // MultiPayments (módulo 16): filas del multi-pago de la venta en curso.
    // Defaults defensivos para mocks de test y perfiles persistidos viejos.
    payments = [],
    setPayments = () => {},
  } = useCartStore();
  const user = useAuthStore((s) => s.user);
  const creditsModuleAvailable = user ? hasCreditsModuleAvailable(user) : false;
  const storeId = user?.selectedStoreId ?? '';
  // MultiPayments (módulo 16): moneda de la venta elegida por el usuario,
  // persistida por usuario y reutilizada en la próxima venta. Sin el módulo el
  // estado queda sin uso y el carrito conserva el comportamiento previo.
  const multiPaymentsAvailable = user ? hasMultiPaymentsModuleAvailable(user) : false;
  const [preferredCartCurrency, setPreferredCartCurrency] = useState<Currency>(() =>
    readCartCurrencyPreference(user?.id),
  );
  // T4: último cambio de moneda rechazado (línea/moneda culpable) para el aviso.
  const [currencyChangeError, setCurrencyChangeError] = useState<{
    productName: string;
    fromCurrency: Currency;
    toCurrency: Currency;
  } | null>(null);

  // Venta mayorista: el badge cuenta PAQUETES (cajas), no unidades. En venta normal
  // sigue contando unidades (cartBadgeCount cae a la suma por producto sin config).
  const itemCount = wholesaleCartDisplay.cartBadgeCount(items);

  // MultiPayments (módulo 16): las filas se convierten a la moneda de la venta con
  // el MISMO registro de tasas que usa la lista, para que el bloqueo de "Registrar"
  // coincida exactamente con el bloqueo de cobro de la propia lista.
  const multiPaymentRates = useMemo<ChannelRate[]>(() => {
    if (!multiPaymentsAvailable || typeof window === 'undefined' || !storeId) return [];
    return new ChannelRateOfflineService(storeId).getStorageChannelRates();
  }, [multiPaymentsAvailable, storeId]);

  // MultiMonedas: la moneda NATIVA del carrito la fija el primer ítem (CUP si está
  // vacío), igual que `cartCurrency()`. Es el fallback seguro: la primera línea es
  // identidad contra su propia moneda, así que el total nunca queda en 0.
  const nativeCurrency = cartCurrency() as Currency;

  // T4 (load-time): si la preferencia persistida no puede convertir TODAS las
  // líneas (p. ej. una preferencia vieja o tasas que cambiaron), la venta cae a la
  // moneda nativa del carrito en vez de dejar el total en 0 / pintar el error.
  const preferredConversion = useMemo(
    () => convertCartLines(items, preferredCartCurrency, multiPaymentRates, new Date()),
    [items, preferredCartCurrency, multiPaymentRates],
  );
  const preferredCurrencyUnconvertible =
    multiPaymentsAvailable &&
    items.length > 0 &&
    preferredCartCurrency !== nativeCurrency &&
    preferredConversion.firstError !== null;

  // MultiPayments (módulo 16): la moneda de la venta la define la preferencia
  // persistida del usuario, salvo el fallback de T4; sin el módulo se conserva
  // EXACTAMENTE cartCurrency().
  const saleCurrency: Currency = !multiPaymentsAvailable
    ? nativeCurrency
    : preferredCurrencyUnconvertible
      ? nativeCurrency
      : preferredCartCurrency;
  const money = (amount: number) => formatMoneyWithCurrency(amount, saleCurrency);

  // T4: el cambio de moneda solo procede si TODAS las líneas convierten a la
  // moneda destino. Si alguna no puede, se rechaza (el select se queda donde está,
  // la preferencia no se escribe) y se expone la línea/moneda culpable.
  function canChangeCartCurrency(next: Currency): boolean {
    const conversion = convertCartLines(items, next, multiPaymentRates, new Date());
    const failedLine = conversion.lines.find((line) => line.error !== null);
    if (failedLine) {
      const item = items.find((i) => i.product.id === failedLine.productId);
      setCurrencyChangeError({
        productName: item?.product.name ?? '',
        fromCurrency: failedLine.fromCurrency,
        toCurrency: next,
      });
      return false;
    }
    setCurrencyChangeError(null);
    return true;
  }

  function handleCurrencyChange(next: Currency) {
    setPreferredCartCurrency(next);
  }

  // payment-methods-percent-tax (plan 2026-09-17) + store-payment-methods-config
  // (2026-09-22): el catálogo de métodos de la venta = moneda → gate de plan
  // (sin MultiMonedas no hay Zelle) → config por-tienda (métodos deshabilitados
  // fuera; Efectivo siempre). Config leída de localStorage (instancia fresca por
  // memo); SSR: sin window se usa el default y la hidratación lee localStorage.
  const paymentConfigEnabledMethods = useMemo(() => {
    if (typeof window === 'undefined' || !storeId) {
      return [...DEFAULT_ENABLED_PAYMENT_METHODS];
    }
    return new StorePaymentMethodsConfigService(storeId).getEnabledMethods(storeId);
  }, [storeId]);

  const methodOptions = useMemo(() => {
    const base = paymentMethodOptionsForCurrency(saleCurrency);
    const planGate = hasMultiMonedasAvailable(user)
      ? base
      : base.filter((m) => m !== SalePaymentMethod.Zelle);
    return applyStorePaymentMethodsConfig(planGate, paymentConfigEnabledMethods);
  }, [saleCurrency, user, paymentConfigEnabledMethods]);

  useEffect(() => {
    if (!methodOptions.includes(salePaymentMethod)) {
      setSalePaymentMethod(methodOptions[0] ?? SalePaymentMethod.Efectivo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methodOptions]);

  // El pricing de la combinación (moneda, método) se aplica al total mostrado y al
  // que se valida contra el pago; createOrder aplica LA MISMA fórmula al persistir.
  // Con los defaults 0/0 el total ajustado es idéntico al base (no-regresión).
  //
  // Ratified decision 8 (multipayments plan 2026-09-18): while the multi-payment UI is
  // active (module 16 + items) the sale total is the UNPRICED line sum, so the display,
  // the coverage guard, the list total and the persisted order all agree. Without module
  // 16 the priced total stays byte-identical to the legacy behavior.
  const pricing = paymentPricingFor(saleCurrency, salePaymentMethod);
  const multiPaymentsActive = multiPaymentsAvailable && items.length > 0;

  // MultiPayments (módulo 16, T8): cada línea del carrito se convierte a la moneda
  // de la venta elegida (una tasa por moneda, no por canal). Sin el módulo el
  // resultado queda sin uso y el total conserva EXACTAMENTE el camino legado.
  const lineConversion = useMemo(
    () => convertCartLines(items, saleCurrency, multiPaymentRates, new Date()),
    [items, saleCurrency, multiPaymentRates],
  );

  // Decision 8 + T8: con el multi-pago activo el total de la venta es la suma de
  // las líneas CONVERTIDAS a la moneda de la venta; sin el módulo se conserva el
  // total con pricing previo, byte-idéntico al comportamiento legado.
  const totalAmount = multiPaymentsActive
    ? lineConversion.total
    : applyPaymentPricing(total(), pricing);
  const paymentReturn = getPaymentReturn(payment, totalAmount);
  const paymentReturnKind = getPaymentReturnKind(paymentReturn);
  const cashSale = isCashMethod(salePaymentMethod);

  // T6 reconciliation: con el multi-pago activo los pagos se liquidan en la MISMA
  // moneda de la venta (saleCurrency), de modo que la lista, la liquidación y el
  // total coinciden. Sin el módulo el valor no se usa (la lista no se monta).
  const multiPaymentOrderCurrency = saleCurrency;
  const multiPaymentSettlement = useMemo(
    () =>
      multiPaymentsAvailable
        ? settleMultiPayments(
            payments,
            multiPaymentOrderCurrency,
            totalAmount,
            multiPaymentRates,
            new Date(),
          )
        : { orderPayments: [], remainingCents: 0, firstError: null },
    [multiPaymentsAvailable, payments, multiPaymentOrderCurrency, totalAmount, multiPaymentRates],
  );

  // T5 (payment-channels-and-multipayment): cuando el bloque de multipago pasa a
  // ser relevante (carrito con ítems + módulo 16) y aún no hay filas, se siembra
  // UNA fila Efectivo por el total de la venta — misma moneda ⇒ sin conversión y
  // sin mensaje de tasa. La siembra ocurre SOLO en la transición a "activo" (ref):
  // así no pelea con las ediciones del usuario (ni re-siembra si borra todas las
  // filas) y el guard sigue coherente (si el usuario baja el monto, queda en
  // subpago y "Registrar" se bloquea). Al vaciarse el carrito se limpian las filas
  // para que la próxima venta arranque de cero.
  const multiPaymentsSeededRef = useRef(false);
  useEffect(() => {
    if (!multiPaymentsActive) {
      multiPaymentsSeededRef.current = false;
      if (payments.length > 0) setPayments([]);
      return;
    }
    if (multiPaymentsSeededRef.current) return;
    multiPaymentsSeededRef.current = true;
    if (payments.length === 0) {
      setPayments([
        createPaymentRow(SalePaymentMethod.Efectivo, saleCurrency, totalAmount),
      ]);
    }
    // Intencional: solo la transición a activo dispara la siembra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiPaymentsActive]);

  // El cierre se bloquea mientras la venta no esté cubierta por los pagos (misma
  // razón que la lista: falta cubrir, o una fila no se pudo convertir) o mientras
  // alguna línea del carrito no pueda convertirse a la moneda de la venta (T8).
  // Las ventas a crédito conservan su camino de validación propio (pueden quedar
  // subpagadas).
  // Un error de conversión de línea es un bloqueo duro (también en ventas a crédito:
  // sin convertir la línea no hay precio persistible en la moneda de la venta).
  const lineConversionBlocked = multiPaymentsActive && lineConversion.firstError !== null;
  const multiPaymentBlocked =
    multiPaymentsAvailable &&
    items.length > 0 &&
    (lineConversionBlocked ||
      (!isCredit &&
        (multiPaymentSettlement.firstError !== null || multiPaymentSettlement.remainingCents > 0)));

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
    // Venta mayorista: los botones +/- trabajan en PAQUETES, no unidades. El paso es
    // packSize (24 unidades por click) para productos con config mayorista; en normal, 1.
    const stepProduct = items.find((i) => i.product.id === productId)?.product;
    const config = stepProduct ? getWholesaleConfigSafe(stepProduct) : undefined;
    const step = config ? config.packSize : 1;
    const deltaUnits = delta * step;

    // Mayorista floor rule (2026-09-07): el − no puede dejar la línea por debajo
    // del menor rango — si packs-1 < minPacks, la línea sale del carrito (el
    // mínimo del primer rango es la cantidad vendible más pequeña).
    if (config && delta < 0) {
      const currentPacks = wholesaleCartDisplay.packsFromUnits(currentQuantity, stepProduct!);
      const newPacks = currentPacks - 1;
      if (newPacks < getWholesaleMinPacks(stepProduct!)) {
        removeItem(productId);
        return;
      }
    }

    const productService = createProductService(storeId);
    const inventoryService = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    const lookup = await productService.getProductById(productId);
    const product = lookup.succeeded ? lookup.data : undefined;
    const result = hasAvailableProductToSale({
      product,
      quantity: deltaUnits,
      cartQuantity: currentQuantity,
      hasInventoryModule: user ? hasInventoryModuleAvailable(user) : false,
      inventory: inventoryService.getAvailableQuantity(productId),
    });
    if (!result.succeeded) {
      // Angular: Swal.fire({ title: GENERAL.RESPONSE.ERROR_TITLE, text: message,
      // icon: 'error' }) — blocking, aborts the quantity change. Angular reads
      // `availableResult.errors[0].description` directly (hardcoded Spanish text).
      // The stock ceiling is appended when the inventory read has entries, so
      // the merchant sees how many units are actually available.
      const message =
        result.errors[0]?.description ?? ProductErrors.ProductNotAvailable.description;
      const stock = inventoryService.getAvailableQuantity(productId);
      const detail = stock.hasEntries
        ? `\n${intl.formatMessage({ id: 'SALES.AVAILABLE_STOCK' }, { available: stock.available })}`
        : '';
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
        message + detail,
      );
      return;
    }

    // Mayorista re-tier (2026-09-07): al mover packs los ±, la línea cae en otro
    // rango y el precio por unidad se recalcula al del rango aplicable. Por
    // debajo del primer rango (nada aplicable) mantiene el precio retail.
    const newQuantity = currentQuantity + deltaUnits;
    if (config && stepProduct) {
      const newPacks = Math.floor(newQuantity / config.packSize);
      const tierPrice = wholesaleTierUnitPrice(stepProduct, newPacks);
      const linePrice = tierPrice !== undefined ? tierPrice : stepProduct.price;
      updateQuantity(productId, newQuantity, linePrice);
      return;
    }
    updateQuantity(productId, newQuantity);
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

    // MultiPayments (módulo 16): con filas de pago, el método legacy se deriva del
    // PRIMER pago (best-effort de compatibilidad con lectores viejos); el dato
    // autoritativo es la lista `payments` persistida en la orden. Sin filas, todo
    // queda EXACTAMENTE como antes (método del carrito).
    const hasMultiPayments = multiPaymentsAvailable && payments.length > 0;
    const effectiveSalePaymentMethod = hasMultiPayments ? payments[0].method : salePaymentMethod;

    // T8 (defensivo): aunque el botón ya está deshabilitado, un submit programático
    // con una línea no convertible no debe crear la venta.
    if (lineConversionBlocked && lineConversion.firstError) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
        lineConversion.firstError.description,
      );
      return;
    }

    // T8: con el multi-pago activo las líneas se persisten YA convertidas a la
    // moneda de la venta — `price` convertido y `product.currency = saleCurrency`,
    // de modo que el `OrderItem.currency`, la `orderCurrency` derivada y el total
    // del `createOrder` quedan en `saleCurrency` sin tocar el carrito del store.
    // Sin el módulo se pasan los ítems sin cambios (byte-idéntico).
    const orderCartItems = multiPaymentsActive
      ? items.map((item, index) => {
          const line = lineConversion.lines[index];
          if (!line || line.convertedUnitPrice === null) return item;
          return {
            ...item,
            price: line.convertedUnitPrice,
            product: { ...item.product, currency: saleCurrency as Currency },
          };
        })
      : items;

    setIsSubmitting(true);
    try {
      const storeId = user?.selectedStoreId ?? '';
      const orderService = new OrderOfflineService(storeId);
      const result = await orderService.createOrder(
        orderCartItems,
        orderType,
        isCredit,
        // Legacy derivado del método real (compatibilidad de datos); el campo
        // autoritativo es `salePaymentMethod`, séptimo parámetro.
        salePaymentMethodToLegacyPaymentType(effectiveSalePaymentMethod, saleCurrency),
        orderDescription,
        clientName.trim(),
        effectiveSalePaymentMethod,
        hasMultiPayments ? multiPaymentSettlement.orderPayments : undefined,
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-text">Venta actual</h3>
                <span className="text-xs text-text-muted">{getOrderTypeText(orderType)}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* MultiPayments: selector de moneda del carrito (módulo 16), en la
                  misma fila del encabezado y ANTES de "Limpiar". El propio
                  componente se oculta sin el módulo, así que ningún flujo existente cambia. */}
                <CartCurrencySelect
                  value={saleCurrency}
                  onChange={handleCurrencyChange}
                  canChange={canChangeCartCurrency}
                  testId="cart-currency-select"
                />
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
                  disabled={itemCount === 0 || isSubmitting || multiPaymentBlocked}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {intl.formatMessage({ id: 'SHOPPING_CART.REGISTER' })}
                </button>
              </div>
            </div>

            {/* T4: aviso cuando el cambio de moneda se rechazó porque una línea no
              puede convertirse. Sin el módulo 16 el aviso nunca aparece. */}
            {currencyChangeError && (
              <div className="border-b border-border px-4 py-2">
                <p
                  role="alert"
                  data-testid="cart-currency-change-error"
                  className="text-xs text-danger"
                >
                  {intl.formatMessage(
                    { id: 'SHOPPING_CART.CURRENCY_CHANGE_BLOCKED' },
                    {
                      currency: currencyLabel(currencyChangeError.toCurrency),
                      product: currencyChangeError.productName,
                      fromCurrency: currencyLabel(currencyChangeError.fromCurrency),
                    },
                  )}
                </p>
              </div>
            )}

            {/* MultiPayments (módulo 16): con ítems en el carrito, la lista de pagos
              reemplaza el bloque legacy de pago (el "con cuánto paga"/vuelto y el
              selector de método). Sin el módulo, o con el carrito vacío, se renderiza
              EXACTAMENTE el bloque legacy (los E2E existentes no tienen el módulo). */}
            {multiPaymentsAvailable && items.length > 0 ? (
              <MultiPaymentList
                payments={payments}
                onChange={setPayments}
                orderCurrency={multiPaymentOrderCurrency}
                total={totalAmount}
              />
            ) : (
              <>
                {/* Payment / Vuelto row — payment-methods-percent-tax (plan 2026-09-17):
                  "con cuánto paga" y el vuelto aplican SOLO en efectivo (misma moneda de la
                  venta, sin cambio); en Transferencia/Zelle se ocultan. */}
                {cashSale ? (
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
                    Vuelto: {paymentReturn < 0 ? '-' : ''}
                    {money(Math.abs(paymentReturn))}
                  </span>
                  <input
                    type="number"
                    min={0}
                    autoComplete="off"
                    disabled={itemCount === 0}
                    value={payment ?? ''}
                    onChange={(e) =>
                      setPayment(e.target.value === '' ? undefined : Number(e.target.value))
                    }
                    aria-label={intl.formatMessage({ id: 'GENERAL.PAY' })}
                    placeholder={intl.formatMessage({ id: 'GENERAL.PAY' })}
                    className="w-36 rounded-md border border-border px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                </div>
                ) : (
                  /* Transferencia/Zelle: sin vuelto ni "con cuánto paga" — el cobro no es
                     en efectivo. Fila informativa para conservar el ritmo visual. */
                  <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <span className="text-xs font-medium text-text-muted">
                      {salePaymentMethodLabel(salePaymentMethod, saleCurrency)}
                    </span>
                  </div>
                )}

                {/* Payment-method selector — radio group por MONEDA de la venta
                  (payment-methods-percent-tax, plan 2026-09-17): cada método con su
                  etiqueta ("Transferencia (CUP)" incluye su moneda), solo texto sin ícono
                  (petición 2026-09-21). Reemplaza al selector fijo Efectivo/Tarjeta. */}
                <div className="border-b border-border px-4 py-3">
                  <div className="flex flex-wrap gap-4" role="radiogroup">
                    {methodOptions.map((method) => {
                      const label = salePaymentMethodLabel(method, saleCurrency);
                      return (
                        <label
                          key={method}
                          className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-text"
                        >
                          <input
                            type="radio"
                            name="payment-type"
                            data-testid={`payment-method-${method}`}
                            checked={salePaymentMethod === method}
                            onChange={() => setSalePaymentMethod(method)}
                            className="text-primary focus:ring-primary"
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* T8: si alguna línea no se puede convertir a la moneda de la venta, se
              muestra el error tipado y "Registrar" queda bloqueado (multiPaymentBlocked).
              Sin el módulo 16 este aviso nunca aparece. */}
            {multiPaymentsActive && lineConversion.firstError && (
              <div className="border-b border-border px-4 py-2">
                <p
                  role="alert"
                  data-testid="cart-line-conversion-error"
                  data-error-code={lineConversion.firstError.code}
                  className="text-xs text-danger"
                >
                  {lineConversion.firstError.description}
                </p>
              </div>
            )}

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
                  {items.map((item, index) => {
                    // T8: con el multi-pago activo la línea se muestra convertida a la
                    // moneda de la venta; sin el módulo se conserva el cálculo legado.
                    const convertedUnitPrice = multiPaymentsActive
                      ? (lineConversion.lines[index]?.convertedUnitPrice ?? null)
                      : null;
                    const displayItem =
                      convertedUnitPrice !== null ? { ...item, price: convertedUnitPrice } : item;
                    const lineTotal =
                      convertedUnitPrice !== null
                        ? round2(convertedUnitPrice * item.quantity)
                        : round2((item.price ?? item.product.price) * item.quantity);
                    return (
                      <li key={item.product.id} className="flex items-center gap-2 pl-4 pr-1 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-text">
                            {item.product.name}
                          </p>
                          <p className="text-xs text-text-muted">
                            {formatWholesaleLine(displayItem, saleCurrency)}
                          </p>
                        </div>
                        <p className="text-sm text-text whitespace-nowrap">{money(lineTotal)}</p>
                        <button
                          type="button"
                          onClick={() => removeItem(item.product.id)}
                          className="text-border hover:text-danger transition-colors"
                          aria-label={intl.formatMessage(
                            { id: 'CART.REMOVE_ITEM' },
                            { name: item.product.name },
                          )}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                        {/* Quantity controls — always flush to the right edge (pr-1) */}
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Cart total, always visible next to the icon — matches Angular's header getCartTotal() */}
      <span className="text-sm font-medium text-primary whitespace-nowrap">
        {money(totalAmount)}
      </span>
    </>
  );
}
