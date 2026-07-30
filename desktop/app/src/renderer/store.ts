import { create } from 'zustand';

import type { Account, EngineState, Preferences } from './types';

type AppStore = {
  account: Account | null;
  preferences: Preferences | null;
  engine: EngineState | null;
  wishlist: number[];
  wishlistSet: ReadonlySet<number>;
  setAccount: (account: Account | null) => void;
  setPreferences: (preferences: Preferences) => void;
  setEngine: (engine: EngineState) => void;
  setWishlist: (wishlist: number[]) => void;
  toggleWishlist: (heroId: number) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  account: null,
  preferences: null,
  engine: null,
  wishlist: [],
  wishlistSet: new Set(),
  setAccount: (account) => set({ account }),
  setPreferences: (preferences) => set({ preferences }),
  setEngine: (engine) => set({ engine }),
  setWishlist: (wishlist) =>
    set((state) => {
      if (
        state.wishlist.length === wishlist.length &&
        state.wishlist.every((heroId, index) => heroId === wishlist[index])
      ) {
        return state;
      }
      return { wishlist, wishlistSet: new Set(wishlist) };
    }),
  toggleWishlist: (heroId) =>
    set((state) => {
      const wishlist = state.wishlistSet.has(heroId)
        ? state.wishlist.filter((id) => id !== heroId)
        : [...state.wishlist, heroId];
      return { wishlist, wishlistSet: new Set(wishlist) };
    }),
}));
