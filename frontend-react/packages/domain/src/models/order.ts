import type { AuditableBaseModel } from './base';
import type { Currency, OrderType, PaymentType, SalePaymentMethod } from '../enums';
import type { InventoryEntryCost } from './inventory';
import type { OrderPayment } from './order-payment';

export interface OrderItem {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  name: string;
  /** Quantity sold. May be a decimal (fractional, e.g. 1.5, 0.25, 2.75); not limited to integers. */
  quantity: number;
  price: number;
  productBusinessId: string;
  productCosts: InventoryEntryCost[];
  order: number;
  /** Moneda de `price` (plan 2026-09-16). Ausente = CUP (DEFAULT_CURRENCY). */
  currency?: Currency;
  /** Price in the product's original currency, before conversion. Absent = `price`. */
  originalPrice?: number;
  /** Currency of `originalPrice`. Absent = `currency`. */
  originalCurrency?: Currency;
  /** Currency-per-USD rate used to convert. `1` when no conversion happened. */
  conversionRate?: number | null;
  /** Id of the resolved `ChannelRate` row used for the conversion. */
  conversionRateId?: string | null;
  /** Moment from which the conversion rate was in force. */
  conversionRateEffectiveFrom?: Date | null;
  /** Units per pack of the applied wholesale tier. */
  wholesalePackSize?: number | null;
  /** Packs sold (`quantity / packSize`). */
  wholesalePacks?: number | null;
  /** `minPacks` of the applied wholesale tier. */
  wholesaleTierMinPacks?: number | null;
  /** `pricePerUnit` of the applied wholesale tier. */
  wholesaleTierUnitPrice?: number | null;
}

export interface Order extends AuditableBaseModel {
  id: string;
  orderItems: OrderItem[];
  total: number;
  itemsCount: number;
  date: Date;
  type: OrderType;
  paymentType: PaymentType;
  isCredit: boolean;
  description: string;
  /** Moneda de `total` y de los precios de sus items (plan 2026-09-16). Ausente = CUP. */
  currency?: Currency;
  /**
   * Forma de pago de la venta (plan 2026-09-17). Ausente = derivar del
   * `paymentType` legacy (Tarjeta → Transferencia-CUP); sin ninguno = Efectivo.
   */
  salePaymentMethod?: SalePaymentMethod;
  /** Porcentaje aplicado al total al crear la venta (auditoría). Ausente = 0. */
  percent?: number;
  /** Monto fijo sumado al total al crear la venta (auditoría). Ausente = 0. */
  tax?: number;
  /**
   * MultiPayments (plan 2026-09-18): the payment lines of the sale. Optional on
   * purpose — legacy orders persisted before the feature have no `payments` and
   * every read path MUST tolerate its absence (no required backfill). Empty/absent
   * means "single legacy payment" described by `paymentType`/`salePaymentMethod`.
   */
  payments?: OrderPayment[];
  /** Store the sale was registered against (today implicit in the storage key). */
  storeId?: string;
  /** `userId` of the user who registered the sale. */
  createdById?: string;
  /** Client name (today only inside `description`, and only for credit sales). */
  client?: string;
  /** Amount the client handed over (cash). */
  tenderedAmount?: number;
  /** Change handed back. */
  change?: number;
  /** Sale-currency currency-per-USD rate at sale time. `1` without MultiMonedas. */
  saleCurrencyRateApplied?: number | null;
  /** Id of the sale-currency rate row. */
  saleCurrencyRateId?: string | null;
  /** Moment from which the sale-currency rate was in force. */
  saleCurrencyRateEffectiveFrom?: Date | null;
}
