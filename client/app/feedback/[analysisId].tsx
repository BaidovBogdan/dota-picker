import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { MessageState, Skeleton } from '@/components/feedback/states';
import { FloatingActionBar } from '@/components/layout/floating-action-bar';
import { Screen } from '@/components/layout/screen';
import { HeroPortrait } from '@/components/hero/hero-portrait';
import { AppText } from '@/components/ui/app-text';
import { showNativeAlert } from '@/components/feedback/native-alert';
import { useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import { getAnalysisReview, upsertAnalysisReview } from '@/services/api/reviews';
import { useAppStore } from '@/store/app-store';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { AnalysisReview, Recommendation } from '@/types/domain';

const COMMENT_LIMIT = 500;

export default function FeedbackScreen() {
  const { analysisId } = useLocalSearchParams<{ analysisId: string }>();
  const sessionUserId = useAppStore((state) => state.session?.userId);
  const result = useAppStore((state) =>
    state.history.find((item) => item.id === analysisId || item.serverId === analysisId),
  );
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const reviewsQuery = useQuery({
    queryKey: ['review', sessionUserId, analysisId],
    queryFn: () => getAnalysisReview(analysisId),
    enabled: Boolean(sessionUserId),
  });
  const existingReview = reviewsQuery.data ?? undefined;

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title: t(existingReview ? 'review.edit' : 'review.title'),
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      {!result ? (
        <Screen nativeHeader>
          <MessageState
            title={t('result.notFound')}
            message={t('review.resultUnavailable')}
            icon="compass-outline"
            actionLabel={t('common.back')}
            onAction={() => router.back()}
          />
        </Screen>
      ) : reviewsQuery.isPending ? (
        <Screen nativeHeader>
          <View style={{ gap: 12, paddingTop: 10 }}>
            <Skeleton height={172} />
            <Skeleton height={116} />
            <Skeleton height={142} />
          </View>
        </Screen>
      ) : (
        <FeedbackEditor
          key={existingReview?.id ?? analysisId}
          analysisId={analysisId}
          recommendations={result.recommendations}
          reviewsUnavailable={reviewsQuery.isError}
          {...(existingReview ? { initialReview: existingReview } : {})}
        />
      )}
    </>
  );
}

function FeedbackEditor({
  analysisId,
  recommendations,
  initialReview,
  reviewsUnavailable,
}: {
  analysisId: string;
  recommendations: Recommendation[];
  initialReview?: AnalysisReview;
  reviewsUnavailable: boolean;
}) {
  const sessionUserId = useAppStore((state) => state.session?.userId);
  const [rating, setRating] = useState(initialReview?.rating ?? 0);
  const [selectedHeroIds, setSelectedHeroIds] = useState<number[]>(
    initialReview?.selectedHeroIds ?? [],
  );
  const [comment, setComment] = useState(initialReview?.comment ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const editorScrollRef = useRef<ScrollView>(null);
  const commentFocusedRef = useRef(false);
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const selectedSet = useMemo(() => new Set(selectedHeroIds), [selectedHeroIds]);
  const horizontalGutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const mutation = useMutation({
    mutationFn: () =>
      upsertAnalysisReview(analysisId, {
        rating,
        selectedHeroIds,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    onSuccess: (review) => {
      queryClient.setQueryData<AnalysisReview | null>(
        ['review', sessionUserId, analysisId],
        review,
      );
      void queryClient.invalidateQueries({ queryKey: ['reviews', sessionUserId] });
      void queryClient.invalidateQueries({ queryKey: ['reviews-summary', sessionUserId] });
      showNativeAlert(t('review.saved'), t('review.savedBody'), [
        { text: t('common.done'), onPress: () => router.back() },
      ]);
    },
  });
  const pending = mutation.isPending;

  usePreventRemove(pending, () => undefined);

  useEffect(() => {
    const keyboardSubscription = Keyboard.addListener('keyboardDidShow', () => {
      if (commentFocusedRef.current) {
        editorScrollRef.current?.scrollToEnd({ animated: true });
      }
    });

    return () => keyboardSubscription.remove();
  }, []);

  const submit = () => {
    if (rating < 1) {
      setValidationError(t('review.ratingRequired'));
      return;
    }
    setValidationError(null);
    mutation.mutate();
  };

  const toggleHero = (heroId: number) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedHeroIds((current) =>
      current.includes(heroId) ? current.filter((id) => id !== heroId) : [...current, heroId],
    );
  };

  const revealCommentInput = () => {
    commentFocusedRef.current = true;
    requestAnimationFrame(() => {
      editorScrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  return (
    <>
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="bottom">
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Button
            accessibilityLabel={t('review.save')}
            disabled={pending}
            variant="prominent"
            onPress={submit}
          >
            {pending ? t('common.loading') : t('review.save')}
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Spacer />
        </Stack.Toolbar>
      ) : null}
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {Platform.OS === 'ios' ? null : (
          <FloatingActionBar
            label={t('review.save')}
            icon="send-outline"
            loading={pending}
            onPress={submit}
          />
        )}
        <ScrollView
          ref={editorScrollRef}
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: horizontalGutter,
            paddingTop: 10,
            paddingBottom: Platform.OS === 'ios' ? 104 : 152,
          }}
        >
          <View
            style={{
              padding: 18,
              borderRadius: shape.feature,
              borderWidth: 1,
              borderColor: alpha.bone12,
              backgroundColor: colors.surface,
            }}
          >
            <AppText variant="title">{t('review.ratingTitle')}</AppText>
            <View
              accessibilityRole="radiogroup"
              style={{
                marginTop: 18,
                flexDirection: 'row',
                padding: 5,
                borderRadius: shape.round,
                borderWidth: 1,
                borderColor: alpha.bone12,
                backgroundColor: alpha.bone04,
              }}
            >
              {[1, 2, 3, 4, 5].map((value) => {
                const selected = value <= rating;
                const current = value === rating;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={t('review.ratingA11y', { rating: value })}
                    accessibilityState={{ selected: current }}
                    disabled={pending}
                    hitSlop={3}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setRating(value);
                      setValidationError(null);
                    }}
                    style={{
                      flex: 1,
                      minWidth: 44,
                      height: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: shape.round,
                      backgroundColor: current ? colors.cobalt : colors.transparent,
                    }}
                  >
                    <Ionicons
                      name={selected ? 'star' : 'star-outline'}
                      size={current ? 27 : 25}
                      color={
                        current ? colors.onPrimary : selected ? colors.cobalt : colors.textMuted
                      }
                    />
                  </Pressable>
                );
              })}
            </View>
            <View
              style={{
                marginTop: 13,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
                {t('review.ratingHint')}
              </AppText>
              <AppText variant="data" color={rating ? colors.cobalt : colors.textMuted}>
                {rating ? t('review.ratingValue', { rating }) : '—/5'}
              </AppText>
            </View>
            {validationError ? (
              <AppText
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                variant="caption"
                color={colors.live}
                style={{ marginTop: 10 }}
              >
                {validationError}
              </AppText>
            ) : null}
          </View>

          <View style={{ marginTop: 24 }}>
            <AppText variant="inscription">{t('review.heroesTitle')}</AppText>
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
              {t('review.heroesHint')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: 9, marginTop: 12 }}>
              {recommendations.map(({ hero }) => {
                const selected = selectedSet.has(hero.id);
                return (
                  <Pressable
                    key={hero.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={t('review.heroA11y', {
                      name: hero.name,
                      state: t(selected ? 'review.selected' : 'review.notSelected'),
                    })}
                    accessibilityState={{ checked: selected }}
                    disabled={pending}
                    onPress={() => toggleHero(hero.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 118,
                      paddingHorizontal: 6,
                      paddingVertical: 11,
                      alignItems: 'center',
                      borderRadius: shape.control,
                      backgroundColor: selected ? alpha.ember16 : colors.surface,
                      borderWidth: 2,
                      borderColor: selected ? colors.live : colors.outline,
                    }}
                  >
                    <HeroPortrait hero={hero} size={58} showName={false} transitionMs={0} />
                    <AppText
                      variant="label"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.68}
                      color={selected ? colors.live : colors.text}
                      style={{ marginTop: 8, width: '100%', textAlign: 'center' }}
                    >
                      {hero.name}
                    </AppText>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={colors.live}
                        style={{ position: 'absolute', top: 5, right: 5 }}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ marginTop: 24 }}>
            <View
              style={{
                marginBottom: 7,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <AppText variant="inscription">{t('review.comment')}</AppText>
              <AppText variant="data" color={colors.textMuted}>
                {t('review.commentCounter', {
                  current: comment.length,
                  maximum: COMMENT_LIMIT,
                })}
              </AppText>
            </View>
            <TextInput
              accessibilityLabel={t('review.comment')}
              editable={!pending}
              multiline
              maxLength={COMMENT_LIMIT}
              numberOfLines={5}
              placeholder={t('review.commentPlaceholder')}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.cobalt}
              textAlignVertical="top"
              value={comment}
              onBlur={() => {
                commentFocusedRef.current = false;
              }}
              onChangeText={setComment}
              onFocus={revealCommentInput}
              style={{
                minHeight: 142,
                paddingHorizontal: 14,
                paddingVertical: 13,
                borderRadius: shape.control,
                borderWidth: 2,
                borderColor: colors.outline,
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
                fontFamily: 'IBMPlexSans_500Medium',
                fontSize: 15,
                lineHeight: 21,
                opacity: pending ? 0.5 : 1,
              }}
            />
          </View>

          {reviewsUnavailable ? (
            <View
              accessibilityRole="alert"
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: shape.compact,
                backgroundColor: alpha.ember16,
                borderLeftWidth: 4,
                borderLeftColor: colors.live,
              }}
            >
              <AppText variant="caption" color={colors.live}>
                {t('review.loadErrorBody')}
              </AppText>
            </View>
          ) : null}
          {mutation.isError ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: shape.compact,
                backgroundColor: alpha.ember16,
                borderLeftWidth: 4,
                borderLeftColor: colors.live,
              }}
            >
              <AppText variant="label" color={colors.live}>
                {t('review.saveError')}
              </AppText>
              <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 3 }}>
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : t('review.loadErrorBody')}
              </AppText>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}
