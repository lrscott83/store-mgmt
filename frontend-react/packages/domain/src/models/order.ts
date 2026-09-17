import type { AuditableBaseModel } from './base';
import type { Currency, OrderType, PaymentType, SalePaymentMethod } from '../enums';
import type { InventoryEntryCost } from './inventory';

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
}
