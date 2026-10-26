import { create } from 'zustand';
import { cartApi } from '../services/endpoints';
import type { Cart, CartItem, DeliveryOption } from '../services/types';

interface CartState {
  items: CartItem[];
  count: number;
  itemsTotal: number;
  itemsTotalCents: number;
  delivery: DeliveryOption[];
  loading: boolean;
  error: string | null;
  loaded: boolean;

  fetch: () => Promise<void>;
  add: (variantId: number, quantity?: number) => Promise<void>;
  update: (id: number, quantity: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clear: () => Promise<void>;
  reset: () => void;
  setError: (message: string | null) => void;
}

function apply(cart: Cart) {
  return {
    items: cart.items,
    count: cart.count,
    itemsTotal: cart.itemsTotal,
    itemsTotalCents: cart.itemsTotalCents,
    delivery: cart.delivery ?? [],
    loading: false,
    error: null,
    loaded: true,
  };
}

const EMPTY = {
  items: [] as CartItem[],
  count: 0,
  itemsTotal: 0,
  itemsTotalCents: 0,
  delivery: [] as DeliveryOption[],
  loading: false,
  error: null as string | null,
  loaded: false,
};

export const useCartStore = create<CartState>()((set) => ({
  ...EMPTY,

  async fetch() {
    set({ loading: true, error: null });
    try {
      set(apply(await cartApi.get()));
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Не удалось загрузить корзину' });
    }
  },

  async add(variantId, quantity = 1) {
    set({ loading: true, error: null });
    try {
      set(apply(await cartApi.add(variantId, quantity)));
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Не удалось добавить товар' });
      throw err;
    }
  },

  async update(id, quantity) {
    set({ error: null });
    try {
      set(apply(await cartApi.update(id, quantity)));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Не удалось изменить количество' });
      throw err;
    }
  },

  async remove(id) {
    set({ error: null });
    try {
      set(apply(await cartApi.remove(id)));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Не удалось удалить позицию' });
      throw err;
    }
  },

  async clear() {
    try {
      set(apply(await cartApi.clear()));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Не удалось очистить корзину' });
    }
  },

  reset() {
    set({ ...EMPTY });
  },

  setError(message) {
    set({ error: message });
  },
}));

export const selectCartCount = (state: CartState) => state.count;
export const selectCartTotal = (state: CartState) => state.itemsTotal;
