import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type Href, router, Stack } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { showNativeAlert } from '@/components/feedback/native-alert';
import { MessageState, Skeleton } from '@/components/feedback/states';
import { HeroPortrait } from '@/components/hero/hero-portrait';
import { AppText } from '@/components/ui/app-text';
import { useTranslation } from '@/i18n';
import { nativeLargeHeaderOptions } from '@/navigation/native-header';
import { deleteAccountReview, getAccountReviewsPage } from '@/services/api/reviews';
import { useAppStore } from '@/store/app-store';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { AnalysisReview, Hero } from '@/types/domain';

export default function ReviewsScreen() {
  const sessionUserId = useAppStore((state) => state.session?.userId);
  const history = useAppStore((state) => state.history);
  const heroCatalog = useAppStore((state) => state.heroes);
  const { colors } = useAppTheme();
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const reviewsQuery = useInfiniteQuery({
    queryKey: ['reviews', sessionUserId],
    queryFn: ({ pageParam }) =>
      getAccountReviewsPage({
        cursor: pageParam,
        limit: 25,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(sessionUserId),
  });
  const reviews = useMemo(
    () => reviewsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [reviewsQuery.data],
  );
  const heroesById = useMemo(() => {
    const entries = new Map<number, Hero>();
    heroCatalog.forEach((hero) => entries.set(hero.id, hero));
    history.forEach((result) => {
      result.recommendations.forEach(({ hero }) => entries.set(hero.id, hero));
    });
    return entries;
  }, [heroCatalog, history]);
  const resultsById = useMemo(
    () =>
      new Map(
        history.flatMap((result) => [
          [result.id, result] as const,
          ...(result.serverId ? ([[result.serverId, result]] as const) : []),
        ]),
      ),
    [history],
  );
  const deleteMutation = useMutation({
    mutationFn: deleteAccountReview,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reviews', sessionUserId] }),
        queryClient.invalidateQueries({ queryKey: ['reviews-summary', sessionUserId] }),
      ]);
    },
    onError: (error) => {
      showNativeAlert(
        t('review.loadError'),
        error instanceof Error ? error.message : t('review.loadErrorBody'),
        [{ text: t('common.confirm') }],
      );
    },
  });

  const openResult = useCallback(
    (analysisId: string) => {
      const result = resultsById.get(analysisId);
      if (!result) {
        showNativeAlert(t('review.unavailable'), t('review.resultUnavailable'), [
          { text: t('common.confirm') },
        ]);
        return;
      }
      router.push(`/result/${result.id}` as Href);
    },
    [resultsById, t],
  );

  const confirmDelete = useCallback(
    (review: AnalysisReview) => {
      showNativeAlert(t('review.deleteTitle'), t('review.deleteBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteMutation.mutate(review.id),
        },
      ]);
    },
    [deleteMutation, t],
  );

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeLargeHeaderOptions(colors),
          title: t('review.mine'),
          headerLargeTitleEnabled: true,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      {reviewsQuery.isPending ? (
        <View
          style={{
            flex: 1,
            paddingHorizontal: 12,
            paddingTop: 12,
            gap: 10,
            backgroundColor: colors.background,
          }}
        >
          <Skeleton height={156} />
          <Skeleton height={132} />
          <Skeleton height={148} />
        </View>
      ) : reviewsQuery.isError ? (
        <View style={{ flex: 1, paddingHorizontal: 12, backgroundColor: colors.background }}>
          <MessageState
            title={t('review.loadError')}
            message={t('review.loadErrorBody')}
            icon="cloud-offline-outline"
            actionLabel={t('common.retry')}
            onAction={() => void reviewsQuery.refetch()}
          />
        </View>
      ) : (
        <FlashList
          data={reviews}
          keyExtractor={(review) => review.id}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          refreshing={reviewsQuery.isRefetching && !reviewsQuery.isFetchingNextPage}
          onRefresh={() => void reviewsQuery.refetch()}
          onEndReached={() => {
            if (reviewsQuery.hasNextPage && !reviewsQuery.isFetchingNextPage) {
              void reviewsQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.35}
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: 12,
            paddingTop: 4,
            paddingBottom: 110,
          }}
          ListEmptyComponent={
            <MessageState
              title={t('review.empty')}
              message={t('review.emptyBody')}
              icon="star-outline"
            />
          }
          ListFooterComponent={
            reviewsQuery.isFetchingNextPage ? (
              <View style={{ minHeight: 64, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="small" color={colors.cobalt} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ReviewCard
              review={item}
              heroes={item.selectedHeroIds.flatMap((id) => {
                const hero =
                  item.analysis?.recommendations.find(
                    (recommendation) => recommendation.id === id,
                  ) ?? heroesById.get(id);
                return hero ? [hero] : [];
              })}
              locale={locale}
              deleting={deleteMutation.isPending && deleteMutation.variables === item.id}
              onOpen={() => openResult(item.analysisId)}
              onDelete={() => confirmDelete(item)}
            />
          )}
        />
      )}
    </>
  );
}

function ReviewCard({
  review,
  heroes,
  locale,
  deleting,
  onOpen,
  onDelete,
}: {
  review: AnalysisReview;
  heroes: Hero[];
  locale: 'ru-RU' | 'en-US';
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const date = new Date(review.updatedAt).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <View
      style={{
        marginBottom: 10,
        overflow: 'hidden',
        borderRadius: shape.card,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
        opacity: deleting ? 0.5 : 1,
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t('review.openResult')}. ${t('review.ratingValue', { rating: review.rating })}`}
        disabled={deleting}
        onPress={onOpen}
        style={{ flexDirection: 'row', minHeight: 76 }}
      >
        <View
          style={{
            width: 72,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: review.rating >= 4 ? colors.cobalt : alpha.ember16,
            borderRightWidth: 2,
            borderRightColor: colors.outline,
          }}
        >
          <AppText
            variant="display"
            color={review.rating >= 4 ? colors.onPrimary : colors.live}
            style={{ fontSize: 34, lineHeight: 37 }}
          >
            {String(review.rating).padStart(2, '0')}
          </AppText>
          <AppText variant="data" color={review.rating >= 4 ? colors.onPrimary : colors.live}>
            / 05
          </AppText>
        </View>
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 13, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Ionicons
                key={value}
                name={value <= review.rating ? 'star' : 'star-outline'}
                size={16}
                color={value <= review.rating ? colors.live : colors.textMuted}
              />
            ))}
          </View>
          <AppText
            variant="data"
            color={colors.textMuted}
            numberOfLines={1}
            style={{ marginTop: 7 }}
          >
            {date}
          </AppText>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors.cobalt}
          style={{ alignSelf: 'center', marginRight: 12 }}
        />
      </Pressable>

      {heroes.length || review.comment ? (
        <View
          style={{
            paddingHorizontal: 13,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.outline,
          }}
        >
          {heroes.length ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {heroes.map((hero) => (
                <HeroPortrait
                  key={hero.id}
                  hero={hero}
                  size={42}
                  showName={false}
                  transitionMs={0}
                />
              ))}
            </View>
          ) : null}
          {review.comment ? (
            <AppText
              variant="body"
              color={colors.textMuted}
              numberOfLines={4}
              style={{ marginTop: heroes.length ? 10 : 0 }}
            >
              {review.comment}
            </AppText>
          ) : null}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.delete')}
        disabled={deleting}
        onPress={onDelete}
        style={{
          minHeight: 46,
          paddingHorizontal: 13,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: colors.outline,
        }}
      >
        {deleting ? (
          <ActivityIndicator size="small" color={colors.live} />
        ) : (
          <Ionicons name="trash-outline" size={18} color={colors.live} />
        )}
        <AppText variant="label" color={colors.live}>
          {t('common.delete')}
        </AppText>
      </Pressable>
    </View>
  );
}
