import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, ToastAndroid, View } from 'react-native';

import { DraftBoard } from '@/components/draft/draft-board';
import { showNativeAlert } from '@/components/feedback/native-alert';
import { OfflineBanner } from '@/components/feedback/offline-banner';
import { Screen } from '@/components/layout/screen';
import { TopBar } from '@/components/layout/top-bar';
import { MetaDiscoverySection } from '@/components/meta/meta-discovery-section';
import { MetaHeroMasthead, PersonalTicker } from '@/components/meta/meta-hero-masthead';
import { AttemptsChip } from '@/components/quota/attempts-chip';
import { AppText } from '@/components/ui/app-text';
import { useDraftAccessGuard } from '@/hooks/use-draft-access';
import { useTranslation } from '@/i18n';
import {
  getMetaSnapshot,
  isMetaSnapshotIncomplete,
  META_SNAPSHOT_COLLECTING_RETRY_MS,
  META_SNAPSHOT_STALE_RETRY_MS,
  syncQuota,
} from '@/services/api/dota';
import { deleteDraftPhoto, prepareDraftPhoto } from '@/services/image';
import { useAppStore } from '@/store/app-store';
import { layout } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function PickerScreen() {
  const session = useAppStore((state) => state.session);
  const draftRank = useAppStore((state) => state.draft.rank);
  const draftPosition = useAppStore((state) => state.draft.position);
  const attempts = useAppStore((state) => state.attempts);
  const history = useAppStore((state) => state.history);
  const setPhoto = useAppStore((state) => state.setPhoto);
  const isFocused = useIsFocused();
  const metaQuery = useQuery({
    queryKey: ['meta-snapshot', session?.userId, draftRank],
    queryFn: ({ signal }) => getMetaSnapshot(draftRank, signal),
    enabled: Boolean(session) && isFocused,
    staleTime: (query) => {
      if (isMetaSnapshotIncomplete(query.state.data)) return 0;
      return query.state.data?.isStale ? META_SNAPSHOT_STALE_RETRY_MS : 15 * 60 * 1_000;
    },
    refetchInterval: (query) => {
      if (!isFocused) return false;
      if (isMetaSnapshotIncomplete(query.state.data)) return META_SNAPSHOT_COLLECTING_RETRY_MS;
      return query.state.data?.isStale ? META_SNAPSHOT_STALE_RETRY_MS : false;
    },
    refetchOnMount: (query) => (isMetaSnapshotIncomplete(query.state.data) ? 'always' : true),
  });
  useQuery({
    queryKey: ['quota', session?.userId],
    queryFn: syncQuota,
    enabled: Boolean(session) && isFocused,
  });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoRequestId = useRef(0);
  const photoErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftAccess = useDraftAccessGuard();
  const [scrollY] = useState(() => new Animated.Value(0));
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  );
  const headerDividerOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, 8, 28],
        outputRange: [0, 0.2, 1],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const isRegistered = session?.kind === 'registered';
  const latest = isRegistered ? history[0] : undefined;
  const role = latest?.draft.position ?? draftPosition;
  const roleEyebrow = latest ? t('home.lastAnalysis') : t('home.yourRole');
  const roleValue = role ? `${t(`position.${role}`)} / P${role}` : t('home.noRole');
  const currentRank = latest?.draft.rank ?? draftRank;
  const patch = metaQuery.data?.patch ?? latest?.patch ?? '—';
  const cancelPendingPhotoRequest = useCallback(() => {
    photoRequestId.current += 1;
    if (photoErrorTimer.current) clearTimeout(photoErrorTimer.current);
    photoErrorTimer.current = null;
    setPhotoBusy(false);
  }, []);

  useEffect(
    () => (isFocused ? cancelPendingPhotoRequest : undefined),
    [cancelPendingPhotoRequest, isFocused],
  );

  const pickPhoto = async (source: 'camera' | 'library') => {
    if (!draftAccess.requestAccess()) return;
    const requestId = ++photoRequestId.current;
    if (photoErrorTimer.current) {
      clearTimeout(photoErrorTimer.current);
      photoErrorTimer.current = null;
    }
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
      if (photoRequestId.current !== requestId) {
        deleteDraftPhoto(prepared);
        return;
      }
      setPhoto(prepared);
      router.push('/photo-review');
    } catch (error) {
      if (photoRequestId.current !== requestId) return;
      const message = error instanceof Error ? error.message : t('errors.photoPrepare');
      setPhotoError(message);
      photoErrorTimer.current = setTimeout(() => {
        if (photoRequestId.current !== requestId) return;
        photoErrorTimer.current = null;
        if (Platform.OS === 'android') {
          ToastAndroid.show(message, ToastAndroid.LONG);
          return;
        }
        showNativeAlert(
          source === 'camera' ? t('draft.camera') : t('draft.gallery'),
          message,
          [{ text: t('common.confirm') }],
        );
      }, 800);
    } finally {
      if (photoRequestId.current === requestId) setPhotoBusy(false);
    }
  };

  return (
    <Screen
      showGrid
      gridHeaderInset={66}
      bottomInset={layout.tabBarHeight}
      onScroll={onScroll}
      scrollEventThrottle={16}
      stickyHeader={
        <TopBar
          title="Counterpick"
          eyebrow={`${t('brand.live')} · ${patch}`}
          trailing={<AttemptsChip />}
          dividerOpacity={headerDividerOpacity}
        />
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
      <View style={{ marginTop: 12 }}>
        <DraftBoard
          captureOnly
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

      <MetaDiscoverySection snapshot={metaQuery.data} loading={metaQuery.isPending} />
    </Screen>
  );
}
