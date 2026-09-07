import type { Product } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { getWholesaleConfig, resolveWholesalePrice, wholesaleUnits } from './wholesale';

/**
 * Presentación del carrito para la venta mayorista (2026-09-06):
 * - La cantidad visible es PAQUETES (cajas/paquetes), no unidades.
 * - El precio visible es el DEL PAQUETE (unitPrice × packSize), no el por unidad.
 * - El badge del carrito cuenta paquetes, no unidades.
 *
 * El estado interno del carrito NO cambia: `quantity` sigue siendo unidades
 * (para descontar inventario y crear la orden igual que hoy). Esto es solo la
 * capa de presentación en CartShell.
 */
export const wholesaleCartDisplay = {
  /**
   * Paquetes que representa una cantidad en unidades del carrito.
   * - Producto mayorista: units / packSize (0 si no es exacto — estado inválido).
   * - Producto normal: siempre 1 (la unidad de carrito ES la unidad).
   */
  packsFromUnits(units: number, product: Product): number {
    const config = getWholesaleConfig(product);
    if (!config) return 1;
    if (units <= 0 || units % config.packSize !== 0) return 0;
    return units / config.packSize;
  },

  /**
   * Precio de UN paquete: unitPrice × packSize. Para productos normales es el
   * precio retail (packSize 1). Sin precio de línea (undefined) usa el del
   * primer rango (o retail como fallback), igual que resolveWholesalePrice.
   */
  packPrice(product: Product, linePrice?: number): number {
    const config = getWholesaleConfig(product);
    if (!config) return product.price;
    const unitPrice = linePrice ?? resolveWholesalePrice(product, 1).unitPrice;
    return unitPrice * config.packSize;
  },

  /**
   * Conteo para el badge del carrito: paquetes en venta mayorista, unidades en
   * venta normal (producto sin config mayorista).
   */
  cartBadgeCount(items: CartItem[]): number {
    return items.reduce((sum, item) => {
      const config = getWholesaleConfig(item.product);
      if (!config) return sum + item.quantity;
      return sum + this.packsFromUnits(item.quantity, item.product);
    }, 0);
  },
};
