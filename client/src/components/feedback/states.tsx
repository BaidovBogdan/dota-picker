import type Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  DotaStateAnimation,
  type DotaStateScene,
} from '@/components/feedback/dota-state-animation';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/theme/use-app-theme';

type StateProps = {
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  live?: 'none' | 'polite' | 'assertive';
  scene?: DotaStateScene;
};

function resolveScene({
  icon,
  scene,
  title,
  message,
}: Pick<StateProps, 'icon' | 'scene' | 'title' | 'message'>): DotaStateScene {
  if (scene) return scene;

  const copy = `${title} ${message}`.toLocaleLowerCase();
  if (
    icon === 'cloud-offline-outline' ||
    icon === 'warning-outline' ||
    icon === 'alert-circle-outline' ||
    /не удалось|ошибка|недоступ|остановлен|could not|error|unavailable|failed|offline/.test(copy)
  )
    return 'warning';
  if (
    icon === 'sync-outline' ||
    /синхрониз|обновля|проверя|загруж|распозна|loading|sync|updat|checking|recogniz|getting/.test(
      copy,
    )
  )
    return 'loading';
  return 'empty';
}

export function MessageState({
  title,
  message,
  icon = 'compass-outline',
  actionLabel,
  onAction,
  live = 'polite',
  scene,
}: StateProps) {
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const resolvedScene = resolveScene({ icon, title, message, ...(scene ? { scene } : {}) });
  const horizontal = width >= 560;
  const accent = resolvedScene === 'warning' ? colors.live : colors.cobalt;
  const statusLabel =
    resolvedScene === 'warning'
      ? t('states.warning')
      : resolvedScene === 'confirm'
        ? t('states.confirmed')
        : resolvedScene === 'loading'
          ? t('common.loading')
          : t('brand.desk');

  return (
    <View accessibilityLiveRegion={live} style={styles.root}>
      <View
        style={[
          styles.frame,
          {
            backgroundColor: colors.surface,
            borderColor: colors.outline,
          },
        ]}
      >
        <View style={[styles.header, { borderColor: colors.outline }]}>
          <View style={[styles.status, { backgroundColor: accent }]}>
            <AppText variant="data" color="#FFFFFF" numberOfLines={1}>
              {statusLabel}
            </AppText>
          </View>
          <View style={styles.signals}>
            <View style={[styles.signalLong, { backgroundColor: colors.cobalt }]} />
            <View style={[styles.signalShort, { backgroundColor: colors.live }]} />
          </View>
        </View>

        <View style={[styles.body, horizontal && styles.bodyHorizontal]}>
          <View
            style={[
              styles.animation,
              horizontal ? styles.animationHorizontal : styles.animationVertical,
              { borderColor: colors.outline },
            ]}
          >
            <DotaStateAnimation scene={resolvedScene} size={horizontal ? 128 : 118} />
          </View>
          <View accessible accessibilityLabel={`${title}. ${message}`} style={styles.copy}>
            <AppText variant="title">{title}</AppText>
            <AppText variant="body" color={colors.textMuted} style={styles.message}>
              {message}
            </AppText>
            {actionLabel && onAction ? (
              <Button
                label={actionLabel}
                onPress={onAction}
                tone={resolvedScene === 'warning' ? 'secondary' : 'dota'}
                style={styles.action}
              />
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

export function Skeleton({ height = 82 }: { height?: number }) {
  const opacity = useSharedValue(0.35);
  const reduced = useReducedMotion();
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();

  useEffect(() => {
    if (reduced) {
      opacity.value = 0.64;
    } else {
      opacity.value = withRepeat(withTiming(0.78, { duration: 760 }), -1, true);
    }
    return () => cancelAnimation(opacity);
  }, [opacity, reduced]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      accessibilityLiveRegion="polite"
      style={[
        styles.skeleton,
        {
          height,
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.outline,
        },
        animatedStyle,
      ]}
    >
      <View style={[styles.skeletonRail, { backgroundColor: colors.cobalt }]} />
      <View style={styles.skeletonCopy}>
        <View
          style={[
            styles.skeletonLine,
            styles.skeletonLinePrimary,
            { backgroundColor: alpha.bone20 },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            styles.skeletonLineSecondary,
            { backgroundColor: alpha.bone12 },
          ]}
        />
      </View>
      <View style={[styles.skeletonLive, { backgroundColor: colors.live }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 4,
  },
  frame: {
    width: '100%',
    maxWidth: 540,
    borderWidth: 2,
    overflow: 'hidden',
  },
  header: {
    minHeight: 38,
    paddingLeft: 10,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
  },
  status: {
    minHeight: 24,
    maxWidth: '72%',
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  signals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  signalLong: {
    width: 28,
    height: 3,
  },
  signalShort: {
    width: 9,
    height: 3,
  },
  body: {
    alignItems: 'stretch',
  },
  bodyHorizontal: {
    flexDirection: 'row',
  },
  animation: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  animationHorizontal: {
    width: 150,
    borderRightWidth: 1,
  },
  animationVertical: {
    width: '100%',
    paddingTop: 6,
    borderBottomWidth: 1,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  message: {
    marginTop: 8,
  },
  action: {
    width: '100%',
    marginTop: 20,
  },
  skeleton: {
    width: '100%',
    minHeight: 54,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  skeletonRail: {
    width: 4,
  },
  skeletonCopy: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 9,
  },
  skeletonLine: {
    height: 8,
  },
  skeletonLinePrimary: {
    width: '52%',
  },
  skeletonLineSecondary: {
    width: '78%',
  },
  skeletonLive: {
    width: 18,
    height: 4,
    marginTop: 10,
    marginRight: 10,
  },
});
