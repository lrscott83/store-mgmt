import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  paymentType: PaymentType;
  isCredit: boolean;
  clientName: string;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  setPaymentType: (type: PaymentType) => void;
  setClientName: (name: string) => void;
  toggleCredit: () => void;
  clear: () => void;
  total: () => number;
  /** 1:1 port of Angular's ShoppingCartService.getCartItemQuantity(productId). */
  getItemQuantity: (productId: string) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      paymentType: PaymentType.Efectivo,
      isCredit: false,
      clientName: '',

      addItem: (product: Product, quantity = 1) => {
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
          return { items: [...state.items, { product, quantity }] };
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

      clear: () => {
        set({
          items: [],
          paymentType: PaymentType.Efectivo,
          isCredit: false,
          clientName: '',
        });
      },

      total: () => {
        return get().items.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
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
