import FavoriteIcon from '@expo/material-symbols/favorite.xml';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MessageState, Skeleton } from '@/components/feedback/states';
import { AppText } from '@/components/ui/app-text';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import {
  getHeroDetail,
  type HeroBuildVariant,
  type HeroDetail,
  type HeroRankWinRate,
} from '@/services/api/dota';
import { getSessionScope, useAppStore } from '@/store/app-store';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function HeroDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const heroId = Number(params.id);
  const validHeroId = Number.isInteger(heroId) && heroId > 0;
  const { width } = useWindowDimensions();
  const headerHeight = useHeaderHeight();
  const reducedMotion = useReducedMotion();
  const scrollY = useSharedValue(0);
  const compactTitleVisibleOnUI = useSharedValue(false);
  const [compactTitleState, setCompactTitleState] = useState({
    heroId,
    visible: false,
  });
  const session = useAppStore((state) => state.session);
  const guestId = useAppStore((state) => state.guestId);
  const wishlistByOwnerScope = useAppStore((state) => state.wishlistByOwnerScope);
  const toggleWishlist = useAppStore((state) => state.toggleWishlist);
  const ownerScope = getSessionScope(session, guestId);
  const wishlistIds = ownerScope ? (wishlistByOwnerScope[ownerScope] ?? []) : [];
  const query = useQuery({
    queryKey: ['hero-detail', session?.userId, heroId],
    queryFn: () => getHeroDetail(heroId),
    enabled: Boolean(session && validHeroId),
    staleTime: (cachedQuery) => heroDetailStaleTime(cachedQuery.state.data),
  });
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const hero = query.data?.hero;
  const wishlisted = Boolean(hero && wishlistIds.includes(hero.id));
  const contentWidth = Math.min(width, layout.contentMaxWidth);
  const artworkHeight = Math.min(430, Math.max(320, contentWidth * 0.82));
  const gutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const compactTitleThreshold = Math.max(96, artworkHeight - headerHeight - 48);
  const compactTitleVisible = compactTitleState.heroId === heroId && compactTitleState.visible;
  const updateCompactTitle = useCallback(
    (visible: boolean) => {
      setCompactTitleState({ heroId, visible });
    },
    [heroId],
  );

  useEffect(() => {
    compactTitleVisibleOnUI.value = false;
    scrollY.value = 0;
  }, [compactTitleVisibleOnUI, heroId, scrollY]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      const nextCompactTitleVisible = event.contentOffset.y >= compactTitleThreshold;
      if (nextCompactTitleVisible === compactTitleVisibleOnUI.value) return;
      compactTitleVisibleOnUI.value = nextCompactTitleVisible;
      scheduleOnRN(updateCompactTitle, nextCompactTitleVisible);
    },
  });

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title: compactTitleVisible ? (hero?.name ?? '') : '',
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t(wishlisted ? 'wishlist.removeOne' : 'wishlist.addOne')}
          icon={
            process.env.EXPO_OS === 'ios' ? (wishlisted ? 'heart.fill' : 'heart') : FavoriteIcon
          }
          disabled={!hero}
          tintColor={wishlisted ? colors.live : colors.text}
          onPress={() => {
            if (hero) toggleWishlist(hero.id);
          }}
        />
      </Stack.Toolbar>

      <Animated.ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: 72 }}
      >
        {!validHeroId ? (
          <FallbackContainer headerHeight={headerHeight} gutter={gutter}>
            <MessageState
              title={t('heroDetail.notFound')}
              message={t('heroDetail.notFoundBody')}
              icon="alert-circle-outline"
            />
          </FallbackContainer>
        ) : query.isPending ? (
          <HeroDetailSkeleton artworkHeight={artworkHeight} gutter={gutter} />
        ) : query.isError || !query.data ? (
          <FallbackContainer headerHeight={headerHeight} gutter={gutter}>
            <MessageState
              title={t('heroDetail.loadError')}
              message={query.error instanceof Error ? query.error.message : t('errors.tryAgain')}
              icon="cloud-offline-outline"
              actionLabel={t('common.retry')}
              onAction={() => void query.refetch()}
            />
          </FallbackContainer>
        ) : (
          <View
            style={{
              width: '100%',
              maxWidth: layout.contentMaxWidth,
              alignSelf: 'center',
            }}
          >
            <HeroArtwork
              detail={query.data}
              height={artworkHeight}
              reducedMotion={reducedMotion}
              scrollY={scrollY}
            />

            <View
              style={{
                marginTop: -28,
                paddingTop: 21,
                paddingHorizontal: gutter,
                borderTopLeftRadius: 30,
                borderTopRightRadius: 30,
                backgroundColor: colors.background,
              }}
            >
              <View
                style={{
                  minHeight: 62,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: shape.card,
                  backgroundColor: colors.surface,
                }}
              >
                <View
                  style={{
                    width: 4,
                    height: 36,
                    borderRadius: 2,
                    backgroundColor: colors.cobalt,
                  }}
                />
                <View style={{ flex: 1, minWidth: 0, marginLeft: 11 }}>
                  <AppText variant="data" color={colors.cobalt} numberOfLines={1}>
                    {query.data.hero.positions.map((position) => `P${position}`).join(' · ')}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>
                    {t('heroDetail.liveProfile')}
                  </AppText>
                </View>
                <View
                  style={{
                    minHeight: 32,
                    paddingHorizontal: 10,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: alpha.ember16,
                  }}
                >
                  <AppText variant="data" color={colors.live} style={{ fontSize: 9 }}>
                    {t('heroDetail.patch', { patch: query.data.patch.name })}
                  </AppText>
                </View>
              </View>

              {query.data.isStale ? (
                <View
                  style={{
                    marginTop: 9,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: shape.control,
                    backgroundColor: alpha.ember16,
                  }}
                >
                  <AppText variant="caption" color={colors.live}>
                    {t('heroDetail.stale')}
                  </AppText>
                </View>
              ) : null}

              <SectionTitle
                eyebrow={t('heroDetail.rankWindow')}
                title={t('heroDetail.rankWinRates')}
              />
              <View
                style={{
                  padding: 8,
                  gap: 6,
                  borderRadius: shape.feature,
                  backgroundColor: colors.surfaceElevated,
                }}
              >
                {query.data.rankWinRates.map((rank) => (
                  <RankWinRateRow key={rank.rank} stat={rank} />
                ))}
              </View>

              <SectionTitle
                eyebrow={t('heroDetail.currentPatch', { patch: query.data.patch.name })}
                title={t('heroDetail.builds')}
              />
              {query.data.builds.length ? (
                <View style={{ gap: 10 }}>
                  {query.data.builds.map((build, index) => (
                    <BuildCard key={build.id} build={build} index={index} />
                  ))}
                </View>
              ) : (
                <View
                  style={{
                    minHeight: 128,
                    padding: 18,
                    borderRadius: shape.feature,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.surfaceElevated,
                  }}
                >
                  <Ionicons name="analytics-outline" size={28} color={colors.cobalt} />
                  <AppText variant="inscription" style={{ marginTop: 9, textAlign: 'center' }}>
                    {t(
                      query.data.availability.builds === 'unavailable'
                        ? 'heroDetail.buildsUnavailable'
                        : 'heroDetail.buildsCollecting',
                    )}
                  </AppText>
                  <AppText
                    variant="caption"
                    color={colors.textMuted}
                    style={{ marginTop: 5, textAlign: 'center' }}
                  >
                    {t('heroDetail.noFakeBuilds')}
                  </AppText>
                </View>
              )}

              <View
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: shape.control,
                  backgroundColor: colors.surface,
                }}
              >
                <AppText variant="data" color={colors.cobalt}>
                  {t('heroDetail.source')}
                </AppText>
                <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
                  {t('heroDetail.sourceBody', {
                    count: query.data.buildSampleSize,
                    patch: query.data.patch.name,
                  })}
                </AppText>
              </View>
            </View>
          </View>
        )}
      </Animated.ScrollView>
    </>
  );
}

function FallbackContainer({
  children,
  gutter,
  headerHeight,
}: {
  children: ReactNode;
  gutter: number;
  headerHeight: number;
}) {
  return (
    <View
      style={{
        width: '100%',
        maxWidth: layout.contentMaxWidth,
        alignSelf: 'center',
        paddingTop: headerHeight + 20,
        paddingHorizontal: gutter,
      }}
    >
      {children}
    </View>
  );
}

function HeroArtwork({
  detail,
  height,
  reducedMotion,
  scrollY,
}: {
  detail: HeroDetail;
  height: number;
  reducedMotion: boolean;
  scrollY: SharedValue<number>;
}) {
  const cropUrl = `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/crops/${detail.hero.slug}.png`;
  const artworkStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    return {
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [-height, 0, height],
            [-height * 0.5, 0, height * 0.48],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(scrollY.value, [-height, 0], [2, 1], Extrapolation.CLAMP),
        },
      ],
    };
  }, [height, reducedMotion]);

  return (
    <View style={{ height, overflow: 'hidden', backgroundColor: '#08090A' }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, artworkStyle]}>
        <Image
          source={{ uri: detail.hero.imageUrl }}
          contentFit="cover"
          cachePolicy="disk"
          blurRadius={18}
          enforceEarlyResizing
          recyclingKey={`hero-detail-background-${detail.hero.id}`}
          transition={reducedMotion ? 0 : 180}
          style={[StyleSheet.absoluteFill, { opacity: 0.58, transform: [{ scale: 1.1 }] }]}
        />
        <LinearGradient
          colors={['rgba(8,9,10,0.20)', 'rgba(8,9,10,0.54)']}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            position: 'absolute',
            width: '48%',
            height: '150%',
            right: '-8%',
            top: '-22%',
            backgroundColor: 'rgba(32, 73, 216, 0.30)',
            transform: [{ rotate: '13deg' }],
          }}
        />
        <Image
          source={{ uri: cropUrl }}
          contentFit="contain"
          contentPosition="bottom center"
          cachePolicy="disk"
          enforceEarlyResizing
          priority="high"
          recyclingKey={`hero-detail-artwork-${detail.hero.id}`}
          transition={reducedMotion ? 0 : 220}
          style={{
            position: 'absolute',
            left: '-10%',
            right: '-10%',
            top: 18,
            bottom: -14,
          }}
        />
      </Animated.View>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(8,9,10,0.54)', 'transparent', 'rgba(8,9,10,0.94)']}
        locations={[0, 0.46, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 18,
          right: 18,
          bottom: 50,
        }}
      >
        <AppText
          variant="display"
          color="#FFFFFF"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.66}
          maxFontSizeMultiplier={1.25}
          style={{ maxWidth: '86%', fontSize: 43, lineHeight: 45 }}
        >
          {detail.hero.name}
        </AppText>
      </View>
    </View>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={{ marginTop: 24, marginBottom: 9 }}>
      <AppText variant="data" color={colors.live}>
        {eyebrow}
      </AppText>
      <AppText variant="display" style={{ marginTop: 2, fontSize: 27, lineHeight: 30 }}>
        {title}
      </AppText>
    </View>
  );
}

function RankWinRateRow({ stat }: { stat: HeroRankWinRate }) {
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const percent = stat.winRate === null ? null : stat.winRate * 100;
  const fill = percent === null ? 0 : Math.max(0, Math.min(100, percent));

  return (
    <View
      style={{
        minHeight: 54,
        paddingHorizontal: 11,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: shape.control,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ width: 82 }}>
        <AppText variant="data" numberOfLines={1}>
          {t(`rank.${stat.rank}`)}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={{ fontSize: 10 }}>
          {t('heroDetail.games', { count: stat.games })}
        </AppText>
      </View>
      <View
        style={{
          flex: 1,
          height: 7,
          borderRadius: 4,
          backgroundColor: alpha.bone12,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${fill}%`,
            height: '100%',
            borderRadius: 4,
            backgroundColor: fill >= 50 ? colors.cobalt : colors.live,
          }}
        />
      </View>
      <AppText
        variant="inscription"
        color={percent === null ? colors.textMuted : colors.text}
        style={{ width: 58, textAlign: 'right', fontSize: 17 }}
      >
        {percent === null ? '—' : `${percent.toFixed(1)}%`}
      </AppText>
    </View>
  );
}

function BuildCard({ build, index }: { build: HeroBuildVariant; index: number }) {
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      style={{
        padding: 10,
        borderRadius: shape.feature,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <View
        style={{
          minHeight: 48,
          marginBottom: 10,
          paddingHorizontal: 10,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: shape.control,
          backgroundColor: index === 0 ? colors.cobalt : colors.ink,
        }}
      >
        <AppText variant="data" color={index === 0 ? '#FFFFFF' : colors.live}>
          {t('heroDetail.buildNumber', { number: String(index + 1).padStart(2, '0') })}
        </AppText>
        <View style={{ flex: 1 }} />
        <AppText variant="caption" color="#FFFFFF">
          {t('heroDetail.buildStats', {
            games: build.games,
            winRate: (build.winRate * 100).toFixed(1),
          })}
        </AppText>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 2 }}
      >
        {build.items.map((item, itemIndex) => (
          <View key={`${build.id}-${item.order}`} style={{ flexDirection: 'row' }}>
            <View style={{ width: 78, alignItems: 'center' }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  padding: 4,
                  borderRadius: 17,
                  backgroundColor: colors.surface,
                }}
              >
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    contentFit="contain"
                    cachePolicy="disk"
                    enforceEarlyResizing
                    transition={120}
                    style={{ width: '100%', height: '100%', borderRadius: 13 }}
                  />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: alpha.bone12,
                    }}
                  >
                    <Ionicons name="cube-outline" size={23} color={colors.textMuted} />
                  </View>
                )}
              </View>
              <AppText
                variant="caption"
                numberOfLines={2}
                style={{ marginTop: 6, minHeight: 30, textAlign: 'center', fontSize: 10 }}
              >
                {item.name}
              </AppText>
              <View
                style={{
                  marginTop: 4,
                  minHeight: 24,
                  paddingHorizontal: 7,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: itemIndex % 2 === 0 ? colors.live : colors.cobalt,
                }}
              >
                <AppText variant="data" color="#FFFFFF" style={{ fontSize: 8 }}>
                  ~{formatGameTime(item.medianPurchaseSec)}
                </AppText>
              </View>
              <AppText
                variant="data"
                color={colors.textMuted}
                style={{ marginTop: 3, fontSize: 7, textAlign: 'center' }}
              >
                {formatGameTime(item.p25PurchaseSec)}–{formatGameTime(item.p75PurchaseSec)}
              </AppText>
            </View>
            {itemIndex < build.items.length - 1 ? (
              <View
                style={{
                  width: 22,
                  height: 2,
                  marginTop: 29,
                  backgroundColor: colors.outline,
                }}
              />
            ) : null}
          </View>
        ))}
      </ScrollView>
      <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 8, fontSize: 10 }}>
        {t('heroDetail.timingRange')}
      </AppText>
    </View>
  );
}

function HeroDetailSkeleton({ artworkHeight, gutter }: { artworkHeight: number; gutter: number }) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        width: '100%',
        maxWidth: layout.contentMaxWidth,
        alignSelf: 'center',
      }}
    >
      <View style={{ height: artworkHeight, backgroundColor: colors.ink }} />
      <View
        style={{
          marginTop: -28,
          paddingTop: 21,
          paddingHorizontal: gutter,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          backgroundColor: colors.background,
          gap: 10,
        }}
      >
        <Skeleton height={62} />
        <Skeleton height={318} />
        <Skeleton height={244} />
      </View>
    </View>
  );
}

function formatGameTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function heroDetailStaleTime(detail: HeroDetail | undefined) {
  if (!detail || detail.isStale || detail.availability.builds === 'unavailable') {
    return 5 * 60 * 1000;
  }
  if (detail.availability.builds === 'collecting') {
    return 60 * 60 * 1000;
  }
  return 4 * 60 * 60 * 1000;
}
