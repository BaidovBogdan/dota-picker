import ArrowBackIcon from '@expo/material-symbols/arrow_back.xml';
import FilterListIcon from '@expo/material-symbols/filter_list.xml';
import SortIcon from '@expo/material-symbols/sort.xml';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { type Href, router, Stack } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import { MessageState, Skeleton } from '@/components/feedback/states';
import { MetaHeroRow } from '@/components/meta/meta-hero-row';
import { AppText } from '@/components/ui/app-text';
import { ranks } from '@/data/options';
import { useTranslation } from '@/i18n';
import {
  getMetaSnapshot,
  isMetaSnapshotIncomplete,
  META_SNAPSHOT_COLLECTING_RETRY_MS,
  META_SNAPSHOT_STALE_RETRY_MS,
} from '@/services/api/dota';
import { useAppStore } from '@/store/app-store';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { Hero, Position } from '@/types/domain';

type SortMode = 'winRate' | 'picks' | 'name';

const positions: (Position | null)[] = [null, 1, 2, 3, 4, 5];

export default function MetaCatalogScreen() {
  const sessionUserId = useAppStore((state) => state.session?.userId);
  const initialRank = useAppStore((state) => state.draft.rank);
  const [rank, setRank] = useState<number | null>(initialRank);
  const [position, setPosition] = useState<Position | null>(null);
  const [sort, setSort] = useState<SortMode>('winRate');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['meta-snapshot', sessionUserId, rank],
    queryFn: () => getMetaSnapshot(rank),
    enabled: Boolean(sessionUserId),
    staleTime: (currentQuery) => {
      if (isMetaSnapshotIncomplete(currentQuery.state.data)) return 0;
      return currentQuery.state.data?.isStale
        ? META_SNAPSHOT_STALE_RETRY_MS
        : 15 * 60 * 1_000;
    },
    refetchInterval: (currentQuery) => {
      if (isMetaSnapshotIncomplete(currentQuery.state.data))
        return META_SNAPSHOT_COLLECTING_RETRY_MS;
      return currentQuery.state.data?.isStale ? META_SNAPSHOT_STALE_RETRY_MS : false;
    },
    refetchOnMount: (currentQuery) =>
      isMetaSnapshotIncomplete(currentQuery.state.data) ? 'always' : true,
  });
  const heroes = useMemo(() => {
    const positionStats = position
      ? new Map(
          (query.data?.positionStats ?? [])
            .filter((stat) => stat.position === position)
            .map((stat) => [stat.heroId, stat]),
        )
      : null;
    const filtered = (query.data?.catalog ?? [])
      .flatMap((hero) => {
        if (!positionStats || !position) return [hero];
        const stat = positionStats.get(hero.id);
        if (!stat) return [];
        return [
          {
            ...hero,
            positions: [position],
            picks: stat.picks,
            wins: stat.wins,
            winRate: stat.winRate,
          },
        ];
      })
      .filter((hero) => !deferredSearch || hero.name.toLocaleLowerCase().includes(deferredSearch));
    return [...filtered].sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'picks') return (right.picks ?? 0) - (left.picks ?? 0);
      return (right.winRate ?? 0) - (left.winRate ?? 0) || (right.picks ?? 0) - (left.picks ?? 0);
    });
  }, [deferredSearch, position, query.data?.catalog, query.data?.positionStats, sort]);
  const openHero = useCallback((hero: Hero) => {
    router.push(`/hero/${hero.id}` as Href);
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('meta.catalogTitle'),
          headerBackButtonDisplayMode: 'minimal',
          headerSearchBarOptions: {
            placeholder: t('meta.search'),
            hideWhenScrolling: false,
            placement: 'stacked',
            barTintColor: 'transparent',
            tintColor: colors.cobalt,
            textColor: colors.text,
            hintTextColor: colors.textMuted,
            headerIconColor: colors.textMuted,
            onChangeText: (event) => setSearch(event.nativeEvent.text),
            onCancelButtonPress: () => setSearch(''),
            onClose: () => setSearch(''),
          },
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={t('common.back')}
          icon={Platform.OS === 'ios' ? 'chevron.left' : ArrowBackIcon}
          separateBackground
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          accessibilityLabel={t('meta.roleFilter')}
          icon={Platform.OS === 'ios' ? 'line.3.horizontal.decrease.circle' : FilterListIcon}
        >
          <Stack.Toolbar.Label>{t('meta.roleFilter')}</Stack.Toolbar.Label>
          {positions.map((value) => (
            <Stack.Toolbar.MenuAction
              key={value ?? 'all'}
              isOn={position === value}
              onPress={() => setPosition(value)}
            >
              {value ? `P${value} · ${t(`position.${value}`)}` : t('meta.allRoles')}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Menu
          accessibilityLabel={t('meta.sort')}
          icon={Platform.OS === 'ios' ? 'arrow.up.arrow.down.circle' : SortIcon}
        >
          <Stack.Toolbar.Label>{t('meta.sort')}</Stack.Toolbar.Label>
          {(['winRate', 'picks', 'name'] as const).map((value) => (
            <Stack.Toolbar.MenuAction
              key={value}
              isOn={sort === value}
              onPress={() => setSort(value)}
            >
              {t(`meta.sort.${value}`)}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>

      <FlashList
        data={heroes}
        keyExtractor={(hero) => String(hero.id)}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: 12,
          paddingTop: 0,
          paddingBottom: 106,
        }}
        ListHeaderComponent={
          <View style={{ paddingBottom: 10 }}>
            <View
              style={{
                minHeight: 82,
                marginBottom: 12,
                padding: 13,
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: shape.feature,
                backgroundColor: colors.surfaceElevated,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="data" color={colors.live}>
                  {t(query.data?.isStale ? 'meta.staleWindow' : 'meta.liveWindow')} ·{' '}
                  {query.data?.patch ?? '—'}
                </AppText>
                <AppText variant="inscription" style={{ marginTop: 3 }}>
                  {t('meta.catalogCount', { count: heroes.length })}
                </AppText>
                <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>
                  {position ? `P${position} · ${t(`position.${position}`)}` : t('meta.allRoles')}
                </AppText>
              </View>
              <View
                style={{
                  minWidth: 54,
                  height: 54,
                  paddingHorizontal: 8,
                  borderRadius: 27,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.cobalt,
                }}
              >
                <AppText variant="data" color="#FFFFFF">
                  {rank ? t(`rank.${rank}`) : t('rank.any')}
                </AppText>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 7 }}
            >
              {ranks.map((option) => {
                const active = option.value === rank;
                return (
                  <Pressable
                    key={option.labelKey}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => setRank(option.value)}
                    style={{
                      minHeight: 40,
                      paddingHorizontal: 12,
                      justifyContent: 'center',
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: active ? colors.cobalt : colors.outline,
                      backgroundColor: active ? colors.cobalt : colors.surface,
                    }}
                  >
                    <AppText variant="data" color={active ? '#FFFFFF' : colors.textMuted}>
                      {t(option.labelKey)}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={{ paddingBottom: 7 }}>
            <MetaHeroRow hero={item} index={index} onPress={openHero} />
          </View>
        )}
        ListEmptyComponent={
          query.isPending ? (
            <View style={{ gap: 7 }}>
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} height={72} />
              ))}
            </View>
          ) : (
            <MessageState
              title={t(query.isError ? 'errors.metaUnavailable' : 'meta.empty')}
              message={t(query.isError ? 'errors.tryAgain' : 'meta.emptyBody')}
              icon={query.isError ? 'cloud-offline-outline' : 'search-outline'}
              {...(query.isError
                ? {
                    onAction: () => void query.refetch(),
                    actionLabel: t('common.retry'),
                  }
                : {})}
            />
          )
        }
      />
    </>
  );
}
