import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, useWindowDimensions, View } from 'react-native';

import { lottieLabSections, type LottieLabEntry } from '@/components/feedback/lottie-lab-registry';
import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type PlaybackKind = 'play' | 'pause' | 'replay';

type PlaybackCommand = {
  kind: PlaybackKind;
  sequence: number;
};

export default function LottieLabScreen() {
  const reducedMotion = useReducedMotion();
  const [playback, setPlayback] = useState<PlaybackCommand>({ kind: 'play', sequence: 0 });
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const horizontalGutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const playing = playback.kind !== 'pause';

  const control = useCallback(
    (kind: PlaybackKind) => {
      if (reducedMotion) return;
      setPlayback((current) => ({ kind, sequence: current.sequence + 1 }));
    },
    [reducedMotion],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('lottieLab.title'),
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: t('lottieLab.play'),
              accessibilityLabel: t('lottieLab.play'),
              icon: { type: 'sfSymbol', name: 'play.fill' },
              disabled: reducedMotion || playing,
              onPress: () => control('play'),
            },
            {
              type: 'button',
              label: t('lottieLab.pause'),
              accessibilityLabel: t('lottieLab.pause'),
              icon: { type: 'sfSymbol', name: 'pause.fill' },
              disabled: reducedMotion || !playing,
              onPress: () => control('pause'),
            },
            {
              type: 'button',
              label: t('lottieLab.replay'),
              accessibilityLabel: t('lottieLab.replay'),
              icon: { type: 'sfSymbol', name: 'arrow.counterclockwise' },
              disabled: reducedMotion,
              onPress: () => control('replay'),
            },
          ],
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <IconButton
                name="play"
                label={t('lottieLab.play')}
                disabled={reducedMotion || playing}
                onPress={() => control('play')}
                size={32}
              />
              <IconButton
                name="pause"
                label={t('lottieLab.pause')}
                disabled={reducedMotion || !playing}
                onPress={() => control('pause')}
                size={32}
              />
              <IconButton
                name="refresh"
                label={t('lottieLab.replay')}
                disabled={reducedMotion}
                onPress={() => control('replay')}
                size={32}
              />
            </View>
          ),
        }}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: horizontalGutter,
          paddingTop: 0,
          paddingBottom: 56,
        }}
      >
        <View
          style={{
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: colors.outline,
            borderRadius: shape.card,
            backgroundColor: colors.surface,
          }}
        >
          <View
            style={{
              minHeight: 32,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 2,
              borderColor: colors.outline,
            }}
          >
            <AppText variant="data" color={colors.cobalt}>
              {t('lottieLab.eyebrow')}
            </AppText>
            <View style={{ width: 30, height: 5, borderRadius: 3, backgroundColor: colors.live }} />
          </View>
          <View style={{ padding: 16 }}>
            <AppText variant="display">{t('lottieLab.heading')}</AppText>
            <AppText
              variant="body"
              color={colors.textMuted}
              style={{ maxWidth: 520, marginTop: 8 }}
            >
              {t('lottieLab.body')}
            </AppText>
          </View>
        </View>

        {reducedMotion ? (
          <View
            accessibilityRole="alert"
            style={{
              minHeight: 54,
              marginTop: 12,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderRadius: shape.control,
              borderWidth: 2,
              borderColor: colors.live,
              backgroundColor: colors.surface,
            }}
          >
            <Ionicons name="accessibility" size={21} color={colors.live} />
            <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
              {t('lottieLab.reduceMotion')}
            </AppText>
          </View>
        ) : null}

        {lottieLabSections.map((section) => (
          <View key={section.id} style={{ marginTop: 26 }}>
            <View
              style={{
                marginBottom: 9,
                paddingBottom: 8,
                flexDirection: 'row',
                alignItems: 'flex-end',
                borderBottomWidth: 2,
                borderColor: colors.outline,
              }}
            >
              <AppText variant="inscription" style={{ flex: 1 }}>
                {t(section.titleKey)}
              </AppText>
              <AppText variant="data" color={colors.textMuted}>
                {String(section.entries.length).padStart(2, '0')}
              </AppText>
            </View>
            <View style={{ gap: 12 }}>
              {section.entries.map((entry) => (
                <AnimationCard
                  key={entry.id}
                  entry={entry}
                  playback={playback}
                  reducedMotion={reducedMotion}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function AnimationCard({
  entry,
  playback,
  reducedMotion,
}: {
  entry: LottieLabEntry;
  playback: PlaybackCommand;
  reducedMotion: boolean;
}) {
  const animation = useRef<LottieView>(null);
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const horizontal = width >= 560;
  const accent = entry.status === 'candidate' ? colors.live : colors.cobalt;

  useEffect(() => {
    const current = animation.current;
    if (!current) return;
    if (reducedMotion) {
      current.pause();
      return;
    }
    if (playback.kind === 'pause') {
      current.pause();
      return;
    }
    if (playback.kind === 'replay') current.reset();
    current.play();
  }, [playback.kind, playback.sequence, reducedMotion]);

  return (
    <View
      style={{
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: colors.outline,
        borderRadius: shape.card,
        backgroundColor: colors.surface,
      }}
    >
      <View
        style={{
          minHeight: 34,
          paddingLeft: 10,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 2,
          borderColor: colors.outline,
        }}
      >
        <AppText variant="data" color={colors.textMuted} style={{ flex: 1 }}>
          {t('lottieLab.asset', { name: entry.fileName })}
        </AppText>
        <View
          style={{
            minHeight: 32,
            paddingHorizontal: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent,
          }}
        >
          <AppText variant="data" color="#FFFFFF">
            {t(entry.status === 'candidate' ? 'lottieLab.candidate' : 'lottieLab.used')}
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: horizontal ? 'row' : 'column' }}>
        <View
          style={{
            width: horizontal ? 170 : '100%',
            minHeight: horizontal ? 170 : 156,
            alignItems: 'center',
            justifyContent: 'center',
            borderRightWidth: horizontal ? 2 : 0,
            borderBottomWidth: horizontal ? 0 : 2,
            borderColor: colors.outline,
            backgroundColor: colors.paper,
          }}
        >
          <View
            style={{
              width: 130,
              height: 130,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: shape.feature,
              backgroundColor: colors.background,
            }}
          >
            <LottieView
              ref={animation}
              source={entry.source}
              resizeMode="contain"
              renderMode="AUTOMATIC"
              style={{ width: 118, height: 118 }}
              webStyle={{ width: 118, height: 118 }}
              {...(reducedMotion
                ? Platform.OS === 'web'
                  ? { autoPlay: false, loop: false }
                  : {
                      autoPlay: false,
                      loop: false,
                      progress: entry.staticProgress,
                    }
                : {
                    autoPlay: true,
                    loop: entry.loop,
                    speed: entry.speed,
                  })}
            />
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          {entry.usageKeys.map((usageKey, index) => (
            <View
              key={usageKey}
              style={{
                minHeight: 52,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: colors.outline,
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 14,
                  backgroundColor: accent,
                }}
              >
                <AppText variant="data" color="#FFFFFF" style={{ fontSize: 8 }}>
                  {String(index + 1).padStart(2, '0')}
                </AppText>
              </View>
              <AppText variant="label" style={{ flex: 1 }}>
                {t(usageKey)}
              </AppText>
              <Ionicons
                name={entry.status === 'candidate' ? 'flask-outline' : 'checkmark'}
                size={18}
                color={accent}
              />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
