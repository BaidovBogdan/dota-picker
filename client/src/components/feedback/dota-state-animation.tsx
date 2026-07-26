import Ionicons from '@expo/vector-icons/Ionicons';
import LottieView from 'lottie-react-native';
import { Platform, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useAppTheme } from '@/theme/use-app-theme';

export type DotaStateScene = 'empty' | 'warning' | 'confirm' | 'loading';

const sources = {
  empty: require('../../../assets/lottie/no-item.json'),
  warning: require('../../../assets/lottie/close.json'),
  confirm: require('../../../assets/lottie/plus.json'),
  loading: require('../../../assets/lottie/loading.json'),
} as const;

const staticProgress = {
  empty: 0.34,
  warning: 0.48,
  confirm: 0.58,
  loading: 0.42,
} as const;

const loadingLayers = [
  'loading-outline-top_s1g1_s2g1_s3g1_s4g1 Outlines',
  'loading-outline-top_s1g1_s2g1_s3g1_s4g1_background Outlines',
  'loading-outline-bot_s1g1_s2g2_s3g1_s4g1_background Outlines',
] as const;

export function DotaStateAnimation({
  scene,
  size = 140,
}: {
  scene: DotaStateScene;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const { colors, alpha } = useAppTheme();
  const frameInset = Math.max(7, Math.round(size * 0.08));
  const accent = scene === 'warning' ? colors.live : colors.cobalt;
  const icon = scene === 'warning' ? 'alert' : scene === 'confirm' ? 'checkmark' : undefined;
  const loadingColorFilters =
    scene === 'loading'
      ? [
          { keypath: loadingLayers[0], color: colors.text },
          { keypath: loadingLayers[1], color: colors.surfaceElevated },
          { keypath: loadingLayers[2], color: colors.cobalt },
        ]
      : undefined;

  return (
    <View pointerEvents="none" style={[styles.root, { width: size, height: size }]}>
      <View
        style={[
          styles.frame,
          {
            top: frameInset,
            right: frameInset,
            bottom: frameInset,
            left: frameInset,
            borderColor: alpha.bone12,
            backgroundColor: colors.paper,
          },
        ]}
      />
      <View
        style={[
          styles.topRail,
          {
            top: frameInset,
            left: frameInset,
            width: Math.max(26, Math.round(size * 0.3)),
            backgroundColor: accent,
          },
        ]}
      />
      <View
        style={[
          styles.bottomRail,
          {
            right: frameInset,
            bottom: frameInset,
            width: Math.max(18, Math.round(size * 0.2)),
            backgroundColor: scene === 'warning' ? colors.text : colors.live,
          },
        ]}
      />
      <LottieView
        source={sources[scene]}
        resizeMode="contain"
        renderMode="AUTOMATIC"
        colorFilters={loadingColorFilters}
        style={{ width: size, height: size }}
        webStyle={{ width: size, height: size }}
        {...(reduced
          ? Platform.OS === 'web'
            ? { autoPlay: false, loop: false }
            : { progress: staticProgress[scene] }
          : { autoPlay: true, loop: true, speed: scene === 'loading' ? 1 : 0.86 })}
      />
      {icon ? (
        <View style={styles.icon}>
          <Ionicons
            name={icon}
            size={Math.round(size * 0.22)}
            color={scene === 'warning' ? colors.enemy : colors.success}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    position: 'absolute',
    borderWidth: 1,
  },
  topRail: {
    position: 'absolute',
    height: 3,
  },
  bottomRail: {
    position: 'absolute',
    height: 3,
  },
  icon: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
