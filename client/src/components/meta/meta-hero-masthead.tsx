import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';
import type { MetaSnapshot } from '@/services/api/dota';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Props = {
  snapshot?: MetaSnapshot | undefined;
  roleEyebrow: string;
  roleValue: string;
};

export function MetaHeroMasthead({ snapshot, roleEyebrow, roleValue }: Props) {
  const hero = snapshot?.hero ?? null;
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const { colors, isDark } = useAppTheme();
  const { t, locale } = useTranslation();
  const float = useSharedValue(0);
  const scan = useSharedValue(0);
  const cropUrl = useMemo(
    () =>
      hero
        ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/crops/${hero.slug}.png`
        : null,
    [hero],
  );
  const renderUrl = useMemo(
    () =>
      hero
        ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/${hero.slug}.${Platform.OS === 'ios' ? 'mov' : 'webm'}`
        : null,
    [hero],
  );
  const videoSource = useMemo(
    () => (renderUrl ? { uri: renderUrl, useCaching: true } : null),
    [renderUrl],
  );
  const videoPlayer = useVideoPlayer(videoSource, (player) => {
    player.loop = true;
    player.muted = true;
    player.staysActiveInBackground = false;
  });
  const { status: videoStatus } = useEvent(videoPlayer, 'statusChange', {
    status: videoPlayer.status,
  });
  const [isFocused, setIsFocused] = useState(false);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(cropUrl);

  useEffect(() => {
    setImageUrl(cropUrl);
  }, [cropUrl]);

  useEffect(() => {
    setHasVideoFrame(false);
  }, [renderUrl]);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useEffect(() => {
    if (!isFocused || !renderUrl || reducedMotion || videoStatus === 'error') {
      videoPlayer.pause();
      return;
    }
    videoPlayer.play();
  }, [isFocused, reducedMotion, renderUrl, videoPlayer, videoStatus]);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(float);
      cancelAnimation(scan);
      float.value = 0;
      scan.value = 0;
      return;
    }
    float.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    scan.value = withRepeat(withTiming(1, { duration: 3800, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(float);
      cancelAnimation(scan);
    };
  }, [float, reducedMotion, scan]);

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }, { scale: 1 + Math.abs(float.value) / 500 }],
  }));
  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: scan.value * Math.min(width, 760) - 2 }],
  }));
  const mastHeight = width >= 700 ? 350 : 292;
  const formattedWinRate =
    typeof hero?.winRate === 'number'
      ? new Intl.NumberFormat(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(hero.winRate * 100)
      : null;

  return (
    <View
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
          left: '43%',
          top: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDark ? '#070809' : '#D8DAD7',
          borderLeftWidth: 2,
          borderColor: colors.outline,
          overflow: 'hidden',
        }}
      >
        <View
          pointerEvents="none"
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
        {hero && imageUrl ? (
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
            <Image
              source={{ uri: imageUrl }}
              contentFit="contain"
              contentPosition="bottom center"
              cachePolicy="memory-disk"
              transition={reducedMotion ? 0 : 180}
              onError={() => {
                if (imageUrl !== hero.imageUrl) setImageUrl(hero.imageUrl || null);
                else setImageUrl(null);
              }}
              style={{ width: '100%', height: '100%' }}
            />
            {renderUrl && !reducedMotion && videoStatus !== 'error' ? (
              <VideoView
                player={videoPlayer}
                nativeControls={false}
                contentFit="contain"
                useExoShutter={false}
                allowsVideoFrameAnalysis={false}
                onFirstFrameRender={() => setHasVideoFrame(true)}
                pointerEvents="none"
                {...(Platform.OS === 'android' ? { surfaceType: 'textureView' as const } : {})}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  opacity: hasVideoFrame ? 1 : 0,
                }}
              />
            ) : null}
          </Animated.View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="data" color={colors.textMuted} maxFontSizeMultiplier={1.2}>
              {t('home.metaFeed')}
            </AppText>
          </View>
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', isDark ? 'rgba(7,8,9,0.90)' : 'rgba(17,18,15,0.82)']}
          locations={[0.54, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
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

      <View
        style={{
          position: 'absolute',
          right: 10,
          bottom: 11,
          maxWidth: '49%',
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
          {hero?.name ?? '—'}
        </AppText>
        <View
          style={{
            marginTop: 4,
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
            {formattedWinRate
              ? t('home.winRate', { value: formattedWinRate })
              : `${t('home.winRateLabel')} —`}
          </AppText>
        </View>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: 2,
            top: 0,
            bottom: 0,
            backgroundColor: colors.live,
            opacity: 0.48,
          },
          scanStyle,
        ]}
      />
    </View>
  );
}

export function PersonalTicker({ items }: { items: string[] }) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const position = useSharedValue(0);
  const [segmentWidth, setSegmentWidth] = useState(0);
  const visibleItems = items.filter(Boolean);

  useEffect(() => {
    if (reducedMotion || segmentWidth <= 0) {
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
  }, [position, reducedMotion, segmentWidth]);

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
