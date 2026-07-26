import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

import { MessageState, Skeleton } from '@/components/feedback/states';
import { HeroPortrait } from '@/components/hero/hero-portrait';
import { AppText } from '@/components/ui/app-text';
import { useDraftAccessGuard } from '@/hooks/use-draft-access';
import { useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import { getHeroes } from '@/services/api/dota';
import { useAppStore } from '@/store/app-store';
import { useAppTheme } from '@/theme/use-app-theme';
import type { DraftTeam, Hero } from '@/types/domain';

export default function HeroSelectScreen() {
  const params = useLocalSearchParams<{ team?: string; replaceHeroId?: string }>();
  const validTeam = params.team === 'allies' || params.team === 'enemies';
  const team: DraftTeam = params.team === 'allies' ? 'allies' : 'enemies';
  const replacementId = Number(params.replaceHeroId);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const draft = useAppStore((state) => state.draft);
  const addHero = useAppStore((state) => state.addHero);
  const replaceHero = useAppStore((state) => state.replaceHero);
  const sessionUserId = useAppStore((state) => state.session?.userId);
  const draftAccess = useDraftAccessGuard();
  const query = useQuery({
    queryKey: ['heroes', sessionUserId],
    queryFn: getHeroes,
    enabled: Boolean(sessionUserId) && validTeam && draftAccess.status === 'allowed',
  });
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const waitNoticeShown = useRef(false);
  const isReplacement =
    Number.isInteger(replacementId) && replacementId > 0 && draft[team].includes(replacementId);
  const excluded = useMemo(() => {
    const result = new Set([...draft.allies, ...draft.enemies]);
    if (isReplacement) result.delete(replacementId);
    return result;
  }, [draft.allies, draft.enemies, isReplacement, replacementId]);
  const data = useMemo(() => {
    const heroes = query.data ?? [];
    return heroes
      .filter((hero) => !excluded.has(hero.id))
      .filter((hero) => !deferredSearch || hero.name.toLocaleLowerCase().includes(deferredSearch))
      .sort((left, right) => {
        const leftFit = draft.position && left.positions.includes(draft.position) ? 1 : 0;
        const rightFit = draft.position && right.positions.includes(draft.position) ? 1 : 0;
        return rightFit - leftFit || left.name.localeCompare(right.name);
      });
  }, [deferredSearch, draft.position, excluded, query.data]);

  useEffect(() => {
    if (draftAccess.status === 'allowed') {
      waitNoticeShown.current = false;
      return;
    }
    if (!validTeam || draftAccess.status !== 'waitForRefill' || waitNoticeShown.current) return;
    waitNoticeShown.current = true;
    draftAccess.requestAccess();
  }, [draftAccess, validTeam]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const select = (hero: Hero) => {
    draftAccess.requestAccess(() => {
      if (isReplacement) replaceHero(team, replacementId, hero.id);
      else addHero(team, hero.id);
      close();
    });
  };

  if (!validTeam) return <Redirect href="/(tabs)" />;

  const titleKey = isReplacement
    ? 'heroSelect.titleReplace'
    : team === 'allies'
      ? 'heroSelect.titleAllies'
      : 'heroSelect.titleEnemies';

  if (draftAccess.status !== 'allowed') {
    const pending = draftAccess.status === 'pending';
    const upgrade = draftAccess.status === 'upgrade';
    return (
      <>
        <Stack.Screen
          options={{
            ...nativeHeaderOptions(colors),
            title: t(titleKey),
            headerLargeTitleEnabled: false,
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 12,
            paddingBottom: 24,
            backgroundColor: colors.background,
          }}
        >
          <MessageState
            title={t(pending ? 'common.loading' : 'home.noAttempts')}
            message={t(
              pending
                ? 'common.loading'
                : upgrade
                  ? 'analysis.quotaBodyFree'
                  : 'analysis.quotaBodyPro',
            )}
            icon={pending ? 'sync-outline' : 'alert-circle-outline'}
            scene={pending ? 'loading' : 'warning'}
            {...(pending
              ? {}
              : {
                  actionLabel: t(upgrade ? 'profile.upgrade' : 'common.confirm'),
                  onAction: () => draftAccess.requestAccess(),
                })}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title: t(titleKey),
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
          headerSearchBarOptions: {
            placeholder: t('heroSelect.search'),
            hideWhenScrolling: false,
            placement: 'stacked',
            barTintColor: 'transparent',
            tintColor: team === 'allies' ? colors.cobalt : colors.live,
            textColor: colors.text,
            hintTextColor: colors.textMuted,
            headerIconColor: colors.textMuted,
            onChangeText: (event) => setSearch(event.nativeEvent.text),
            onCancelButtonPress: () => setSearch(''),
            onClose: () => setSearch(''),
          },
        }}
      />
      <FlashList
        data={data}
        keyExtractor={(item) => String(item.id)}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 0, paddingBottom: 36 }}
        ListHeaderComponent={
          <View
            style={{
              minHeight: 48,
              marginBottom: 6,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              borderBottomWidth: 2,
              borderColor: colors.outline,
            }}
          >
            <AppText
              variant="data"
              color={team === 'allies' ? colors.cobalt : colors.live}
              style={{ flex: 1 }}
            >
              {t(team === 'allies' ? 'heroSelect.sideAllies' : 'heroSelect.sideEnemies')}
            </AppText>
            <View
              style={{
                minWidth: 40,
                minHeight: 28,
                paddingHorizontal: 8,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: team === 'allies' ? colors.cobalt : colors.live,
              }}
            >
              <AppText variant="data" color="#FFFFFF">
                {draft[team].length}/{team === 'allies' ? 4 : 5}
              </AppText>
            </View>
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <View style={{ gap: 8 }}>
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </View>
          ) : query.isError ? (
            <MessageState
              title={t('heroSelect.loadError')}
              message={t('heroSelect.errorBody')}
              icon="cloud-offline-outline"
              actionLabel={t('common.retry')}
              onAction={() => void query.refetch()}
            />
          ) : (
            <MessageState
              title={t('heroSelect.empty')}
              message={t('heroSelect.emptyBody')}
              icon="search-outline"
            />
          )
        }
        renderItem={({ item, index }) => {
          const fits = Boolean(draft.position && item.positions.includes(draft.position));
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('heroSelect.choose', { name: item.name })}
              activeOpacity={0.72}
              onPress={() => select(item)}
              style={{
                minHeight: 78,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderBottomWidth: 1,
                borderColor: colors.outline,
                backgroundColor: colors.surface,
                paddingHorizontal: 8,
              }}
            >
              <AppText
                variant="data"
                color={colors.textMuted}
                style={{ width: 22, fontSize: 8, lineHeight: 11 }}
              >
                {String(index + 1).padStart(2, '0')}
              </AppText>
              <HeroPortrait hero={item} size={56} showName={false} />
              <View style={{ flex: 1 }}>
                <AppText variant="inscription" numberOfLines={1}>
                  {item.name}
                </AppText>
                <AppText
                  variant="caption"
                  color={fits ? colors.cobalt : colors.textMuted}
                  numberOfLines={1}
                  style={{ marginTop: 3, fontSize: 11, lineHeight: 14 }}
                >
                  {fits
                    ? t('heroSelect.fits', { position: draft.position ?? '' })
                    : t('heroSelect.positions', {
                        positions: item.positions.map((position) => `P${position}`).join(' · '),
                      })}
                </AppText>
              </View>
              {typeof item.winRate === 'number' ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="data" color={colors.textMuted} style={{ fontSize: 7 }}>
                    {t('home.winRateLabel')}
                  </AppText>
                  <AppText variant="inscription" color={colors.cobalt}>
                    {(item.winRate * 100).toFixed(1)}%
                  </AppText>
                </View>
              ) : (
                <Ionicons name="arrow-forward" size={20} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </>
  );
}
