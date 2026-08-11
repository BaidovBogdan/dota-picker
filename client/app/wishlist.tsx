import CheckIcon from '@expo/material-symbols/check.xml';
import SelectAllIcon from '@expo/material-symbols/select_all.xml';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { type Href, router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MessageState, Skeleton } from '@/components/feedback/states';
import { FloatingActionBar } from '@/components/layout/floating-action-bar';
import { MetaHeroRow } from '@/components/meta/meta-hero-row';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import { getHeroes } from '@/services/api/dota';
import { getSessionScope, useAppStore } from '@/store/app-store';
import { layout } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { Hero } from '@/types/domain';

export default function WishlistScreen() {
  const session = useAppStore((state) => state.session);
  const guestId = useAppStore((state) => state.guestId);
  const wishlistByOwnerScope = useAppStore((state) => state.wishlistByOwnerScope);
  const toggleWishlist = useAppStore((state) => state.toggleWishlist);
  const removeFromWishlist = useAppStore((state) => state.removeFromWishlist);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const ownerScope = getSessionScope(session, guestId);
  const query = useQuery({
    queryKey: ['heroes', session?.userId],
    queryFn: ({ signal }) => getHeroes(signal),
    enabled: Boolean(session),
    staleTime: 15 * 60 * 1000,
  });
  const heroes = useMemo(() => {
    const wishlistIds = ownerScope ? (wishlistByOwnerScope[ownerScope] ?? []) : [];
    const byId = new Map((query.data ?? []).map((hero) => [hero.id, hero]));
    return wishlistIds.flatMap((heroId) => {
      const hero = byId.get(heroId);
      return hero ? [hero] : [];
    });
  }, [ownerScope, query.data, wishlistByOwnerScope]);
  const listExtraData = useMemo(
    () => ({ selectedIds, selectionMode }),
    [selectedIds, selectionMode],
  );

  const closeSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelection = useCallback((hero: Hero) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(hero.id)) next.delete(hero.id);
      else next.add(hero.id);
      return next;
    });
  }, []);

  const removeSelected = useCallback(() => {
    removeFromWishlist([...selectedIds]);
    closeSelection();
  }, [closeSelection, removeFromWishlist, selectedIds]);
  const openHero = useCallback((hero: Hero) => {
    router.push(`/hero/${hero.id}` as Href);
  }, []);
  const toggleWishlistHero = useCallback((hero: Hero) => toggleWishlist(hero.id), [toggleWishlist]);
  const beginSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(true);
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title: t('wishlist.title'),
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t('wishlist.select')}
          hidden={selectionMode || heroes.length === 0}
          icon={Platform.OS === 'ios' ? undefined : SelectAllIcon}
          onPress={beginSelection}
        >
          {t('wishlist.select')}
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button
          accessibilityLabel={t('common.done')}
          hidden={!selectionMode}
          icon={Platform.OS === 'ios' ? undefined : CheckIcon}
          onPress={closeSelection}
        >
          {t('common.done')}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {Platform.OS === 'ios' && selectedIds.size > 0 ? (
        <Stack.Toolbar placement="bottom">
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Button
            accessibilityLabel={t('wishlist.removeSelected', { count: selectedIds.size })}
            icon="trash"
            tintColor={colors.live}
            onPress={removeSelected}
          >
            {t('wishlist.removeSelected', { count: selectedIds.size })}
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Spacer />
        </Stack.Toolbar>
      ) : null}

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <FlashList
          data={heroes}
          extraData={listExtraData}
          keyExtractor={(hero) => String(hero.id)}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: Platform.OS === 'ios' ? 72 : 118,
          }}
          renderItem={({ item }) => (
            <View style={{ paddingBottom: 7 }}>
              <MetaHeroRow
                hero={item}
                onPress={openHero}
                showHeart
                wishlisted
                onToggleWishlist={toggleWishlistHero}
                selectionMode={selectionMode}
                selected={selectedIds.has(item.id)}
                onToggleSelection={toggleSelection}
              />
            </View>
          )}
          ListEmptyComponent={
            query.isPending ? (
              <View style={{ gap: 7 }}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} height={72} />
                ))}
              </View>
            ) : query.isError ? (
              <MessageState
                title={t('errors.metaUnavailable')}
                message={t('errors.tryAgain')}
                icon="cloud-offline-outline"
                actionLabel={t('common.retry')}
                onAction={() => void query.refetch()}
              />
            ) : (
              <MessageState
                title={t('wishlist.empty')}
                message={t('wishlist.emptyBody')}
                icon="heart-outline"
                actionLabel={t('meta.viewAll')}
                onAction={() => router.push('/meta' as Href)}
              />
            )
          }
        />
        {Platform.OS !== 'ios' ? (
          <AnimatedRemoveAction
            visible={selectedIds.size > 0}
            label={t('wishlist.removeSelected', { count: selectedIds.size })}
            onPress={removeSelected}
          />
        ) : null}
      </View>
    </>
  );
}

function AnimatedRemoveAction({
  visible,
  label,
  onPress,
}: {
  visible: boolean;
  label: string;
  onPress: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    cancelAnimation(progress);
    if (reducedMotion) {
      progress.value = visible ? 1 : 0;
      return;
    }
    progress.value = withTiming(visible ? 1 : 0, {
      duration: 200,
      easing: Easing.bezier(0.42, 0, 0.58, 1),
      reduceMotion: ReduceMotion.System,
    });
    return () => cancelAnimation(progress);
  }, [progress, reducedMotion, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 24 }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 100,
        },
        animatedStyle,
      ]}
    >
      <FloatingActionBar label={label} icon="trash-outline" onPress={onPress} />
    </Animated.View>
  );
}
