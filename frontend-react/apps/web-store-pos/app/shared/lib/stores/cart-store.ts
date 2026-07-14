import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '@store-mgmt/domain';
import { OrderType, PaymentType } from '@store-mgmt/domain';

export interface CartItem {
  product: Product;
  quantity: number;
  /** Per-line custom price (Angular's CartItem.price, nullable — set on first add, e.g. for
   * a Mayorista sale's editable price). Falls back to `product.price` when unset, keeping the
   * Normal-sale path byte-identical. */
  price?: number;
}

interface CartState {
  items: CartItem[];
  /** 1:1 port of Angular's ShoppingCartService's single `orderType` field
   * (shopping-cart.service.ts:23) — overwritten only on the NEW-item branch of addItem,
   * reset to Normal by clear(). No per-orderType cart isolation (matches Angular). */
  orderType: OrderType;
  /** 1:1 port of Angular's ShoppingCartService's `orderDescription` field
   * (shopping-cart.service.ts:24) — declared with NO initializer (undefined until
   * `updateOrderDetails` runs), reset to `''` by `clear()` (mirrors clearCart line 163). */
  orderDescription: string | undefined;
  paymentType: PaymentType;
  isCredit: boolean;
  clientName: string;
  addItem: (product: Product, quantity?: number, orderType?: OrderType, price?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  setPaymentType: (type: PaymentType) => void;
  setClientName: (name: string) => void;
  toggleCredit: () => void;
  /** 1:1 port of Angular's ShoppingCartService.updateOrderDetails (shopping-cart.service.ts:38-41). */
  updateOrderDetails: (orderType: OrderType, orderDescription: string) => void;
  /** 1:1 port of Angular's ShoppingCartService.getOrderDescription (shopping-cart.service.ts:55-56). */
  getOrderDescription: () => string | undefined;
  clear: () => void;
  total: () => number;
  /** 1:1 port of Angular's ShoppingCartService.getCartItemQuantity(productId). */
  getItemQuantity: (productId: string) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      orderType: OrderType.Normal,
      orderDescription: undefined,
      paymentType: PaymentType.Efectivo,
      isCredit: false,
      clientName: '',

      addItem: (product: Product, quantity = 1, orderType = OrderType.Normal, price?: number) => {
        set((state) => {
          const existing = state.items.find((i) => i.product.id === product.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.product.id === product.id
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            };
          }
          return {
            orderType,
            items: [...state.items, { product, quantity, price: price ?? product.price }],
          };
        });
      },

      removeItem: (productId: string) => {
        set((state) => ({
          items: state.items.filter((i) => i.product.id !== productId),
        }));
      },

      updateQuantity: (productId: string, qty: number) => {
        if (qty <= 0) {
          get().removeItem(productId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.product.id === productId ? { ...i, quantity: qty } : i
          ),
        }));
      },

      setPaymentType: (type: PaymentType) => {
        set({ paymentType: type });
      },

      setClientName: (name: string) => {
        set({ clientName: name });
      },

      toggleCredit: () => {
        set((state) => ({ isCredit: !state.isCredit }));
      },

      updateOrderDetails: (orderType: OrderType, orderDescription: string) => {
        set({ orderType, orderDescription });
      },

      getOrderDescription: () => {
        return get().orderDescription;
      },

      clear: () => {
        set({
          items: [],
          orderType: OrderType.Normal,
          orderDescription: '',
          paymentType: PaymentType.Efectivo,
          isCredit: false,
          clientName: '',
        });
      },

      total: () => {
        return get().items.reduce(
          (sum, item) => sum + (item.price ?? item.product.price) * item.quantity,
          0
        );
      },

      getItemQuantity: (productId: string) => {
        return get()
          .items.filter((i) => i.product.id === productId)
          .reduce((sum, i) => sum + i.quantity, 0);
      },
    }),
    {
      name: 'lizoft-cart',
    }
  )
);
