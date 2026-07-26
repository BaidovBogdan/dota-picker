import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, ScrollView, ToastAndroid, TouchableOpacity, View } from 'react-native';

import { DraftBoard } from '@/components/draft/draft-board';
import { PositionPicker } from '@/components/draft/position-picker';
import { showNativeAlert } from '@/components/feedback/native-alert';
import { OfflineBanner } from '@/components/feedback/offline-banner';
import {
  FLOATING_ACTION_BAR_BOTTOM_INSET,
  FloatingActionBar,
} from '@/components/layout/floating-action-bar';
import { Screen } from '@/components/layout/screen';
import { TopBar } from '@/components/layout/top-bar';
import { MetaHeroMasthead, PersonalTicker } from '@/components/meta/meta-hero-masthead';
import { AttemptsChip } from '@/components/quota/attempts-chip';
import { AppText } from '@/components/ui/app-text';
import { ranks } from '@/data/options';
import { useDraftAccessGuard } from '@/hooks/use-draft-access';
import { useTranslation } from '@/i18n';
import { getMetaSnapshot, syncQuota } from '@/services/api/dota';
import { prepareDraftPhoto } from '@/services/image';
import { useAppStore } from '@/store/app-store';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { createId } from '@/utils/id';

export default function PickerScreen() {
  const session = useAppStore((state) => state.session);
  const draft = useAppStore((state) => state.draft);
  const attempts = useAppStore((state) => state.attempts);
  const history = useAppStore((state) => state.history);
  const setRank = useAppStore((state) => state.setRank);
  const setPhoto = useAppStore((state) => state.setPhoto);
  const metaQuery = useQuery({
    queryKey: ['meta-hero', session?.userId, draft.rank],
    queryFn: () => getMetaSnapshot(draft.rank),
    enabled: Boolean(session),
    staleTime: 15 * 60 * 1000,
  });
  useQuery({
    queryKey: ['quota', session?.userId],
    queryFn: syncQuota,
    enabled: Boolean(session),
  });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoErrorAlert, setPhotoErrorAlert] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [analysisStarting, setAnalysisStarting] = useState(false);
  const analysisLock = useRef(false);
  const draftAccess = useDraftAccessGuard();
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      useNativeDriver: true,
    }),
  ).current;
  const headerDividerOpacity = scrollY.interpolate({
    inputRange: [0, 8, 28],
    outputRange: [0, 0.2, 1],
    extrapolate: 'clamp',
  });
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const isRegistered = session?.kind === 'registered';
  const latest = isRegistered ? history[0] : undefined;
  const role = latest?.draft.position ?? draft.position;
  const roleEyebrow = latest ? t('home.lastAnalysis') : t('home.yourRole');
  const roleValue = role ? `${t(`position.${role}`)} / P${role}` : t('home.noRole');
  const currentRank = latest?.draft.rank ?? draft.rank;
  const patch = metaQuery.data?.patch ?? latest?.patch ?? '—';

  useFocusEffect(
    useCallback(
      () => () => {
        analysisLock.current = false;
        setAnalysisStarting(false);
      },
      [],
    ),
  );

  useEffect(() => {
    setValidation(null);
  }, [attempts.remaining, draft.enemies.length, draft.position]);

  useEffect(() => {
    if (!photoErrorAlert) return;
    showNativeAlert(photoErrorAlert.title, photoErrorAlert.message, [
      { text: t('common.confirm') },
    ]);
  }, [photoErrorAlert, t]);

  const pickPhoto = async (source: 'camera' | 'library') => {
    if (!draftAccess.requestAccess()) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error(t('errors.cameraPermission'));
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      const prepared = await prepareDraftPhoto(uri);
      setPhoto(prepared);
      router.push('/photo-review');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.photoPrepare');
      setPhotoError(message);
      setTimeout(() => {
        if (Platform.OS === 'android') {
          ToastAndroid.show(message, ToastAndroid.LONG);
          return;
        }
        setPhotoErrorAlert({
          title: source === 'camera' ? t('draft.camera') : t('home.scanDraft'),
          message,
        });
      }, 800);
    } finally {
      setPhotoBusy(false);
    }
  };

  const analyze = () => {
    if (analysisLock.current) return;
    if (draftAccess.status !== 'allowed') {
      setValidation(null);
      draftAccess.requestAccess();
      return;
    }
    if (!draft.position) {
      setValidation(t('home.needPosition'));
      showNativeAlert(t('home.analyze'), t('home.needPosition'), [{ text: t('common.confirm') }]);
      return;
    }
    if (draft.enemies.length === 0) {
      setValidation(t('home.needEnemy'));
      showNativeAlert(t('home.analyze'), t('home.needEnemy'), [{ text: t('common.confirm') }]);
      return;
    }
    setValidation(null);
    analysisLock.current = true;
    setAnalysisStarting(true);
    router.push({
      pathname: '/analysis',
      params: { idempotencyKey: createId('manual') },
    });
  };

  return (
    <Screen
      showGrid
      bottomInset={FLOATING_ACTION_BAR_BOTTOM_INSET + layout.tabBarHeight}
      onScroll={onScroll}
      scrollEventThrottle={16}
      stickyHeader={
        <>
          <TopBar
            title="Counterpick"
            eyebrow={`${t('brand.live')} · ${patch}`}
            trailing={<AttemptsChip />}
            dividerOpacity={headerDividerOpacity}
          />
          <FloatingActionBar
            label={t('home.analyze')}
            icon="git-compare-outline"
            loading={analysisStarting}
            disabled={analysisStarting || draftAccess.status === 'pending'}
            onPress={analyze}
            bottomOffset={layout.tabBarHeight}
            accessibilityHint={t('home.analyzeHint')}
            testID="draft-analyze"
          />
        </>
      }
    >
      <OfflineBanner />
      <MetaHeroMasthead snapshot={metaQuery.data} roleEyebrow={roleEyebrow} roleValue={roleValue} />
      {isRegistered ? (
        <PersonalTicker
          items={[
            `${t('home.rank')}: ${t(currentRank ? `rank.${currentRank}` : 'rank.any')}`,
            `${t('home.used')}: ${Math.max(0, attempts.maximum - attempts.remaining)}/${attempts.maximum}`,
            `${t('home.analyses')}: ${history.length}`,
            `${t('home.patch')}: ${patch}`,
          ]}
        />
      ) : null}

      <View style={{ marginTop: 10 }}>
        <DraftBoard
          capture={{
            busy: photoBusy,
            onCamera: () => void pickPhoto('camera'),
            onLibrary: () => void pickPhoto('library'),
          }}
          onRequestAccess={draftAccess.requestAccess}
        />
      </View>

      {photoError ? (
        <View
          style={{
            padding: 10,
            borderLeftWidth: 5,
            borderColor: colors.live,
            backgroundColor: colors.surface,
          }}
        >
          <AppText accessibilityRole="alert" variant="caption" color={colors.danger}>
            {photoError}
          </AppText>
        </View>
      ) : null}

      {draft.enemies.length > 0 || draft.allies.length > 0 || draft.position ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('home.resume')}
          activeOpacity={0.74}
          onPress={analyze}
          style={{
            minHeight: 64,
            marginTop: 8,
            paddingHorizontal: 11,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 2,
            borderRadius: shape.card,
            borderColor: colors.outline,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          }}
        >
          <View style={{ width: 5, alignSelf: 'stretch', backgroundColor: colors.live }} />
          <View style={{ flex: 1, minWidth: 0, marginLeft: 9, paddingRight: 8 }}>
            <AppText
              variant="data"
              color={colors.textMuted}
              style={{ fontSize: 8, lineHeight: 11 }}
            >
              {t('home.progress', { current: draft.enemies.length, maximum: 5 })}
            </AppText>
            <AppText
              variant="inscription"
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              maxFontSizeMultiplier={1.5}
              style={{ fontSize: 16, lineHeight: 18 }}
            >
              {t('home.resume')}
            </AppText>
          </View>
          <AppText variant="display" color={colors.cobalt} style={{ fontSize: 27, lineHeight: 29 }}>
            {String(draft.enemies.length).padStart(2, '0')}—05
          </AppText>
        </TouchableOpacity>
      ) : null}

      <View
        style={{
          marginTop: 14,
          paddingTop: 11,
          borderTopWidth: 2,
          borderColor: colors.outline,
        }}
      >
        <AppText variant="data" color={colors.textMuted} style={{ marginBottom: 7 }}>
          01 / {t('position.title')}
        </AppText>
        <PositionPicker />
      </View>

      <View
        style={{
          marginTop: 14,
          paddingTop: 11,
          borderTopWidth: 2,
          borderColor: colors.outline,
        }}
      >
        <AppText variant="data" color={colors.textMuted} style={{ marginBottom: 7 }}>
          02 / {t('rank.title')}
        </AppText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {ranks.map((rank) => {
            const active = draft.rank === rank.value;
            return (
              <TouchableOpacity
                key={rank.labelKey}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                activeOpacity={0.74}
                onPress={() => setRank(rank.value)}
                style={{
                  minHeight: 48,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderWidth: 2,
                  borderRadius: shape.compact,
                  borderColor: active ? colors.cobalt : colors.outline,
                  backgroundColor: active ? colors.cobalt : colors.surface,
                }}
              >
                <AppText variant="data" color={active ? '#FFFFFF' : colors.textMuted}>
                  {t(rank.labelKey)}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {validation ? (
        <View
          style={{
            marginTop: 14,
            padding: 10,
            borderLeftWidth: 5,
            borderColor: colors.live,
            backgroundColor: colors.surface,
          }}
        >
          <AppText accessibilityRole="alert" variant="caption" color={colors.danger}>
            {validation}
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}
