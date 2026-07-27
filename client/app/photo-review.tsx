import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { DraftBoard } from '@/components/draft/draft-board';
import { MessageState } from '@/components/feedback/states';
import {
  FLOATING_ACTION_BAR_BOTTOM_INSET,
  FloatingActionBar,
} from '@/components/layout/floating-action-bar';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Panel } from '@/components/ui/panel';
import { useDraftAccessGuard } from '@/hooks/use-draft-access';
import { useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import { recognizePhoto } from '@/services/api/dota';
import { deleteDraftPhoto } from '@/services/image';
import { useAppStore } from '@/store/app-store';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { DraftTeam, NeutralRecognizedPick } from '@/types/domain';
import { createId } from '@/utils/id';

function AssignmentButton({
  label,
  team,
  disabled,
  onPress,
}: {
  label: string;
  team: DraftTeam;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const backgroundColor = team === 'allies' ? colors.cobalt : colors.live;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        borderWidth: 2,
        borderRadius: shape.compact,
        borderColor: colors.outline,
        backgroundColor,
        opacity: disabled ? 0.38 : 1,
      }}
    >
      <Ionicons
        name={team === 'allies' ? 'people-outline' : 'flash-outline'}
        size={16}
        color={colors.onPrimary}
      />
      <AppText
        variant="data"
        color={colors.onPrimary}
        numberOfLines={2}
        style={{ flexShrink: 1, textAlign: 'center' }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function NeutralPickCard({
  pick,
  onAssign,
  onDelete,
}: {
  pick: NeutralRecognizedPick;
  onAssign: (team: DraftTeam) => void;
  onDelete: () => void;
}) {
  const canAssign = pick.heroId !== null;
  const confidence = Math.round(Math.max(0, Math.min(1, pick.confidence)) * 100);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const heroName = pick.name || t('photo.unknown');

  return (
    <Panel style={{ padding: 0 }}>
      <View style={{ height: 5, backgroundColor: colors.live }} />
      <View style={{ padding: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              minWidth: 52,
              minHeight: 46,
              paddingHorizontal: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.text,
            }}
          >
            <AppText variant="data" color={colors.background}>
              {String(pick.slot + 1).padStart(2, '0')}
            </AppText>
            <AppText variant="data" color={colors.background} style={{ fontSize: 9 }}>
              {confidence}%
            </AppText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="inscription" numberOfLines={2} style={{ flexShrink: 1 }}>
              {heroName}
            </AppText>
            <AppText
              variant="caption"
              color={colors.textMuted}
              numberOfLines={2}
              style={{ marginTop: 3, flexShrink: 1 }}
            >
              {canAssign ? t('photo.review') : t('photo.unknown')}
            </AppText>
          </View>
          <IconButton
            name="trash-outline"
            label={`${t('common.delete')}: ${heroName}`}
            onPress={onDelete}
            size={44}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 7, marginTop: 12 }}>
          <AssignmentButton
            label={t('draft.allies')}
            team="allies"
            disabled={!canAssign}
            onPress={() => onAssign('allies')}
          />
          <AssignmentButton
            label={t('draft.enemies')}
            team="enemies"
            disabled={!canAssign}
            onPress={() => onAssign('enemies')}
          />
        </View>
      </View>
    </Panel>
  );
}

export default function PhotoReviewScreen() {
  const { width } = useWindowDimensions();
  const previewWidth = Math.max(
    0,
    Math.min(width, layout.contentMaxWidth) - layout.phoneGutter * 2,
  );
  const previewHeight = Math.min(400, Math.max(190, previewWidth * 0.62));
  const photoUri = useAppStore((state) => state.draft.photoUri);
  const draft = useAppStore((state) => state.draft);
  const attempts = useAppStore((state) => state.attempts);
  const replaceTeams = useAppStore((state) => state.replaceTeams);
  const addHero = useAppStore((state) => state.addHero);
  const setPhoto = useAppStore((state) => state.setPhoto);
  const clearPhotoUri = useAppStore((state) => state.clearPhotoUri);
  const [neutralPicks, setNeutralPicks] = useState<NeutralRecognizedPick[]>([]);
  const [reviewMessageKey, setReviewMessageKey] = useState<string | null>(null);
  const [analysisStarting, setAnalysisStarting] = useState(false);
  const started = useRef(false);
  const mounted = useRef(true);
  const analysisLock = useRef(false);
  const confirmed = useRef(false);
  const recognitionController = useRef(new AbortController());
  const recognitionKey = useRef(createId('photo'));
  const launchUserId = useRef(useAppStore.getState().session?.userId);
  const waitNoticeShown = useRef(false);
  const draftAccess = useDraftAccessGuard();
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const mutation = useMutation({
    mutationFn: recognizePhoto,
    onSuccess: (result) => {
      if (!mounted.current) return;
      replaceTeams(result.allies, result.enemies);
      setNeutralPicks(result.neutralPicks);
      setReviewMessageKey(null);
    },
  });
  const header = (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title: t('photo.title'),
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          <View
            accessibilityLabel={t('quota.a11y', {
              remaining: attempts.remaining,
              maximum: attempts.maximum,
            })}
            style={{
              minWidth: 48,
              minHeight: 30,
              paddingHorizontal: 9,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.text,
            }}
          >
            <AppText variant="data" color={colors.background} numberOfLines={1}>
              {attempts.remaining}/{attempts.maximum}
            </AppText>
          </View>
        </Stack.Toolbar.View>
      </Stack.Toolbar>
    </>
  );

  useEffect(() => {
    if (!photoUri || started.current || draftAccess.status !== 'allowed') return;
    started.current = true;
    mutation.mutate({
      uri: photoUri,
      idempotencyKey: recognitionKey.current,
      ...(launchUserId.current ? { expectedUserId: launchUserId.current } : {}),
      signal: recognitionController.current.signal,
    });
  }, [draftAccess.status, mutation, photoUri]);

  useEffect(() => {
    if (draftAccess.status === 'allowed') {
      waitNoticeShown.current = false;
      return;
    }
    if (draftAccess.status !== 'waitForRefill' || waitNoticeShown.current) return;
    waitNoticeShown.current = true;
    draftAccess.requestAccess();
  }, [draftAccess]);

  useEffect(() => {
    const controller = recognitionController.current;
    return () => {
      mounted.current = false;
      controller.abort();
      deleteDraftPhoto(photoUri);
      if (confirmed.current) clearPhotoUri();
      else setPhoto(null);
    };
  }, [clearPhotoUri, photoUri, setPhoto]);

  if (!photoUri) {
    return (
      <>
        {header}
        <Screen nativeHeader scroll={false}>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <MessageState
              title={t('photo.missing')}
              message={t('photo.chooseAgain')}
              actionLabel={t('photo.chooseAgain')}
              onAction={() => router.replace('/(tabs)')}
            />
          </View>
        </Screen>
      </>
    );
  }

  if (draftAccess.status !== 'allowed') {
    const pending = draftAccess.status === 'pending';
    const upgrade = draftAccess.status === 'upgrade';
    return (
      <>
        {header}
        <Screen nativeHeader scroll={false}>
          <View style={{ flex: 1, justifyContent: 'center' }}>
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
        </Screen>
      </>
    );
  }

  const assignNeutralPick = (pick: NeutralRecognizedPick, team: DraftTeam) => {
    if (pick.heroId === null || !Number.isInteger(pick.heroId) || pick.heroId <= 0) {
      setReviewMessageKey('photo.assignUnknown');
      return;
    }
    const currentDraft = useAppStore.getState().draft;
    if (currentDraft.allies.includes(pick.heroId) || currentDraft.enemies.includes(pick.heroId)) {
      setReviewMessageKey('photo.duplicateHero');
      return;
    }
    const currentTeam = currentDraft[team];
    const maximum = team === 'allies' ? 4 : 5;
    if (currentTeam.length >= maximum) {
      setReviewMessageKey('photo.teamFull');
      return;
    }
    addHero(team, pick.heroId);
    setNeutralPicks((current) => current.filter((candidate) => candidate !== pick));
    setReviewMessageKey(null);
  };

  const coreDraftReady = Boolean(draft.position && draft.enemies.length > 0);
  const hasUnresolvedPicks = neutralPicks.length > 0;
  const canAnalyze = coreDraftReady && !hasUnresolvedPicks;
  const analyze = () => {
    if (analysisLock.current) return;
    if (draftAccess.status !== 'allowed') {
      draftAccess.requestAccess();
      return;
    }
    if (!canAnalyze) {
      if (hasUnresolvedPicks) {
        setReviewMessageKey('photo.resolveBeforeAnalysis');
      } else {
        router.replace('/(tabs)');
      }
      return;
    }
    analysisLock.current = true;
    setAnalysisStarting(true);
    confirmed.current = true;
    const idempotencyKey = createId('manual');
    router.replace({ pathname: '/analysis', params: { idempotencyKey } });
  };

  const actionLabel = hasUnresolvedPicks
    ? t('photo.review')
    : coreDraftReady
      ? t('home.analyze')
      : t('nav.draft');

  return (
    <>
      {header}
      <Screen
        nativeHeader
        bottomInset={FLOATING_ACTION_BAR_BOTTOM_INSET}
        stickyHeader={
          <FloatingActionBar
            label={actionLabel}
            {...(canAnalyze ? { icon: 'checkmark-circle-outline' as const } : {})}
            loading={analysisStarting}
            disabled={mutation.isPending || analysisStarting}
            onPress={analyze}
            testID="photo-review-action"
          />
        }
      >
        <View
          style={{
            height: previewHeight,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            marginBottom: 14,
            borderWidth: 2,
            borderRadius: shape.card,
            borderColor: colors.outline,
          }}
        >
          <Image
            source={{ uri: photoUri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            cachePolicy="none"
            enforceEarlyResizing
            transition={160}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              minHeight: 28,
              paddingHorizontal: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.live,
            }}
          >
            <AppText variant="data" color={colors.onPrimary}>
              {t('brand.live')}
            </AppText>
          </View>
          {mutation.isPending ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t('photo.recognizing')}
              accessibilityLiveRegion="polite"
              style={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: alpha.overlay,
              }}
            >
              <View
                style={{
                  minHeight: 54,
                  maxWidth: '82%',
                  paddingHorizontal: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.cobalt,
                  borderWidth: 2,
                  borderRadius: shape.control,
                  borderColor: colors.onPrimary,
                }}
              >
                <AppText
                  variant="inscription"
                  color={colors.onPrimary}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={{ textAlign: 'center' }}
                >
                  {t('photo.recognizing')}
                </AppText>
              </View>
            </View>
          ) : null}
        </View>

        {mutation.isError ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <Panel style={{ padding: 0, marginBottom: 14, borderColor: colors.live }}>
              <View style={{ height: 5, backgroundColor: colors.live }} />
              <View style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                  <Ionicons name="alert-circle-outline" size={28} color={colors.live} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="inscription" color={colors.live} numberOfLines={2}>
                      {t('photo.error')}
                    </AppText>
                    <AppText
                      variant="caption"
                      color={colors.textMuted}
                      numberOfLines={3}
                      style={{ marginTop: 4, flexShrink: 1 }}
                    >
                      {t('photo.chooseAgain')}
                    </AppText>
                  </View>
                </View>
                <Button
                  label={t('common.retry')}
                  tone="secondary"
                  style={{ marginTop: 12 }}
                  onPress={() =>
                    mutation.mutate({
                      uri: photoUri,
                      idempotencyKey: recognitionKey.current,
                      ...(launchUserId.current ? { expectedUserId: launchUserId.current } : {}),
                      signal: recognitionController.current.signal,
                    })
                  }
                />
              </View>
            </Panel>
          </View>
        ) : null}

        {mutation.data?.warnings.length ? (
          <View
            style={{
              marginBottom: 14,
              padding: 12,
              backgroundColor: colors.cobalt,
              borderRadius: shape.control,
              borderLeftWidth: 6,
              borderLeftColor: colors.live,
            }}
          >
            <AppText variant="data" color={colors.onPrimary}>
              {t('states.warning')}
            </AppText>
            {mutation.data.warnings.map((warning) => (
              <AppText
                key={warning}
                variant="caption"
                color={colors.onPrimary}
                style={{ marginTop: 4, flexShrink: 1 }}
              >
                {warning}
              </AppText>
            ))}
          </View>
        ) : null}

        {neutralPicks.length > 0 ? (
          <View style={{ marginBottom: 14 }}>
            <View
              style={{
                minHeight: 54,
                paddingHorizontal: 12,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: colors.text,
                borderRadius: shape.control,
              }}
            >
              <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                <AppText variant="data" color={colors.live} numberOfLines={1}>
                  {t('states.warning')}
                </AppText>
                <AppText
                  variant="inscription"
                  color={colors.background}
                  numberOfLines={2}
                  style={{ flexShrink: 1 }}
                >
                  {t('photo.review')}
                </AppText>
              </View>
              <AppText variant="display" color={colors.background} style={{ fontSize: 30 }}>
                {String(neutralPicks.length).padStart(2, '0')}
              </AppText>
            </View>
            <View style={{ gap: 8, marginTop: 8 }}>
              {neutralPicks.map((pick) => (
                <NeutralPickCard
                  key={`${pick.slot}-${pick.heroId ?? 'unknown'}-${pick.name}`}
                  pick={pick}
                  onAssign={(team) => assignNeutralPick(pick, team)}
                  onDelete={() => {
                    setNeutralPicks((current) => current.filter((candidate) => candidate !== pick));
                    setReviewMessageKey(null);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        <DraftBoard />

        {reviewMessageKey ? (
          <View
            accessibilityRole="alert"
            style={{
              marginTop: 14,
              padding: 12,
              backgroundColor: alpha.ember16,
              borderRadius: shape.control,
              borderLeftWidth: 6,
              borderLeftColor: colors.live,
            }}
          >
            <AppText variant="caption" color={colors.live}>
              {t(reviewMessageKey)}
            </AppText>
          </View>
        ) : null}
      </Screen>
    </>
  );
}
