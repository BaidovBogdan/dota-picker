import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import {
  COUNTERPICK_MARK_ANSWERS,
  COUNTERPICK_MARK_COLORS,
  COUNTERPICK_MARK_FIELD,
  COUNTERPICK_MARK_VIEW_BOX,
} from '@/components/brand/counterpick-logo';
import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/theme/use-app-theme';

const MARK_SIZE = 184;
const ASSEMBLY_DURATION = 620;
const EXIT_DURATION = 160;

const FIELD_TRAJECTORIES = [
  { x: -42, y: -52, rotation: -13, start: 0 },
  { x: -54, y: -34, rotation: 11, start: 0.025 },
  { x: -62, y: -18, rotation: -10, start: 0.05 },
  { x: -68, y: -2, rotation: 12, start: 0.075 },
  { x: -66, y: 18, rotation: -9, start: 0.1 },
  { x: -58, y: 34, rotation: 10, start: 0.125 },
  { x: -50, y: 48, rotation: -8, start: 0.15 },
  { x: -38, y: 60, rotation: 9, start: 0.175 },
  { x: -22, y: 68, rotation: -8, start: 0.2 },
  { x: -4, y: 72, rotation: 7, start: 0.225 },
  { x: 14, y: 70, rotation: -6, start: 0.25 },
  { x: 30, y: 64, rotation: 7, start: 0.275 },
  { x: 44, y: 54, rotation: -6, start: 0.3 },
  { x: 54, y: 42, rotation: 6, start: 0.325 },
  { x: 62, y: 26, rotation: -5, start: 0.35 },
  { x: 68, y: 10, rotation: 5, start: 0.375 },
] as const;

const ANSWER_TRAJECTORIES = [
  { x: 78, y: -38, rotation: 13, start: 0.14 },
  { x: 88, y: 0, rotation: -11, start: 0.22 },
  { x: 76, y: 42, rotation: 12, start: 0.3 },
] as const;

type Props = {
  appReady: boolean;
  onAssembled: () => void;
  onFinished: () => void;
};

type ShardProps = {
  path: string;
  color: string;
  progress: SharedValue<number>;
  trajectory: {
    x: number;
    y: number;
    rotation: number;
    start: number;
  };
};

export function LaunchSplash({ appReady, onAssembled, onFinished }: Props) {
  const { colors, isDark } = useAppTheme();
  const markColors = isDark ? COUNTERPICK_MARK_COLORS.dark : COUNTERPICK_MARK_COLORS.light;
  const [layoutReady, setLayoutReady] = useState(false);
  const [assembled, setAssembled] = useState(false);
  const reducedMotion = useReducedMotion();
  const assembly = useSharedValue(0);
  const surfaceOpacity = useSharedValue(1);
  const started = useRef(false);
  const exiting = useRef(false);

  const markAssembled = useCallback(() => {
    setAssembled(true);
    onAssembled();
  }, [onAssembled]);

  useEffect(() => {
    if (!layoutReady || started.current) return;
    started.current = true;

    if (reducedMotion) {
      assembly.value = 1;
      const timer = setTimeout(markAssembled, 0);
      void SplashScreen.hideAsync().catch(() => {});
      return () => clearTimeout(timer);
    } else {
      assembly.value = withTiming(
        1,
        {
          duration: ASSEMBLY_DURATION,
          easing: Easing.bezier(0.2, 0.82, 0.24, 1),
        },
        (finished) => {
          if (finished) scheduleOnRN(markAssembled);
        },
      );
    }

    void SplashScreen.hideAsync().catch(() => {});
    return undefined;
  }, [assembly, layoutReady, markAssembled, reducedMotion]);

  useEffect(() => {
    if (!started.current || reducedMotion || assembled) return;
    const fallback = setTimeout(markAssembled, ASSEMBLY_DURATION + 180);
    return () => clearTimeout(fallback);
  }, [assembled, markAssembled, reducedMotion]);

  useEffect(() => {
    if (!appReady || !assembled || exiting.current) return;
    exiting.current = true;
    if (reducedMotion) {
      onFinished();
      return;
    }

    surfaceOpacity.value = withTiming(
      0,
      {
        duration: EXIT_DURATION,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) scheduleOnRN(onFinished);
      },
    );

    const fallback = setTimeout(onFinished, EXIT_DURATION + 100);
    return () => clearTimeout(fallback);
  }, [appReady, assembled, onFinished, reducedMotion, surfaceOpacity]);

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: surfaceOpacity.value,
  }));

  const wordmarkStyle = useAnimatedStyle(() => {
    const reveal = interpolate(assembly.value, [0.66, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: reveal,
      transform: [{ translateY: interpolate(reveal, [0, 1], [8, 0]) }],
    };
  });

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Counterpick"
      onLayout={() => setLayoutReady(true)}
      style={[styles.root, { backgroundColor: colors.background }, surfaceStyle]}
    >
      <View style={styles.lockup}>
        <View style={styles.mark} pointerEvents="none">
          {COUNTERPICK_MARK_FIELD.map((path, index) => (
            <LogoShard
              key={path}
              path={path}
              color={markColors.field}
              progress={assembly}
              trajectory={FIELD_TRAJECTORIES[index] ?? FIELD_TRAJECTORIES[0]}
            />
          ))}
          {COUNTERPICK_MARK_ANSWERS.map((path, index) => (
            <LogoShard
              key={path}
              path={path}
              color={markColors.answers}
              progress={assembly}
              trajectory={ANSWER_TRAJECTORIES[index] ?? ANSWER_TRAJECTORIES[0]}
            />
          ))}
        </View>
        <Animated.View style={[styles.wordmark, wordmarkStyle]}>
          <AppText
            variant="inscription"
            maxFontSizeMultiplier={1}
            style={[styles.wordmarkText, { color: markColors.field }]}
          >
            COUNTERPICK
          </AppText>
          <View style={[styles.signal, { backgroundColor: markColors.answers }]} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function LogoShard({ path, color, progress, trajectory }: ShardProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const reveal = interpolate(
      progress.value,
      [trajectory.start, Math.min(trajectory.start + 0.58, 1)],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: reveal,
      transform: [
        { translateX: trajectory.x * (1 - reveal) },
        { translateY: trajectory.y * (1 - reveal) },
        { rotate: `${trajectory.rotation * (1 - reveal)}deg` },
        { scale: 0.82 + reveal * 0.18 },
      ],
    };
  });

  return (
    <Animated.View style={[styles.shard, animatedStyle]}>
      <Svg width={MARK_SIZE} height={MARK_SIZE} viewBox={COUNTERPICK_MARK_VIEW_BOX}>
        <Path d={path} fill={color} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: {
    alignItems: 'center',
  },
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  shard: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  wordmark: {
    marginTop: 12,
    alignItems: 'center',
  },
  wordmarkText: {
    fontSize: 23,
    lineHeight: 27,
    letterSpacing: 2.4,
  },
  signal: {
    width: 28,
    height: 3,
    marginTop: 10,
  },
});
