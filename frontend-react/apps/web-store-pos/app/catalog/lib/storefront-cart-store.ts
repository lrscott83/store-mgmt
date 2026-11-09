import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CatalogWholesaleConfig, CatalogWholesaleTier } from '~/catalog/lib/catalog-wholesale';
import { wholesaleMinPacksOf, wholesaleUnitPriceFor } from '~/catalog/lib/catalog-wholesale';
import { round2 } from '~/shared/lib/money';

/**
 * Carrito del CLIENTE ANÓNIMO del catálogo público (F3, decisión D13).
 *
 * Store PROPIO y deliberadamente separado de `useCartStore` (`shared/lib/stores/cart-store`):
 * aquel es la venta del POS (persiste en `lizoft-cart`, lleva `orderType`, `payments`,
 * `clientName`) y esta es la lista de productos que alguien pide desde el catálogo. Compartirlo
 * dejaría los productos del cliente en la venta del vendedor y viceversa.
 *
 * Por eso la clave de `persist` es `lizoft-catalog-cart`, NUNCA `lizoft-cart`.
 *
 * WHOLESALE MODE (S4): the customer picks PACKS, not units. A line keeps both numbers because two
 * different consumers need them:
 *   - `packs` + `packSize` + `tiers` belong to the CART VIEW: the ± buttons move one pack and the
 *     price is re-resolved from the applicable tier without re-fetching the product.
 *   - `quantity` (UNITS = `packs × packSize`) is what travels to the server when the order is
 *     created, and the server is the one that fixes the final price. It stays in units —not packs—
 *     because the order contract (`PublicOrderLineRequest`) is `{ productId, quantity }` and that
 *     field has always meant units.
 *
 * In `Unit` mode NONE of this is written: the line is persisted with exactly the same fields as
 * before and every operation keeps its old semantics (quantity in units, default 1, ≤ 0 removes the
 * line). That is why the wholesale fields are OPTIONAL instead of `null`: a unit-mode cart does not
 * change a single byte of `localStorage`.
 */
export const STOREFRONT_CART_STORAGE_KEY = 'lizoft-catalog-cart';

/** Datos del producto que el carrito necesita para pintar la línea sin volver a pedirlo. */
export interface StorefrontCartProduct {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  /** Precio unitario vigente en el catálogo. SOLO presentación: el total real lo fija el servidor. */
  readonly unitPrice: number;
  readonly imageUrl?: string | null;
  /**
   * Published wholesale config, or `null`/absent for a per-unit product. The caller decides it
   * (`wholesaleConfigOf`); this store never re-reads the store-wide price mode.
   */
  readonly wholesale?: CatalogWholesaleConfig | null;
}

export interface StorefrontCartLine {
  readonly productId: string;
  readonly name: string;
  readonly currency: string;
  /**
   * Price PER UNIT. In wholesale mode this is the applicable tier's unit price and it is
   * re-resolved on every quantity change, because ± can cross a tier boundary.
   */
  readonly unitPrice: number;
  readonly imageUrl: string | null;
  /** UNITS (in wholesale, `packs × packSize`): what the server receives when the order is created. */
  readonly quantity: number;

  // --- Wholesale lines only (absent on a per-unit line) ---

  /** Present and `'Wholesale'` only on lines sold by the pack. */
  readonly priceMode?: StorefrontCartPriceMode;
  /** Packs the customer picked: the number the ± buttons move. */
  readonly packs?: number;
  /** Units per pack, needed to rebuild units whenever the pack count changes. */
  readonly packSize?: number;
  /** Configured unit ("caja") exactly as published. `null` = the product did not define one. */
  readonly unitLabel?: string | null;
  /** The product's tiers: lets this store re-resolve the price without re-fetching the product. */
  readonly tiers?: readonly CatalogWholesaleTier[];
}

/** Line mode. Absent means `'Unit'` (that is how `isWholesaleLine` reads it). */
export type StorefrontCartPriceMode = 'Unit' | 'Wholesale';

export interface StorefrontCartState {
  /**
   * Un carrito por tienda. La clave es el slug del catálogo: dos tiendas distintas son dos
   * catálogos distintos y sus carritos no se mezclan, aunque compartan navegador.
   */
  readonly itemsByStore: Record<string, StorefrontCartLine[]>;
  /**
   * Adds a product. `quantity` means PACKS for a wholesale product (defaulting to the minimum
   * sellable amount) and UNITS for a per-unit one (defaulting to 1): the mode is a property of the
   * product, not a decision of the caller.
   */
  addItem: (storeSlug: string, product: StorefrontCartProduct, quantity?: number) => void;
  removeItem: (storeSlug: string, productId: string) => void;
  /**
   * Changes a line's amount. The number means PACKS on a wholesale line and UNITS on a per-unit
   * one (same rule as the ± buttons). Zero, a negative number —or anything below the minimum packs
   * — removes the line, exactly like the POS wholesale cart.
   */
  updateQuantity: (storeSlug: string, productId: string, quantity: number) => void;
  clear: (storeSlug: string) => void;
  /**
   * Subtotal de presentación: lo que ve el cliente mientras arma el pedido. NO es el total del
   * pedido — el servidor recalcula los precios al crear la orden.
   */
  total: (storeSlug: string) => number;
  count: (storeSlug: string) => number;
}

/** Does this line sell by the pack? The mode is a property of the line, not of the store. */
export function isWholesaleLine(line: StorefrontCartLine): boolean {
  return line.priceMode === 'Wholesale';
}

/**
 * The number the ± buttons and the input move: PACKS on a wholesale line, UNITS on a per-unit one.
 * Components use it so they never have to know which mode a line is in.
 */
export function linePacks(line: StorefrontCartLine): number {
  return isWholesaleLine(line) ? (line.packs ?? 0) : line.quantity;
}

/** Smallest sellable pack count. 1 on a per-unit line (there is no pack minimum there). */
export function lineMinPacks(line: StorefrontCartLine): number {
  return isWholesaleLine(line) ? wholesaleMinPacksOf(line.tiers ?? []) : 1;
}

/** Price of ONE pack at this line's tier (unit price × units per pack). */
export function linePackPrice(line: StorefrontCartLine): number {
  return round2(line.unitPrice * (line.packSize ?? 1));
}

/**
 * The amount the view shows. Wholesale: `packs × packSize × unitPrice`, the SAME total the server
 * computes when the order is created (S5). Per unit: `unitPrice × quantity` with no rounding,
 * exactly as before wholesale mode existed.
 */
export function lineTotal(line: StorefrontCartLine): number {
  if (!isWholesaleLine(line)) return line.unitPrice * line.quantity;
  return round2(line.unitPrice * (line.packs ?? 0) * (line.packSize ?? 0));
}

function linesOf(state: StorefrontCartState, storeSlug: string): StorefrontCartLine[] {
  return state.itemsByStore[storeSlug] ?? [];
}

/** A config with no tiers or no pack size cannot be sold by the pack, so it is ignored. */
function usableWholesale(
  wholesale: CatalogWholesaleConfig | null | undefined,
): CatalogWholesaleConfig | undefined {
  if (!wholesale) return undefined;
  if (wholesale.packSize <= 0 || wholesale.tiers.length === 0) return undefined;
  return wholesale;
}

export const useStorefrontCartStore = create<StorefrontCartState>()(
  persist(
    (set, get) => ({
      itemsByStore: {},

      addItem: (storeSlug, product, quantity) => {
        set((state) => {
          const lines = state.itemsByStore[storeSlug] ?? [];
          const existing = lines.find((line) => line.productId === product.id);
          const wholesale = usableWholesale(product.wholesale);

          if (!wholesale) {
            // Unit mode: the old path, untouched (default 1, accumulates onto the existing line and
            // keeps the price it entered with).
            const amount = quantity ?? 1;
            const next = existing
              ? lines.map((line) =>
                  line.productId === product.id
                    ? { ...line, quantity: line.quantity + amount }
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
                    quantity: amount,
                  },
                ];
            return { itemsByStore: { ...state.itemsByStore, [storeSlug]: next } };
          }

          // Wholesale mode: the customer is picking PACKS. Without an explicit amount the line
          // starts at the minimum sellable one (the first tier's `minPacks`), because it is the
          // smallest purchase that exists: adding "1" to a product whose minimum is 3 would create
          // a line that the very first − throws away.
          const minPacks = wholesaleMinPacksOf(wholesale.tiers);
          // The floor is not negotiable: a line below `minPacks` is not sellable, so an explicit
          // amount smaller than the minimum is raised to it instead of creating a line that the
          // first − would delete. (No UI path passes an amount today; the guard keeps the
          // invariant true for the next one.)
          const requestedPacks = quantity && quantity > 0 ? quantity : minPacks;
          const addedPacks = Math.max(requestedPacks, minPacks);
          const basePacks = existing && isWholesaleLine(existing) ? (existing.packs ?? 0) : 0;
          const packs = basePacks + addedPacks;
          // Price is resolved for the TOTAL pack count, not for the increment: two additions can
          // cross a tier boundary and then the whole line bills at the new tier's price.
          const unitPrice =
            wholesaleUnitPriceFor(wholesale.tiers, wholesale.packSize, packs) ??
            existing?.unitPrice ??
            product.unitPrice;

          const nextLine: StorefrontCartLine = {
            productId: product.id,
            name: product.name,
            currency: product.currency,
            unitPrice,
            imageUrl: product.imageUrl ?? null,
            quantity: packs * wholesale.packSize,
            priceMode: 'Wholesale',
            packs,
            packSize: wholesale.packSize,
            unitLabel: wholesale.unitLabel,
            tiers: wholesale.tiers,
          };
          const next = existing
            ? lines.map((line) => (line.productId === product.id ? nextLine : line))
            : [...lines, nextLine];
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
        set((state) => {
          const lines = linesOf(state, storeSlug);
          const line = lines.find((item) => item.productId === productId);

          if (line && isWholesaleLine(line)) {
            // `quantity` is PACKS here. The POS rule, as-is: below the minimum sellable amount the
            // line LEAVES the cart instead of lingering at a pack count nobody can buy.
            const packs = quantity;
            if (packs <= 0 || packs < lineMinPacks(line)) {
              return {
                itemsByStore: {
                  ...state.itemsByStore,
                  [storeSlug]: lines.filter((item) => item.productId !== productId),
                },
              };
            }
            const unitPrice =
              wholesaleUnitPriceFor(line.tiers ?? [], line.packSize ?? 0, packs) ?? line.unitPrice;
            return {
              itemsByStore: {
                ...state.itemsByStore,
                [storeSlug]: lines.map((item) =>
                  item.productId === productId
                    ? {
                        ...item,
                        packs,
                        quantity: packs * (line.packSize ?? 0),
                        unitPrice,
                      }
                    : item,
                ),
              },
            };
          }

          // Unit mode: the old path (quantity ≤ 0 removes the line).
          return {
            itemsByStore: {
              ...state.itemsByStore,
              [storeSlug]:
                quantity > 0
                  ? lines.map((item) =>
                      item.productId === productId ? { ...item, quantity } : item,
                    )
                  : lines.filter((item) => item.productId !== productId),
            },
          };
        });
      },

      clear: (storeSlug) => {
        set((state) => ({ itemsByStore: { ...state.itemsByStore, [storeSlug]: [] } }));
      },

      total: (storeSlug) => linesOf(get(), storeSlug).reduce((sum, line) => sum + lineTotal(line), 0),

      // The counter says HOW MANY THINGS are being ordered: in wholesale mode that means packs, not
      // units. Summing units would paint "24" for a single box of 24 in the cart badge, a number
      // the customer never asked for.
      count: (storeSlug) => linesOf(get(), storeSlug).reduce((sum, line) => sum + linePacks(line), 0),
    }),
    {
      name: STOREFRONT_CART_STORAGE_KEY,
    },
  ),
);
