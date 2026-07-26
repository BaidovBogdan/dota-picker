import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MessageState } from '@/components/feedback/states';
import {
  FLOATING_ACTION_BAR_BOTTOM_INSET,
  FloatingActionBar,
} from '@/components/layout/floating-action-bar';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { useDraftAccessGuard } from '@/hooks/use-draft-access';
import { localizeStoredText, useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import { useAppStore } from '@/store/app-store';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { Position, Recommendation } from '@/types/domain';

const recommendationLabelKey = (label: string) => {
  if (label === 'best' || label === 'Лучший ответ') return 'recommendation.label.best';
  if (label === 'reliable' || label === 'Надёжный выбор') return 'recommendation.label.reliable';
  if (label === 'fallback' || label === 'Запасной план') return 'recommendation.label.fallback';
  return 'result.bestPick';
};

export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useAppStore((state) => state.history.find((item) => item.id === id));
  const resetDraft = useAppStore((state) => state.resetDraft);
  const isRemoteBootstrapPending = useAppStore((state) => state.isRemoteBootstrapPending);
  const draftAccess = useDraftAccessGuard();
  const { colors } = useAppTheme();
  const { t, locale } = useTranslation();

  if (!result) {
    return (
      <>
        <Stack.Screen
          options={{
            ...nativeHeaderOptions(colors),
            title: t('result.title'),
            headerLargeTitleEnabled: false,
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
        <Screen nativeHeader>
          <MessageState
            title={t(isRemoteBootstrapPending ? 'result.syncing' : 'result.notFound')}
            message={t(isRemoteBootstrapPending ? 'result.syncing' : 'result.notFound')}
            icon={isRemoteBootstrapPending ? 'sync-outline' : 'compass-outline'}
            {...(isRemoteBootstrapPending
              ? {}
              : {
                  actionLabel: t('nav.draft'),
                  onAction: () => router.replace('/(tabs)' as const),
                })}
          />
        </Screen>
      </>
    );
  }

  const confidence = t(`result.${result.confidence}`);

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title: t('result.title'),
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => (
            <View
              style={{
                minHeight: 30,
                paddingHorizontal: 10,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.cobalt,
              }}
            >
              <AppText variant="data" color={colors.onPrimary} numberOfLines={1}>
                {localizeStoredText(result.patch, t)}
              </AppText>
            </View>
          ),
        }}
      />
      <Screen
        nativeHeader
        bottomInset={FLOATING_ACTION_BAR_BOTTOM_INSET}
        stickyHeader={
          <FloatingActionBar
            label={t('result.newDraft')}
            icon="refresh-outline"
            testID="result-new-draft"
            disabled={draftAccess.status === 'pending'}
            onPress={() =>
              draftAccess.requestAccess(() => {
                resetDraft();
                router.replace('/(tabs)');
              })
            }
          />
        }
      >
        {result.source === 'offline' ? (
          <View
            style={{
              padding: 13,
              backgroundColor: colors.cobalt,
              marginBottom: 12,
              borderRadius: shape.control,
              borderLeftWidth: 6,
              borderLeftColor: colors.live,
            }}
          >
            <AppText variant="data" color={colors.onPrimary}>
              {t('states.offlineTitle')}
            </AppText>
            <AppText variant="caption" color={colors.onPrimary} style={{ marginTop: 3 }}>
              {t('states.offlineBody')}
            </AppText>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          {result.recommendations.map((recommendation, index) => (
            <RecommendationCard
              key={recommendation.hero.id}
              item={recommendation}
              rank={index + 1}
              position={result.draft.position}
              rankBracket={result.draft.rank}
            />
          ))}
        </View>

        <View
          style={{
            minHeight: 58,
            marginTop: 12,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderTopWidth: 2,
            borderBottomWidth: 2,
            borderColor: colors.outline,
          }}
        >
          <AppText variant="data" color={colors.textMuted} style={{ flex: 1 }}>
            {t('result.confidence', { value: confidence })}
          </AppText>
          <AppText variant="data" color={colors.cobalt}>
            {new Date(result.dataUpdatedAt).toLocaleDateString(locale)}
          </AppText>
        </View>
      </Screen>
    </>
  );
}

function HeroArtwork({
  item,
  rank,
  featured,
}: {
  item: Recommendation;
  rank: number;
  featured: boolean;
}) {
  const { colors } = useAppTheme();
  const [failed, setFailed] = useState(false);
  const accent = rank === 1 ? colors.cobalt : rank === 2 ? colors.live : colors.text;
  const showImage = Boolean(item.hero.imageUrl && !failed);

  return (
    <View
      style={{
        height: featured ? 226 : 142,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: accent,
        borderBottomWidth: 2,
        borderBottomColor: colors.outline,
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: item.hero.imageUrl }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          contentPosition="center"
          transition={160}
          onError={() => setFailed(true)}
        />
      ) : (
        <AppText
          variant="display"
          color={colors.onPrimary}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.56}
          maxFontSizeMultiplier={1.2}
          style={{ paddingHorizontal: 20, textAlign: 'center' }}
        >
          {item.hero.name}
        </AppText>
      )}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          minWidth: 56,
          minHeight: 32,
          paddingHorizontal: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: rank === 1 ? colors.live : colors.text,
        }}
      >
        <AppText variant="data" color={rank === 1 ? colors.onPrimary : colors.background}>
          #{String(rank).padStart(2, '0')}
        </AppText>
      </View>
    </View>
  );
}

function RecommendationCard({
  item,
  rank,
  position,
  rankBracket,
}: {
  item: Recommendation;
  rank: number;
  position: Position | null;
  rankBracket: number | null;
}) {
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const featured = rank === 1;
  const accent = rank === 1 ? colors.cobalt : rank === 2 ? colors.live : colors.text;
  const positionLabel = position ? t(`position.${position}`) : t('position.title');
  const rankLabel = t(rankBracket ? `rank.${rankBracket}` : 'rank.any');
  const label = t(recommendationLabelKey(String(item.label)));

  return (
    <View
      style={{
        overflow: 'hidden',
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderRadius: shape.card,
        borderColor: colors.outline,
      }}
    >
      <View
        style={{
          minHeight: 42,
          flexDirection: 'row',
          alignItems: 'stretch',
          borderBottomWidth: 2,
          borderBottomColor: colors.outline,
        }}
      >
        <View
          style={{
            minWidth: 58,
            paddingHorizontal: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent,
          }}
        >
          <AppText variant="inscription" color={rank === 3 ? colors.background : colors.onPrimary}>
            {String(rank).padStart(2, '0')}
          </AppText>
        </View>
        <View
          style={{
            flex: 1,
            minWidth: 0,
            paddingHorizontal: 10,
            justifyContent: 'center',
          }}
        >
          <AppText variant="data" color={accent} numberOfLines={1}>
            {label}
          </AppText>
        </View>
        <View
          style={{
            minWidth: 76,
            paddingHorizontal: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.text,
          }}
        >
          <AppText variant="inscription" color={colors.background}>
            {Math.round(item.score)}
          </AppText>
        </View>
      </View>

      <HeroArtwork item={item} rank={rank} featured={featured} />

      <View style={{ padding: 14 }}>
        <AppText
          variant={featured ? 'display' : 'title'}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.62}
        >
          {item.hero.name}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 7, marginTop: 10 }}>
          <View
            style={{
              flex: 1,
              minHeight: 42,
              paddingHorizontal: 9,
              justifyContent: 'center',
              borderRadius: shape.compact,
              backgroundColor: alpha.primary16,
              borderLeftWidth: 4,
              borderLeftColor: colors.cobalt,
            }}
          >
            <AppText variant="data" color={colors.textMuted}>
              {t('position.title')}
            </AppText>
            <AppText variant="label" numberOfLines={1}>
              {positionLabel}
            </AppText>
          </View>
          <View
            style={{
              flex: 1,
              minHeight: 42,
              paddingHorizontal: 9,
              justifyContent: 'center',
              borderRadius: shape.compact,
              backgroundColor: alpha.ember16,
              borderLeftWidth: 4,
              borderLeftColor: colors.live,
            }}
          >
            <AppText variant="data" color={colors.textMuted}>
              {t('rank.title')}
            </AppText>
            <AppText variant="label" numberOfLines={1}>
              {rankLabel}
            </AppText>
          </View>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          borderTopWidth: 2,
          borderTopColor: colors.outline,
        }}
      >
        <View
          style={{
            flex: 1.5,
            minWidth: 0,
            padding: 12,
            borderRightWidth: 2,
            borderRightColor: colors.outline,
          }}
        >
          <AppText variant="data" color={colors.cobalt} style={{ marginBottom: 8 }}>
            {t('result.why')}
          </AppText>
          {item.reasons.slice(0, 2).map((reason) => (
            <View key={reason} style={{ flexDirection: 'row', gap: 7, marginBottom: 7 }}>
              <Ionicons
                name="checkmark-sharp"
                size={15}
                color={colors.cobalt}
                style={{ marginTop: 2 }}
              />
              <AppText variant="caption" style={{ flex: 1 }}>
                {localizeStoredText(reason, t)}
              </AppText>
            </View>
          ))}
        </View>
        <View style={{ flex: 1, minWidth: 0, padding: 12 }}>
          <AppText variant="data" color={colors.live} style={{ marginBottom: 8 }}>
            {t('result.risks')}
          </AppText>
          {item.risks.slice(0, 1).map((risk) => (
            <View key={risk} style={{ flexDirection: 'row', gap: 7 }}>
              <Ionicons name="alert-sharp" size={15} color={colors.live} style={{ marginTop: 2 }} />
              <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
                {localizeStoredText(risk, t)}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
