import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/ui/app-text';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';
import type { MetaRotationEntry, MetaSnapshot } from '@/services/api/dota';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Props = {
  snapshot?: MetaSnapshot | undefined;
  roleEyebrow: string;
  roleValue: string;
};

type HeroPaneProps = {
  activeCycle: SharedValue<number>;
  entry: MetaRotationEntry;
  float: SharedValue<number>;
  isFocused: boolean;
  isNext: boolean;
  onPrepared?: (paneCycle: number) => void;
  onPreparing?: (paneCycle: number) => void;
  paneCycle: number;
  paneWidth: number;
  reducedMotion: boolean;
  scan: SharedValue<number>;
  shouldPlay: boolean;
};

const SCAN_IDLE_DURATION = 3_800;
const SCAN_SWEEP_DURATION = 3_800;
const SCAN_FADE_DURATION = 90;
const NEXT_VIDEO_PLAY_LEAD_MS = 420;
const HERO_VIDEO_PREPARE_TIMEOUT_MS = 4_500;
const HERO_VIDEO_BUFFER_BYTES = 6 * 1024 * 1024;
const HERO_PANE_START_PERCENT = 43;
const HERO_PANE_START = HERO_PANE_START_PERCENT / 100;
const HERO_PANE_WIDTH = 1 - HERO_PANE_START;
const HERO_PANE_LEFT = `${HERO_PANE_START_PERCENT}%` as `${number}%`;

export function MetaHeroMasthead(props: Props) {
  const rotationKey =
    props.snapshot?.entries
      .map(({ position, hero, picks, wins }) => `${position}-${hero.id}-${picks}-${wins}`)
      .join('|') ?? 'empty';

  return <MetaHeroMastheadContent key={rotationKey || 'empty'} {...props} />;
}

function MetaHeroMastheadContent({ snapshot, roleEyebrow, roleValue }: Props) {
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const horizontalGutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const initialCardWidth = Math.max(
    1,
    Math.min(width, layout.contentMaxWidth) - horizontalGutter * 2,
  );
  const [cardWidth, setCardWidth] = useState(initialCardWidth);
  const [cycle, setCycle] = useState(0);
  const [preparedPaneCycle, setPreparedPaneCycle] = useState<number | null>(null);
  const [playingPaneCycle, setPlayingPaneCycle] = useState<number | null>(null);
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const isFocused = useIsFocused();
  const activeCycle = useSharedValue(0);
  const float = useSharedValue(0);
  const scan = useSharedValue(0);
  const scanOpacity = useSharedValue(0);
  const entries = useMemo<MetaRotationEntry[]>(() => snapshot?.entries ?? [], [snapshot?.entries]);
  const currentEntry = entries[cycle % Math.max(entries.length, 1)] ?? null;
  const nextEntry = entries.length > 1 ? (entries[(cycle + 1) % entries.length] ?? null) : null;
  const isVisible = isFocused && isAppActive;
  const rotationEnabled = isVisible && !reducedMotion && entries.length > 1;
  const nextPaneCycle = cycle + 1;
  const nextPanePrepared =
    !nextEntry || (preparedPaneCycle !== null && preparedPaneCycle >= nextPaneCycle);
  const paneWidth = Math.max(1, cardWidth * HERO_PANE_WIDTH);
  const mastHeight = width >= 700 ? 350 : 292;
  const advanceRotation = useCallback(() => {
    setCycle((currentCycle) => currentCycle + 1);
  }, []);
  const markPanePrepared = useCallback((paneCycle: number) => {
    setPreparedPaneCycle((currentCycle) =>
      currentCycle === null ? paneCycle : Math.max(currentCycle, paneCycle),
    );
  }, []);
  const markPanePreparing = useCallback((paneCycle: number) => {
    setPreparedPaneCycle(null);
    setPlayingPaneCycle((currentCycle) => (currentCycle === paneCycle ? null : currentCycle));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setIsAppActive(active);
      if (!active) {
        setPreparedPaneCycle(null);
        setPlayingPaneCycle(null);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(float);
    if (!isVisible || reducedMotion) {
      float.value = 0;
      return;
    }
    float.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 2_600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2_600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(float);
  }, [float, isVisible, reducedMotion]);

  useEffect(() => {
    cancelAnimation(scan);
    cancelAnimation(scanOpacity);
    scan.value = 0;
    scanOpacity.value = 0;

    if (!rotationEnabled || !nextPanePrepared) return;

    const playTimer = setTimeout(
      () => setPlayingPaneCycle(nextPaneCycle),
      Math.max(0, SCAN_IDLE_DURATION - NEXT_VIDEO_PLAY_LEAD_MS),
    );
    scan.value = withDelay(
      SCAN_IDLE_DURATION,
      withTiming(
        1,
        {
          duration: SCAN_SWEEP_DURATION,
          easing: Easing.linear,
        },
        (finished) => {
          if (!finished) return;
          activeCycle.value += 1;
          scan.value = 0;
          scanOpacity.value = 0;
          scheduleOnRN(advanceRotation);
        },
      ),
    );
    scanOpacity.value = withSequence(
      withDelay(
        SCAN_IDLE_DURATION,
        withTiming(0.52, {
          duration: SCAN_FADE_DURATION,
          easing: Easing.out(Easing.quad),
        }),
      ),
      withDelay(
        SCAN_SWEEP_DURATION - SCAN_FADE_DURATION * 2,
        withTiming(0, {
          duration: SCAN_FADE_DURATION,
          easing: Easing.in(Easing.quad),
        }),
      ),
    );

    return () => {
      clearTimeout(playTimer);
      cancelAnimation(scan);
      cancelAnimation(scanOpacity);
    };
  }, [
    activeCycle,
    advanceRotation,
    cycle,
    nextPaneCycle,
    nextPanePrepared,
    rotationEnabled,
    scan,
    scanOpacity,
  ]);

  const scanStyle = useAnimatedStyle(() => ({
    opacity: scanOpacity.value,
    transform: [{ translateX: scan.value * cardWidth - 1 }],
  }));

  return (
    <View
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        setCardWidth((currentWidth) =>
          Math.abs(currentWidth - nextWidth) < 0.5 ? currentWidth : nextWidth,
        );
      }}
      style={{
        height: mastHeight,
        overflow: 'hidden',
        borderWidth: 2,
        borderRadius: shape.feature,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: HERO_PANE_LEFT,
          top: 0,
          right: 0,
          bottom: 0,
          borderLeftWidth: 2,
          borderColor: colors.outline,
          backgroundColor: isDark ? '#070809' : '#D8DAD7',
          overflow: 'hidden',
        }}
      >
        {currentEntry ? (
          <HeroPane
            key={`${cycle}-${currentEntry.position}-${currentEntry.hero.id}`}
            activeCycle={activeCycle}
            entry={currentEntry}
            float={float}
            isFocused={isVisible}
            isNext={false}
            paneCycle={cycle}
            paneWidth={paneWidth}
            reducedMotion={reducedMotion}
            scan={scan}
            shouldPlay={isVisible}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="data" color={colors.textMuted} maxFontSizeMultiplier={1.2}>
              {t('home.metaFeed')}
            </AppText>
          </View>
        )}
        {nextEntry ? (
          <HeroPane
            key={`${cycle + 1}-${nextEntry.position}-${nextEntry.hero.id}`}
            activeCycle={activeCycle}
            entry={nextEntry}
            float={float}
            isFocused={isVisible}
            isNext
            onPrepared={markPanePrepared}
            onPreparing={markPanePreparing}
            paneCycle={cycle + 1}
            paneWidth={paneWidth}
            reducedMotion={reducedMotion}
            scan={scan}
            shouldPlay={playingPaneCycle === cycle + 1}
          />
        ) : null}
      </View>

      <View style={{ width: '46%', padding: 12, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 7, height: 7, backgroundColor: colors.live }} />
          <AppText
            variant="data"
            color={colors.textMuted}
            maxFontSizeMultiplier={1.2}
            style={{ fontSize: 8, lineHeight: 11 }}
          >
            {t('brand.live')} · {snapshot?.patch ?? '—'}
          </AppText>
        </View>
        <AppText
          variant="display"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          maxFontSizeMultiplier={1.2}
          style={{
            marginTop: 18,
            fontSize: width >= 700 ? 62 : 43,
            lineHeight: width >= 700 ? 61 : 42,
            letterSpacing: -1.6,
          }}
        >
          DRAFT{'\n'}DESK
        </AppText>
        <AppText
          variant="caption"
          color={colors.textMuted}
          numberOfLines={2}
          maxFontSizeMultiplier={1.2}
          style={{ marginTop: 9, maxWidth: 130, fontSize: 10, lineHeight: 13 }}
        >
          {t('home.metaSnapshot')}
        </AppText>
      </View>

      <View
        style={{
          position: 'absolute',
          left: 9,
          bottom: 17,
          minWidth: 116,
          maxWidth: '47%',
          paddingHorizontal: 10,
          paddingVertical: 8,
          backgroundColor: colors.cobalt,
          transform: [{ rotate: '-2deg' }],
        }}
      >
        <AppText
          variant="data"
          color="#FFFFFF"
          maxFontSizeMultiplier={1.2}
          style={{ fontSize: 7, lineHeight: 10 }}
        >
          {roleEyebrow}
        </AppText>
        <AppText
          variant="inscription"
          color="#FFFFFF"
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.2}
          style={{ fontSize: 17, lineHeight: 19 }}
        >
          {roleValue}
        </AppText>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            zIndex: 10,
            width: 2,
            top: 0,
            bottom: 0,
            backgroundColor: colors.live,
          },
          scanStyle,
        ]}
      />
    </View>
  );
}

function HeroPane({
  activeCycle,
  entry,
  float,
  isFocused,
  isNext,
  onPrepared,
  onPreparing,
  paneCycle,
  paneWidth,
  reducedMotion,
  scan,
  shouldPlay,
}: HeroPaneProps) {
  const { hero, position } = entry;
  const { colors, isDark } = useAppTheme();
  const { t, locale } = useTranslation();
  const cropUrl = useMemo(
    () =>
      `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/crops/${hero.slug}.png`,
    [hero.slug],
  );
  const renderUrl = useMemo(
    () =>
      `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/${hero.slug}.${Platform.OS === 'ios' ? 'mov' : 'webm'}`,
    [hero.slug],
  );
  const videoEnabled = isFocused && !reducedMotion;
  const [imageUrl, setImageUrl] = useState<string | null>(cropUrl);
  const heroRole = `${t(`position.${position}`)} / P${position}`;
  const formattedWinRate = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(entry.winRate * 100);
  const displayedWinRate =
    entry.isApproximate || entry.isStale ? `≈ ${formattedWinRate}` : formattedWinRate;

  const clipStyle = useAnimatedStyle(() => {
    if (!isNext) return { transform: [{ translateX: 0 }] };
    const reveal =
      paneCycle <= activeCycle.value
        ? 1
        : Math.min(1, Math.max(0, (scan.value - HERO_PANE_START) / HERO_PANE_WIDTH));
    return { transform: [{ translateX: -paneWidth * (1 - reveal) }] };
  });
  const contentStyle = useAnimatedStyle(() => {
    if (!isNext) return { transform: [{ translateX: 0 }] };
    const reveal =
      paneCycle <= activeCycle.value
        ? 1
        : Math.min(1, Math.max(0, (scan.value - HERO_PANE_START) / HERO_PANE_WIDTH));
    return { transform: [{ translateX: paneWidth * (1 - reveal) }] };
  });
  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }, { scale: 1 + Math.abs(float.value) / 500 }],
  }));
  const handleVideoPrepared = useCallback(() => {
    onPrepared?.(paneCycle);
  }, [onPrepared, paneCycle]);
  const handleVideoPreparing = useCallback(() => {
    onPreparing?.(paneCycle);
  }, [onPreparing, paneCycle]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden={isNext}
      importantForAccessibility={isNext ? 'no-hide-descendants' : 'auto'}
      style={[
        {
          position: 'absolute',
          zIndex: isNext ? 2 : 1,
          left: 0,
          top: 0,
          bottom: 0,
          width: paneWidth,
          overflow: 'hidden',
        },
        clipStyle,
      ]}
    >
      <Animated.View
        style={[
          {
            width: paneWidth,
            height: '100%',
            overflow: 'hidden',
            backgroundColor: isDark ? '#070809' : '#D8DAD7',
          },
          contentStyle,
        ]}
      >
        <View
          style={{
            position: 'absolute',
            width: 180,
            height: 420,
            left: -48,
            top: -40,
            backgroundColor: colors.cobalt,
            opacity: isDark ? 0.26 : 0.16,
            transform: [{ rotate: '17deg' }],
          }}
        />

        <Animated.View
          style={[
            {
              position: 'absolute',
              left: '-37%',
              right: '-28%',
              top: 2,
              bottom: -8,
            },
            heroStyle,
          ]}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              contentFit="contain"
              contentPosition="bottom center"
              cachePolicy="disk"
              enforceEarlyResizing
              transition={reducedMotion ? 0 : 180}
              onError={() => {
                if (imageUrl !== hero.imageUrl) setImageUrl(hero.imageUrl || null);
                else setImageUrl(null);
              }}
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          ) : null}
          {videoEnabled ? (
            <HeroVideo
              renderUrl={renderUrl}
              shouldPlay={shouldPlay}
              onPreparing={handleVideoPreparing}
              {...(isNext ? { onPrepared: handleVideoPrepared } : {})}
            />
          ) : null}
        </Animated.View>

        <LinearGradient
          pointerEvents="none"
          colors={['transparent', isDark ? 'rgba(7,8,9,0.90)' : 'rgba(17,18,15,0.82)']}
          locations={[0.54, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />

        <View
          style={{
            position: 'absolute',
            right: 10,
            bottom: 11,
            maxWidth: '94%',
            alignItems: 'flex-end',
          }}
        >
          <AppText
            variant="data"
            color="#FFFFFF"
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
            style={{ fontSize: 8, lineHeight: 11 }}
          >
            {t('home.metaLeader')}
          </AppText>
          <AppText
            variant="inscription"
            color="#FFFFFF"
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.2}
            style={{ marginTop: 1, fontSize: 19, lineHeight: 21, textAlign: 'right' }}
          >
            {hero.name}
          </AppText>
          <View style={{ marginTop: 4, alignItems: 'flex-end', gap: 3 }}>
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                backgroundColor: colors.cobalt,
              }}
            >
              <AppText
                variant="data"
                color="#FFFFFF"
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
                style={{ fontSize: 8, lineHeight: 11 }}
              >
                {heroRole}
              </AppText>
            </View>
            <View
              style={{
                paddingHorizontal: 5,
                paddingVertical: 2,
                backgroundColor: colors.live,
              }}
            >
              <AppText
                variant="data"
                color="#FFFFFF"
                maxFontSizeMultiplier={1.2}
                style={{ fontSize: 8, lineHeight: 11 }}
              >
                {t('home.winRate', { value: displayedWinRate })}
              </AppText>
            </View>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function HeroVideo({
  renderUrl,
  shouldPlay,
  onPrepared,
  onPreparing,
}: {
  renderUrl: string;
  shouldPlay: boolean;
  onPrepared?: () => void;
  onPreparing: () => void;
}) {
  const reveal = useSharedValue(0);
  const preparedRef = useRef(false);
  const firstFrameRef = useRef(false);
  const unavailableRef = useRef(false);
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const source = useMemo(() => ({ uri: renderUrl, useCaching: true }), [renderUrl]);
  const player = useVideoPlayer(source, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.keepScreenOnWhilePlaying = false;
    videoPlayer.staysActiveInBackground = false;
    if (Platform.OS === 'ios') {
      videoPlayer.bufferOptions = {
        preferredForwardBufferDuration: 2,
        waitsToMinimizeStalling: true,
      };
    } else if (Platform.OS === 'android') {
      videoPlayer.bufferOptions = {
        preferredForwardBufferDuration: 2,
        minBufferForPlayback: 1,
        maxBufferBytes: HERO_VIDEO_BUFFER_BYTES,
        prioritizeTimeOverSizeThreshold: false,
      };
    }
    videoPlayer.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const style = useAnimatedStyle(() => ({ opacity: reveal.value }));

  const reportPrepared = useCallback(() => {
    if (preparedRef.current) return;
    preparedRef.current = true;
    onPrepared?.();
  }, [onPrepared]);

  const reportUnavailable = useCallback(() => {
    if (unavailableRef.current) return;
    unavailableRef.current = true;
    setUnavailable(true);
    player.pause();
    reportPrepared();
  }, [player, reportPrepared]);

  useEffect(() => {
    const timer = setTimeout(onPreparing, 0);
    return () => clearTimeout(timer);
  }, [onPreparing]);

  useEffect(() => {
    if (status !== 'error') return;
    const timer = setTimeout(reportUnavailable, 0);
    return () => clearTimeout(timer);
  }, [reportUnavailable, status]);

  useEffect(() => {
    if (firstFrameRendered || unavailable) return;
    const timer = setTimeout(reportUnavailable, HERO_VIDEO_PREPARE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [firstFrameRendered, reportUnavailable, unavailable]);

  useEffect(() => {
    if (unavailable || status === 'error') {
      player.pause();
      return;
    }
    if (!firstFrameRendered || shouldPlay) player.play();
    else player.pause();
  }, [firstFrameRendered, player, shouldPlay, status, unavailable]);

  if (status === 'error' || unavailable) return null;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        },
        style,
      ]}
    >
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        useExoShutter={false}
        allowsVideoFrameAnalysis={false}
        onFirstFrameRender={() => {
          if (firstFrameRef.current) return;
          firstFrameRef.current = true;
          setFirstFrameRendered(true);
          reportPrepared();
          reveal.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
        }}
        pointerEvents="none"
        {...(Platform.OS === 'android' ? { surfaceType: 'textureView' as const } : {})}
        style={{ width: '100%', height: '100%' }}
      />
    </Animated.View>
  );
}

export function PersonalTicker({ items }: { items: string[] }) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const isFocused = useIsFocused();
  const position = useSharedValue(0);
  const [segmentWidth, setSegmentWidth] = useState(0);
  const visibleItems = items.filter(Boolean);

  useEffect(() => {
    cancelAnimation(position);
    if (!isFocused || reducedMotion || segmentWidth <= 0) {
      position.value = 0;
      return;
    }
    position.value = withRepeat(
      withTiming(-segmentWidth, {
        duration: Math.max(9_000, segmentWidth * 24),
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => cancelAnimation(position);
  }, [isFocused, position, reducedMotion, segmentWidth]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value }],
  }));
  const content = visibleItems.join(' · ');

  if (reducedMotion) {
    return (
      <View
        accessibilityLabel={content}
        style={{
          minHeight: 34,
          marginTop: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.live,
          borderRadius: shape.control,
          borderWidth: 2,
          borderColor: colors.outline,
        }}
      >
        {visibleItems.map((item) => (
          <AppText
            key={item}
            variant="data"
            color="#FFFFFF"
            maxFontSizeMultiplier={1.2}
            style={{ fontSize: 9, lineHeight: 12 }}
          >
            {item}
          </AppText>
        ))}
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={content}
      style={{
        height: 34,
        marginTop: 8,
        overflow: 'hidden',
        backgroundColor: colors.live,
        borderRadius: shape.control,
        borderWidth: 2,
        borderColor: colors.outline,
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={[{ flexDirection: 'row', alignSelf: 'flex-start', flexShrink: 0 }, animatedStyle]}
      >
        {[0, 1].map((index) => (
          <View
            key={index}
            onLayout={
              index === 0
                ? (event) => setSegmentWidth(Math.ceil(event.nativeEvent.layout.width))
                : undefined
            }
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexShrink: 0,
              paddingLeft: 14,
            }}
          >
            {visibleItems.map((item, itemIndex) => (
              <View
                key={`${index}-${item}`}
                style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}
              >
                {itemIndex > 0 ? (
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      marginHorizontal: 12,
                      backgroundColor: '#FFFFFF',
                      transform: [{ rotate: '45deg' }],
                    }}
                  />
                ) : null}
                <AppText
                  variant="data"
                  color="#FFFFFF"
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  style={{ fontSize: 9, lineHeight: 12, flexShrink: 0 }}
                >
                  {item}
                </AppText>
              </View>
            ))}
            <View style={{ width: 28 }} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
