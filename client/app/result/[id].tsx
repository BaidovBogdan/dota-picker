import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { type Href, router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { MessageState } from '@/components/feedback/states';
import { showNativeAlert } from '@/components/feedback/native-alert';
import {
  FLOATING_ACTION_BAR_BOTTOM_INSET,
  FloatingActionBar,
} from '@/components/layout/floating-action-bar';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { heroById } from '@/data/heroes';
import { useDraftAccessGuard } from '@/hooks/use-draft-access';
import { localizeStoredText, useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import { getAnalysisReview } from '@/services/api/reviews';
import { useAppStore } from '@/store/app-store';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { AnalysisResult, Recommendation, RecommendationPairEvidence } from '@/types/domain';

const recommendationLabelKey = (label: string) => {
  if (label === 'best' || label === 'Лучший ответ') return 'recommendation.label.best';
  if (label === 'reliable' || label === 'Надёжный выбор') return 'recommendation.label.reliable';
  if (label === 'fallback' || label === 'Запасной план') return 'recommendation.label.fallback';
  return 'result.bestPick';
};

export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useAppStore((state) => state.history.find((item) => item.id === id));
  const sessionUserId = useAppStore((state) => state.session?.userId);
  const resetDraft = useAppStore((state) => state.resetDraft);
  const isRemoteBootstrapPending = useAppStore((state) => state.isRemoteBootstrapPending);
  const draftAccess = useDraftAccessGuard();
  const { colors } = useAppTheme();
  const { t, locale } = useTranslation();
  const analysisId = result?.serverId ?? result?.id ?? id;
  const reviewQuery = useQuery({
    queryKey: ['review', sessionUserId, analysisId],
    queryFn: () => getAnalysisReview(analysisId),
    enabled: Boolean(sessionUserId && result?.source === 'server'),
  });
  const showFeedbackAction =
    result?.source === 'server' && !reviewQuery.isPending && reviewQuery.data == null;

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

  const startNewDraft = () => {
    draftAccess.requestAccess(() => {
      resetDraft();
      router.replace('/(tabs)');
    });
  };
  const openFeedback = () => {
    if (result.source !== 'server') {
      showNativeAlert(t('review.unavailable'), t('review.offlineUnavailable'), [
        { text: t('common.confirm') },
      ]);
      return;
    }
    router.push(`/feedback/${analysisId}` as Href);
  };

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
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="bottom">
          <Stack.Toolbar.Spacer width={44} />
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Button
            accessibilityLabel={t('result.newDraft')}
            disabled={draftAccess.status === 'pending'}
            variant="prominent"
            onPress={startNewDraft}
          >
            {t('result.newDraft')}
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Spacer />
          {showFeedbackAction ? (
            <Stack.Toolbar.Button
              accessibilityLabel={t('review.leave')}
              icon="star"
              onPress={openFeedback}
            />
          ) : (
            <Stack.Toolbar.Spacer width={44} />
          )}
        </Stack.Toolbar>
      ) : null}
      <Screen
        nativeHeader
        bottomInset={Platform.OS === 'ios' ? 24 : FLOATING_ACTION_BAR_BOTTOM_INSET}
        stickyHeader={
          Platform.OS === 'ios' ? null : (
            <FloatingActionBar
              label={t('result.newDraft')}
              icon="refresh-outline"
              testID="result-new-draft"
              disabled={draftAccess.status === 'pending'}
              onPress={startNewDraft}
              {...(showFeedbackAction
                ? {
                    secondaryAction: {
                      label: t('review.leave'),
                      icon: 'star-outline' as const,
                      iconOnly: true,
                      onPress: openFeedback,
                    },
                  }
                : {})}
            />
          )
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

        <ResultSummary result={result} />

        <View style={{ gap: 10 }}>
          {result.recommendations.map((recommendation, index) => (
            <RecommendationCard
              key={recommendation.hero.id}
              item={recommendation}
              rank={index + 1}
              rankBracket={result.draft.rank}
              {...(index === 0 ? { fallbackConfidence: result.confidence } : {})}
            />
          ))}
        </View>

        <MethodologyPanel result={result} locale={locale} />
      </Screen>
    </>
  );
}

type Translator = (key: string, params?: Record<string, string | number>) => string;

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const formatNumber = (value: number) => `${Math.round(value * 10) / 10}`;

const formatPoints = (value: number) => {
  const rounded = formatNumber(value);
  return `${value > 0 ? '+' : ''}${rounded}`;
};

const formatPercentagePointDelta = (value: number) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}`;

function ResultSummary({ result }: { result: AnalysisResult }) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const position = result.draft.position
    ? `P${result.draft.position} · ${t(`position.${result.draft.position}`)}`
    : t('position.title');
  const rank = t(result.draft.rank ? `rank.${result.draft.rank}` : 'rank.any');
  const source = t(result.draft.source === 'photo' ? 'draft.photo' : 'home.manualEntry');

  return (
    <View
      style={{
        marginBottom: 10,
        overflow: 'hidden',
        borderWidth: 2,
        borderRadius: shape.card,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
      }}
    >
      <View
        style={{
          minHeight: 42,
          paddingHorizontal: 11,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          backgroundColor: colors.text,
        }}
      >
        <AppText variant="data" color={colors.background} numberOfLines={1} style={{ flex: 1 }}>
          {t('result.input')} · {source}
        </AppText>
        <AppText variant="data" color={colors.live} numberOfLines={1}>
          {t('result.patch', { patch: result.patch })}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <SummaryCell label={t('position.title')} value={position} accent={colors.cobalt} />
        <SummaryCell label={t('rank.title')} value={rank} accent={colors.live} />
        <SummaryCell
          label={t('draft.enemies')}
          value={String(result.draft.enemies.length)}
          accent={colors.live}
        />
        <SummaryCell
          label={t('draft.allies')}
          value={String(result.draft.allies.length)}
          accent={colors.cobalt}
        />
      </View>
    </View>
  );
}

function SummaryCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        width: '50%',
        minHeight: 56,
        paddingHorizontal: 10,
        paddingVertical: 8,
        justifyContent: 'center',
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderColor: colors.outline,
        borderLeftWidth: 4,
        borderLeftColor: accent,
      }}
    >
      <AppText variant="data" color={colors.textMuted} numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="label" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

function HeroThumbnail({
  item,
  featured,
  onPress,
}: {
  item: Recommendation;
  featured: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(item.hero.imageUrl && !failed);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={item.hero.name}
      onPress={onPress}
      style={{
        width: featured ? 136 : 108,
        minHeight: featured ? 126 : 98,
        flexShrink: 0,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.cobalt,
        borderRightWidth: 2,
        borderRightColor: colors.outline,
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: item.hero.imageUrl }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          contentPosition="center"
          cachePolicy="disk"
          enforceEarlyResizing
          recyclingKey={String(item.hero.id)}
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
          style={{ paddingHorizontal: 10, textAlign: 'center' }}
        >
          {item.hero.name}
        </AppText>
      )}
    </Pressable>
  );
}

function ScoreSignals({ item }: { item: Recommendation }) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const signals = item.scoreBreakdown
    ? [
        { label: t('result.metric.matchup'), value: formatPoints(item.scoreBreakdown.matchup) },
        { label: t('result.metric.role'), value: formatPoints(item.scoreBreakdown.role) },
        { label: t('result.metric.meta'), value: formatPoints(item.scoreBreakdown.meta) },
        { label: t('result.metric.team'), value: formatPoints(item.scoreBreakdown.teamFit) },
      ]
    : item.metrics
      ? [
          { label: t('result.metric.matchup'), value: formatPercent(item.metrics.counter) },
          { label: t('result.metric.role'), value: formatPercent(item.metrics.roleFit) },
          { label: t('result.metric.meta'), value: formatPercent(item.metrics.meta) },
          { label: t('result.metric.team'), value: formatPercent(item.metrics.synergy) },
        ]
      : [];
  if (!signals.length) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        borderTopWidth: 2,
        borderColor: colors.outline,
      }}
    >
      {signals.map((signal, index) => (
        <View
          key={signal.label}
          style={{
            width: '50%',
            minHeight: 58,
            paddingHorizontal: 11,
            paddingVertical: 8,
            justifyContent: 'center',
            backgroundColor: index === 0 ? colors.cobalt : colors.surface,
            borderRightWidth: index % 2 === 0 ? 1 : 0,
            borderBottomWidth: index < 2 ? 1 : 0,
            borderColor: colors.outline,
          }}
        >
          <AppText
            variant="data"
            color={index === 0 ? colors.onPrimary : colors.textMuted}
            numberOfLines={1}
          >
            {signal.label}
          </AppText>
          <AppText
            variant="inscription"
            color={index === 0 ? colors.onPrimary : colors.text}
            numberOfLines={1}
          >
            {signal.value}
          </AppText>
        </View>
      ))}
      {item.scoreBreakdown ? (
        <View
          style={{
            width: '100%',
            paddingHorizontal: 11,
            paddingVertical: 8,
            borderTopWidth: 1,
            borderColor: colors.outline,
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <AppText variant="data" color={colors.textMuted}>
            {t('result.metric.accounting', {
              reliability: formatPoints(item.scoreBreakdown.reliability),
              diversity: formatPoints(item.scoreBreakdown.diversity),
              advisor: formatPoints(item.scoreBreakdown.advisor),
              total: formatNumber(item.scoreBreakdown.total),
            })}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const evidenceSourceLabel = (source: string, t: Translator) => {
  if (source === 'opendota_current_patch_rank_pairs') return t('result.source.patchRank');
  if (source === 'opendota_current_patch_all_ranks_pairs')
    return t('result.source.currentPatchAllRanks');
  if (source === 'team_composition_only') return t('result.source.teamComposition');
  if (source === 'opendota_current_patch_30d_position') return t('result.source.currentPatch');
  if (source === 'opendota_rank_hero_stats') return t('result.source.rank');
  if (source === 'opendota_rolling_all_ranks' || source === 'opendota_public_hero_stats')
    return t('result.source.allRanks');
  return t('result.source.openDota');
};

function PairEvidenceRows({
  items,
  title,
  rankBracket,
}: {
  items: RecommendationPairEvidence[] | undefined;
  title: string;
  rankBracket: number | null;
}) {
  const heroes = useAppStore((state) => state.heroes);
  const { colors } = useAppTheme();
  const { t, locale } = useTranslation();
  const heroNamesById = useMemo(
    () => new Map(heroes.map((hero) => [hero.id, hero.name])),
    [heroes],
  );
  if (!items?.length) return null;

  return (
    <View style={{ borderTopWidth: 1, borderColor: colors.outline }}>
      <AppText
        variant="data"
        color={colors.textMuted}
        style={{ paddingHorizontal: 12, paddingTop: 10 }}
      >
        {title}
      </AppText>
      {items.map((pair) => {
        const heroName =
          heroNamesById.get(pair.heroId) ?? heroById.get(pair.heroId)?.name ?? `#${pair.heroId}`;
        return (
          <View
            key={pair.heroId}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderTopWidth: 1,
              borderColor: colors.outline,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
                {heroName}
              </AppText>
              <AppText variant="data" color={pair.advantage >= 0 ? colors.cobalt : colors.live}>
                {t('result.evidence.advantage', {
                  delta: formatPercentagePointDelta(pair.advantage),
                })}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 3 }}>
              {t('result.evidence.pairRate', {
                winRate: formatPercent(pair.winRate),
                expected: formatPercent(pair.expectedWinRate),
              })}
            </AppText>
            <AppText variant="data" color={colors.textMuted} style={{ marginTop: 4 }}>
              {rankBracket
                ? t('result.evidence.rankPatchSample', {
                    rank: pair.rankGames.toLocaleString(locale),
                    patch: pair.patchGames.toLocaleString(locale),
                  })
                : t('result.evidence.patchSample', {
                    patch: pair.patchGames.toLocaleString(locale),
                  })}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

function EvidencePanel({
  item,
  rankBracket,
}: {
  item: Recommendation;
  rankBracket: number | null;
}) {
  const evidence = item.evidence;
  const { colors, alpha } = useAppTheme();
  const { t, locale } = useTranslation();
  if (!evidence) return null;

  const matchup = evidence.matchups;
  const synergy = evidence.synergy;
  const meta = evidence.meta;
  const matchupValue =
    matchup.weightedWinRate === null
      ? t('result.evidence.noWinRate')
      : t('result.evidence.matchupValue', {
          winRate: formatPercent(matchup.weightedWinRate),
          delta: formatPercentagePointDelta(matchup.weightedWinRate - matchup.expectedWinRate),
        });
  const synergyValue =
    synergy?.weightedWinRate !== null &&
    synergy?.weightedWinRate !== undefined &&
    synergy.expectedWinRate !== null
      ? t('result.evidence.matchupValue', {
          winRate: formatPercent(synergy.weightedWinRate),
          delta: formatPercentagePointDelta(synergy.weightedWinRate - synergy.expectedWinRate),
        })
      : synergy
        ? t('result.evidence.compositionOnly', {
            score: formatPercent(synergy.compositionScore),
          })
        : null;
  const matchupRankFallback = Boolean(
    rankBracket &&
    (matchup.rankScoped === false ||
      (typeof matchup.rankOpponentsCovered === 'number' &&
        matchup.rankOpponentsCovered < matchup.opponentsCovered)),
  );
  const synergyRankFallback = Boolean(
    rankBracket &&
    synergy &&
    synergy.availability === 'ready' &&
    synergy.rankAlliesCovered < synergy.alliesCovered,
  );
  const matchupMinimumSample =
    rankBracket && matchup.rankScoped
      ? matchup.minimumGames
      : (matchup.minimumPatchGames ?? matchup.minimumGames);
  const caveats = Array.from(
    new Set([
      ...(matchup.availability === 'unavailable' ? ['result.caveat.matchupUnavailable'] : []),
      ...(matchup.opponentsCovered < matchup.opponentsTotal ? ['result.caveat.coverage'] : []),
      ...(matchup.availability !== 'unavailable' && matchupMinimumSample < 80
        ? ['result.caveat.sample']
        : []),
      ...(matchupRankFallback ? ['result.caveat.matchupRankFallback'] : []),
      ...(matchup.isStale ? ['result.caveat.matchupStale'] : []),
      ...(synergy && synergy.alliesCovered < synergy.alliesTotal
        ? ['result.caveat.synergyCoverage']
        : []),
      ...(synergy && synergy.alliesTotal > 0 && synergy.availability === 'unavailable'
        ? ['result.caveat.synergyUnavailable']
        : []),
      ...(synergyRankFallback ? ['result.caveat.synergyRankFallback'] : []),
      ...(synergy &&
      synergy.availability === 'ready' &&
      synergy.alliesTotal > 0 &&
      synergy.minimumGames < 80
        ? ['result.caveat.synergySample']
        : []),
      ...(synergy && synergy.alliesTotal > 0 && synergy.isStale
        ? ['result.caveat.synergyStale']
        : []),
      ...(rankBracket && !meta.rankScoped ? ['result.caveat.metaRankScope'] : []),
      ...(meta.positionApproximate ? ['result.caveat.approximatePosition'] : []),
      ...(meta.isStale ? ['result.caveat.stale'] : []),
    ]),
  );

  return (
    <View style={{ borderTopWidth: 2, borderColor: colors.outline }}>
      <View style={{ padding: 12, backgroundColor: alpha.primary16 }}>
        <AppText variant="data" color={colors.cobalt}>
          {t('result.evidence.matchup')}
        </AppText>
        <AppText variant="inscription" style={{ marginTop: 3 }}>
          {matchupValue}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
          {t('result.evidence.sample', {
            games: matchup.games.toLocaleString(locale),
            covered: matchup.opponentsCovered,
            total: matchup.opponentsTotal,
          })}
        </AppText>
        {typeof matchup.patchGames === 'number' ? (
          <AppText variant="data" color={colors.textMuted} style={{ marginTop: 4 }}>
            {rankBracket && typeof matchup.rankGames === 'number'
              ? t('result.evidence.rankPatchSample', {
                  rank: matchup.rankGames.toLocaleString(locale),
                  patch: matchup.patchGames.toLocaleString(locale),
                })
              : t('result.evidence.patchSample', {
                  patch: matchup.patchGames.toLocaleString(locale),
                })}
          </AppText>
        ) : null}
        <AppText variant="data" color={colors.textMuted} style={{ marginTop: 7 }}>
          {evidenceSourceLabel(matchup.source, t)}
        </AppText>
      </View>
      <PairEvidenceRows
        items={matchup.byOpponent}
        title={t('result.evidence.byOpponent')}
        rankBracket={rankBracket}
      />

      {synergy && synergy.alliesTotal > 0 ? (
        <>
          <View
            style={{
              padding: 12,
              backgroundColor: colors.surfaceElevated,
              borderTopWidth: 1,
              borderColor: colors.outline,
            }}
          >
            <AppText variant="data" color={colors.cobalt}>
              {t('result.evidence.synergy')}
            </AppText>
            <AppText variant="inscription" style={{ marginTop: 3 }}>
              {synergyValue}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
              {t('result.evidence.synergyScores', {
                pairs: formatPercent(synergy.pairScore),
                composition: formatPercent(synergy.compositionScore),
                reliability: formatPercent(synergy.reliability),
              })}
            </AppText>
            <AppText variant="data" color={colors.textMuted} style={{ marginTop: 4 }}>
              {rankBracket
                ? t('result.evidence.synergySample', {
                    rank: synergy.rankGames.toLocaleString(locale),
                    patch: synergy.patchGames.toLocaleString(locale),
                    covered: synergy.alliesCovered,
                    total: synergy.alliesTotal,
                  })
                : t('result.evidence.synergyPatchSample', {
                    patch: synergy.patchGames.toLocaleString(locale),
                    covered: synergy.alliesCovered,
                    total: synergy.alliesTotal,
                  })}
            </AppText>
            <AppText variant="data" color={colors.textMuted} style={{ marginTop: 7 }}>
              {evidenceSourceLabel(synergy.source, t)}
            </AppText>
          </View>
          <PairEvidenceRows
            items={synergy.byAlly}
            title={t('result.evidence.byAlly')}
            rankBracket={rankBracket}
          />
        </>
      ) : null}

      <View
        style={{
          padding: 12,
          backgroundColor: alpha.ember16,
          borderTopWidth: 1,
          borderColor: colors.outline,
        }}
      >
        <AppText variant="data" color={colors.live}>
          {t('result.evidence.meta')}
        </AppText>
        <AppText variant="inscription" style={{ marginTop: 3 }}>
          {t('result.evidence.metaValue', {
            winRate: formatPercent(meta.winRate),
            games: meta.games.toLocaleString(locale),
          })}
        </AppText>
        <AppText variant="data" color={colors.textMuted} style={{ marginTop: 7 }}>
          {evidenceSourceLabel(meta.source, t)}
        </AppText>
      </View>
      {caveats.length ? (
        <View style={{ padding: 12, borderTopWidth: 1, borderColor: colors.outline }}>
          <AppText variant="data" color={colors.live} style={{ marginBottom: 7 }}>
            {t('result.caveats')}
          </AppText>
          {caveats.map((key) => (
            <View key={key} style={{ flexDirection: 'row', gap: 7, marginTop: 4 }}>
              <Ionicons name="alert-sharp" size={15} color={colors.live} style={{ marginTop: 2 }} />
              <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
                {t(key)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ReasonsPanel({ item }: { item: Recommendation }) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const legacyRisks = item.evidence ? [] : item.risks;
  if (!item.reasons.length && !legacyRisks.length) return null;

  return (
    <View style={{ padding: 12, borderTopWidth: 2, borderColor: colors.outline }}>
      {item.reasons.length ? (
        <>
          <AppText variant="data" color={colors.cobalt} style={{ marginBottom: 7 }}>
            {t('result.why')}
          </AppText>
          {item.reasons.slice(0, 4).map((reason) => (
            <View key={reason} style={{ flexDirection: 'row', gap: 7, marginTop: 4 }}>
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
        </>
      ) : null}
      {legacyRisks.length ? (
        <View style={{ marginTop: item.reasons.length ? 12 : 0 }}>
          <AppText variant="data" color={colors.live} style={{ marginBottom: 7 }}>
            {t('result.risks')}
          </AppText>
          {legacyRisks.slice(0, 2).map((risk) => (
            <View key={risk} style={{ flexDirection: 'row', gap: 7, marginTop: 4 }}>
              <Ionicons name="alert-sharp" size={15} color={colors.live} style={{ marginTop: 2 }} />
              <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
                {localizeStoredText(risk, t)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RecommendationCard({
  item,
  rank,
  rankBracket,
  fallbackConfidence,
}: {
  item: Recommendation;
  rank: number;
  rankBracket: number | null;
  fallbackConfidence?: AnalysisResult['confidence'];
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const featured = rank === 1;
  const [expanded, setExpanded] = useState(featured);
  const accent = rank === 1 ? colors.cobalt : rank === 2 ? colors.live : colors.text;
  const label = t(recommendationLabelKey(String(item.label)));
  const confidence = item.confidence ?? fallbackConfidence;
  const matchup = item.evidence?.matchups;
  const preview =
    matchup?.weightedWinRate !== null && matchup?.weightedWinRate !== undefined
      ? t('result.evidence.preview', {
          winRate: formatPercent(matchup.weightedWinRate),
          games: matchup.games,
        })
      : item.metrics
        ? t('result.metric.preview', { value: formatPercent(item.metrics.counter) })
        : item.reasons[0]
          ? localizeStoredText(item.reasons[0], t)
          : item.laneFit
            ? localizeStoredText(item.laneFit, t)
            : '';

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
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 10, justifyContent: 'center' }}>
          <AppText variant="data" color={accent} numberOfLines={1}>
            {label}
          </AppText>
        </View>
        <View
          style={{
            minWidth: 82,
            paddingHorizontal: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.text,
          }}
        >
          <AppText variant="inscription" color={colors.background}>
            {Math.round(item.score)}
            <AppText variant="data" color={colors.background}>
              /100
            </AppText>
          </AppText>
        </View>
      </View>

      <View style={{ minHeight: featured ? 126 : 98, flexDirection: 'row' }}>
        <HeroThumbnail
          item={item}
          featured={featured}
          onPress={() => router.push(`/hero/${item.hero.id}` as Href)}
        />
        <View style={{ flex: 1, minWidth: 0, padding: 12, justifyContent: 'center' }}>
          {confidence ? (
            <AppText variant="data" color={accent} numberOfLines={1}>
              {t('result.confidence', { value: t(`result.${confidence}`) })}
            </AppText>
          ) : null}
          <AppText
            variant={featured ? 'display' : 'title'}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.62}
            style={{ marginTop: confidence ? 3 : 0 }}
          >
            {item.hero.name}
          </AppText>
          {preview ? (
            <AppText
              variant="caption"
              color={colors.textMuted}
              numberOfLines={2}
              style={{ marginTop: 5 }}
            >
              {preview}
            </AppText>
          ) : null}
        </View>
      </View>

      {expanded ? (
        <>
          <ScoreSignals item={item} />
          <EvidencePanel item={item} rankBracket={rankBracket} />
          <ReasonsPanel item={item} />
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(expanded ? 'result.hideDetails' : 'result.showDetails')}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={{
          minHeight: 46,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          backgroundColor: colors.surfaceElevated,
          borderTopWidth: 2,
          borderColor: colors.outline,
        }}
      >
        <AppText variant="data" color={accent}>
          {t(expanded ? 'result.hideDetails' : 'result.showDetails')}
        </AppText>
        <Ionicons
          name={expanded ? 'chevron-up-sharp' : 'chevron-down-sharp'}
          size={18}
          color={accent}
        />
      </Pressable>
    </View>
  );
}

function MethodologyPanel({ result, locale }: { result: AnalysisResult; locale: string }) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const provenance = result.provenance;
  const method =
    result.source === 'offline'
      ? t('result.method.offline')
      : !provenance
        ? t('result.method.legacy')
        : provenance.aiAssisted
          ? t('result.method.aiAssisted')
          : t('result.method.dataFirst');

  return (
    <View
      style={{
        marginTop: 12,
        padding: 12,
        borderTopWidth: 2,
        borderBottomWidth: 2,
        borderColor: colors.outline,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="server-outline" size={18} color={colors.cobalt} />
        <AppText variant="data" color={colors.cobalt} style={{ flex: 1 }}>
          {t('result.methodology')}
        </AppText>
      </View>
      <AppText variant="label" style={{ marginTop: 8 }}>
        {method}
      </AppText>
      <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
        {t('result.dataUpdated', {
          date: new Date(result.dataUpdatedAt).toLocaleDateString(locale),
        })}
      </AppText>
      {provenance ? (
        <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 3 }}>
          {t('result.engine', {
            engine: provenance.engineVersion,
            scoring: provenance.scoringVersion,
          })}
        </AppText>
      ) : null}
    </View>
  );
}
