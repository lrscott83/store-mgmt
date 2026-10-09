import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Carrito del CLIENTE ANÓNIMO del catálogo público (F3, decisión D13).
 *
 * Store PROPIO y deliberadamente separado de `useCartStore` (`shared/lib/stores/cart-store`):
 * aquel es la venta del POS (persiste en `lizoft-cart`, lleva `orderType`, `payments`,
 * `clientName`) y esta es la lista de productos que alguien pide desde el catálogo. Compartirlo
 * dejaría los productos del cliente en la venta del vendedor y viceversa.
 *
 * Por eso la clave de `persist` es `lizoft-catalog-cart`, NUNCA `lizoft-cart`.
 */
export const STOREFRONT_CART_STORAGE_KEY = 'lizoft-catalog-cart';

/** Datos del producto que el carrito necesita para pintar la línea sin volver a pedirlo. */
export interface StorefrontCartProduct {
  readonly id: string;
  readonly name: string;
  /** Código de moneda del catálogo ("CUP", "USD", …). */
  readonly currency: string;
  /** Precio unitario vigente en el catálogo. SOLO presentación: el total real lo fija el servidor. */
  readonly unitPrice: number;
  readonly imageUrl?: string | null;
}

export interface StorefrontCartLine {
  readonly productId: string;
  readonly name: string;
  readonly currency: string;
  readonly unitPrice: number;
  readonly imageUrl: string | null;
  readonly quantity: number;
}

export interface StorefrontCartState {
  /**
   * Un carrito por tienda. La clave es el slug del catálogo: dos tiendas distintas son dos
   * catálogos distintos y sus carritos no se mezclan, aunque compartan navegador.
   */
  readonly itemsByStore: Record<string, StorefrontCartLine[]>;
  addItem: (storeSlug: string, product: StorefrontCartProduct, quantity?: number) => void;
  removeItem: (storeSlug: string, productId: string) => void;
  /** Cantidad <= 0 quita la línea (mismo criterio que el carrito del POS). */
  updateQuantity: (storeSlug: string, productId: string, quantity: number) => void;
  clear: (storeSlug: string) => void;
  /**
   * Subtotal de presentación: lo que ve el cliente mientras arma el pedido. NO es el total del
   * pedido — el servidor recalcula los precios al crear la orden.
   */
  total: (storeSlug: string) => number;
  count: (storeSlug: string) => number;
}

function linesOf(state: StorefrontCartState, storeSlug: string): StorefrontCartLine[] {
  return state.itemsByStore[storeSlug] ?? [];
}

export const useStorefrontCartStore = create<StorefrontCartState>()(
  persist(
    (set, get) => ({
      itemsByStore: {},

      addItem: (storeSlug, product, quantity = 1) => {
        set((state) => {
          const lines = state.itemsByStore[storeSlug] ?? [];
          const existing = lines.find((line) => line.productId === product.id);
          const next = existing
            ? lines.map((line) =>
                line.productId === product.id
                  ? { ...line, quantity: line.quantity + quantity }
                  : line,
              )
            : [
                ...lines,
                {
                  productId: product.id,
                  name: product.name,
                  currency: product.currency,
                  unitPrice: product.unitPrice,
                  imageUrl: product.imageUrl ?? null,
                  quantity,
                },
              ];
          return { itemsByStore: { ...state.itemsByStore, [storeSlug]: next } };
        });
      },

      removeItem: (storeSlug, productId) => {
        set((state) => ({
          itemsByStore: {
            ...state.itemsByStore,
            [storeSlug]: linesOf(state, storeSlug).filter((line) => line.productId !== productId),
          },
        }));
      },

      updateQuantity: (storeSlug, productId, quantity) => {
        set((state) => ({
          itemsByStore: {
            ...state.itemsByStore,
            [storeSlug]:
              quantity > 0
                ? linesOf(state, storeSlug).map((line) =>
                    line.productId === productId ? { ...line, quantity } : line,
                  )
                : linesOf(state, storeSlug).filter((line) => line.productId !== productId),
          },
        }));
      },

      clear: (storeSlug) => {
        set((state) => ({ itemsByStore: { ...state.itemsByStore, [storeSlug]: [] } }));
      },

      total: (storeSlug) =>
        linesOf(get(), storeSlug).reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),

      count: (storeSlug) =>
        linesOf(get(), storeSlug).reduce((sum, line) => sum + line.quantity, 0),
    }),
    {
      name: STOREFRONT_CART_STORAGE_KEY,
    },
  ),
);
