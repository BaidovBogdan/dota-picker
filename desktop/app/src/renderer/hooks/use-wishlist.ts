import { useMutation } from '@tanstack/react-query';

import { desktop } from '../bridge';
import { useAppStore } from '../store';

type FavoriteMutation = {
  heroId: number;
  favorite: boolean;
};

type FavoriteMutationContext = {
  previousFavorite: boolean;
};

let confirmedWishlist: number[] | null = null;
let activeWishlistMutations = 0;

function setFavoriteState(wishlist: number[], heroId: number, favorite: boolean) {
  const containsHero = wishlist.includes(heroId);
  if (containsHero === favorite) return wishlist;
  return favorite
    ? [...wishlist, heroId]
    : wishlist.filter((id) => id !== heroId);
}

function useFavoriteMutation() {
  const setPreferences = useAppStore((state) => state.setPreferences);
  const setWishlist = useAppStore((state) => state.setWishlist);

  return useMutation({
    scope: { id: 'wishlist-persistence' },
    mutationFn: async ({ heroId, favorite }: FavoriteMutation) => {
      const baseline = confirmedWishlist ?? useAppStore.getState().wishlist;
      const wishlist = setFavoriteState(baseline, heroId, favorite);
      return desktop.preferences.update({ wishlist });
    },
    onMutate: ({ heroId, favorite }): FavoriteMutationContext => {
      const state = useAppStore.getState();
      if (activeWishlistMutations === 0 || confirmedWishlist === null) {
        confirmedWishlist = [...state.wishlist];
      }
      activeWishlistMutations += 1;
      const previousFavorite = state.wishlistSet.has(heroId);
      setWishlist(setFavoriteState(state.wishlist, heroId, favorite));
      return { previousFavorite };
    },
    onSuccess: (preferences) => {
      confirmedWishlist = [...preferences.wishlist];
      setPreferences(preferences);
    },
    onError: (_error, { heroId }, context) => {
      if (!context) return;
      const current = useAppStore.getState().wishlist;
      setWishlist(setFavoriteState(current, heroId, context.previousFavorite));
    },
    onSettled: () => {
      activeWishlistMutations = Math.max(0, activeWishlistMutations - 1);
      if (activeWishlistMutations !== 0) return;
      if (confirmedWishlist) setWishlist(confirmedWishlist);
      confirmedWishlist = null;
    },
  });
}

export function useFavorite(heroId: number) {
  const favorite = useAppStore((state) => state.wishlistSet.has(heroId));
  const mutation = useFavoriteMutation();

  return {
    favorite,
    toggle: () => mutation.mutate({ heroId, favorite: !favorite }),
    pending: mutation.isPending,
    error: mutation.error,
  };
}

export function useWishlist() {
  const wishlist = useAppStore((state) => state.wishlist);
  const wishlistSet = useAppStore((state) => state.wishlistSet);
  const mutation = useFavoriteMutation();

  return {
    wishlist,
    isFavorite: (heroId: number) => wishlistSet.has(heroId),
    toggle: (heroId: number) =>
      mutation.mutate({
        heroId,
        favorite: !useAppStore.getState().wishlistSet.has(heroId),
      }),
    pending: mutation.isPending,
    error: mutation.error,
  };
}
