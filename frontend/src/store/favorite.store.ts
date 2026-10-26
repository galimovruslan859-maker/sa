import { create } from 'zustand';
import { favoriteApi } from '../services/endpoints';
import type { Product } from '../services/types';

interface FavoriteState {
  ids: number[];
  items: Array<Product & { addedAt: string }>;
  loading: boolean;
  loaded: boolean;
  fetch: () => Promise<void>;
  toggle: (productId: number) => Promise<boolean>;
  reset: () => void;
}

export const useFavoriteStore = create<FavoriteState>()((set, get) => ({
  ids: [],
  items: [],
  loading: false,
  loaded: false,

  async fetch() {
    set({ loading: true });
    try {
      const { items } = await favoriteApi.list();
      set({ items, ids: items.map((i) => i.id), loading: false, loaded: true });
    } catch {
      set({ loading: false, loaded: true });
    }
  },

  async toggle(productId) {
    const { favorite } = await favoriteApi.toggle(productId);
    const ids = favorite
      ? Array.from(new Set([...get().ids, productId]))
      : get().ids.filter((id) => id !== productId);
    const items = favorite ? get().items : get().items.filter((i) => i.id !== productId);
    set({ ids, items });
    return favorite;
  },

  reset() {
    set({ ids: [], items: [], loaded: false, loading: false });
  },
}));

export const selectIsFavorite = (productId: number) => (state: FavoriteState) =>
  state.ids.includes(productId);
