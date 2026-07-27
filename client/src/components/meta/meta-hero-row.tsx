import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';
import { motion, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { Hero } from '@/types/domain';

const editTransitionDuration = 200;
const selectedFillDuration = 210;
const deselectedFillDuration = 150;
const editTransitionEasing = Easing.bezier(0.42, 0, 0.58, 1);

type MetaHeroRowProps = {
  hero: Hero;
  index?: number;
  onPress?: (hero: Hero) => void;
  showHeart?: boolean;
  wishlisted?: boolean;
  onToggleWishlist?: (hero: Hero) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelection?: (hero: Hero) => void;
};

export const MetaHeroRow = memo(function MetaHeroRow({
  hero,
  index,
  onPress,
  showHeart = false,
  wishlisted = false,
  onToggleWishlist,
  selectionMode = false,
  selected = false,
  onToggleSelection,
}: MetaHeroRowProps) {
  const reducedMotion = useReducedMotion();
  const selectionProgress = useSharedValue(selectionMode ? 1 : 0);
  const selectedProgress = useSharedValue(selected ? 1 : 0);
  const checkScale = useSharedValue(1);
  const previousSelectionMode = useRef({ heroId: hero.id, value: selectionMode });
  const previousSelected = useRef({ heroId: hero.id, value: selected });
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const roleLabel = useMemo(
    () =>
      hero.positions
        .slice(0, 3)
        .map((position) => `P${position}`)
        .join(' · '),
    [hero.positions],
  );

  useEffect(() => {
    const previous = previousSelectionMode.current;
    const changed = previous.heroId === hero.id && previous.value !== selectionMode;
    previousSelectionMode.current = { heroId: hero.id, value: selectionMode };
    cancelAnimation(selectionProgress);
    if (reducedMotion || !changed) {
      selectionProgress.value = selectionMode ? 1 : 0;
      return;
    }
    selectionProgress.value = withTiming(selectionMode ? 1 : 0, {
      duration: editTransitionDuration,
      easing: editTransitionEasing,
      reduceMotion: ReduceMotion.System,
    });
    return () => cancelAnimation(selectionProgress);
  }, [hero.id, reducedMotion, selectionMode, selectionProgress]);

  useEffect(() => {
    const previous = previousSelected.current;
    const changed = previous.heroId === hero.id && previous.value !== selected;
    previousSelected.current = { heroId: hero.id, value: selected };
    cancelAnimation(selectedProgress);
    cancelAnimation(checkScale);
    if (reducedMotion || !changed) {
      selectedProgress.value = selected ? 1 : 0;
      checkScale.value = 1;
      return;
    }
    selectedProgress.value = withTiming(selected ? 1 : 0, {
      duration: selected ? selectedFillDuration : deselectedFillDuration,
      easing: selected ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
    if (selected) {
      checkScale.value = 1;
      checkScale.value = withSequence(
        withTiming(0.9, {
          duration: 80,
          easing: Easing.in(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        }),
        withTiming(1.1, {
          duration: 130,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        }),
        withTiming(1, {
          duration: 100,
          easing: Easing.inOut(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        }),
      );
    } else {
      checkScale.value = withTiming(0.9, {
        duration: deselectedFillDuration,
        easing: Easing.in(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      });
    }
    return () => {
      cancelAnimation(selectedProgress);
      cancelAnimation(checkScale);
    };
  }, [checkScale, hero.id, reducedMotion, selected, selectedProgress]);

  const selectionIndicatorStyle = useAnimatedStyle(() => ({
    opacity: selectionProgress.value,
    transform: [{ translateX: (1 - selectionProgress.value) * -13 }],
  }));
  const selectionCircleStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      selectedProgress.value,
      [0, 1],
      [colors.textMuted, colors.cobalt],
    ),
    backgroundColor: interpolateColor(
      selectedProgress.value,
      [0, 1],
      [colors.surface, colors.cobalt],
    ),
  }));
  const selectionCheckStyle = useAnimatedStyle(() => ({
    opacity: selectedProgress.value,
    transform: [{ scale: checkScale.value }],
  }));
  const rowStyle = useAnimatedStyle(() => ({
    left: selectionProgress.value * 52,
  }));
  const selectedMaterialStyle = useAnimatedStyle(() => ({
    opacity: selectedProgress.value * (isDark ? 0.14 : 0.09),
  }));
  const trailingStyle = useAnimatedStyle(() => ({
    opacity: 1 - selectionProgress.value,
    transform: [{ translateX: selectionProgress.value * 13 }],
  }));

  const handleRowPress = () => {
    if (selectionMode) {
      onToggleSelection?.(hero);
      return;
    }
    onPress?.(hero);
  };

  return (
    <View style={{ minHeight: 76, justifyContent: 'center', overflow: 'hidden' }}>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: 11 }, selectionIndicatorStyle]}
      >
        <Animated.View
          style={[
            {
              width: 26,
              height: 26,
              borderRadius: 13,
              borderWidth: 2,
              alignItems: 'center',
              justifyContent: 'center',
            },
            selectionCircleStyle,
          ]}
        >
          <Animated.View style={selectionCheckStyle}>
            <Ionicons name="checkmark" size={17} color="#FFFFFF" />
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 2,
            right: 0,
            bottom: 2,
            left: 0,
            borderWidth: 1,
            borderRadius: shape.control,
            borderColor: colors.outline,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          },
          rowStyle,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: colors.cobalt,
            },
            selectedMaterialStyle,
          ]}
        />
        <Pressable
          accessibilityRole={selectionMode ? 'checkbox' : 'button'}
          accessibilityLabel={hero.name}
          accessibilityState={selectionMode ? { checked: selected } : undefined}
          onPress={handleRowPress}
          style={{
            minHeight: 72,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          {typeof index === 'number' ? (
            <View
              style={{
                width: 28,
                alignSelf: 'stretch',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 7,
                borderRightWidth: 1,
                borderColor: colors.outline,
              }}
            >
              <AppText variant="data" color={colors.textMuted} style={{ fontSize: 9 }}>
                {String(index + 1).padStart(2, '0')}
              </AppText>
            </View>
          ) : null}
          <Image
            source={{ uri: hero.imageUrl }}
            contentFit="cover"
            cachePolicy="disk"
            enforceEarlyResizing
            recyclingKey={String(hero.id)}
            transition={0}
            style={{
              width: 54,
              height: 54,
              borderRadius: shape.media,
              backgroundColor: colors.surfaceElevated,
            }}
          />
          <View style={{ flex: 1, minWidth: 0, marginLeft: 11 }}>
            <AppText
              variant="inscription"
              numberOfLines={1}
              style={{ fontSize: 18, lineHeight: 22 }}
            >
              {hero.name}
            </AppText>
            <View style={{ marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <AppText variant="data" color={colors.cobalt} style={{ fontSize: 9 }}>
                {roleLabel || t('nativeTest.roleUnknown')}
              </AppText>
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.live,
                }}
              />
              <AppText variant="caption" color={colors.textMuted} style={{ fontSize: 11 }}>
                {typeof hero.winRate === 'number' ? `${(hero.winRate * 100).toFixed(1)}%` : '—'}
              </AppText>
            </View>
          </View>

          <Animated.View pointerEvents={selectionMode ? 'none' : 'auto'} style={trailingStyle}>
            {showHeart ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(wishlisted ? 'wishlist.removeOne' : 'wishlist.addOne')}
                hitSlop={8}
                onPress={() => onToggleWishlist?.(hero)}
                style={{
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <WishlistHeart
                  active={wishlisted}
                  activeColor={colors.live}
                  inactiveColor={colors.textMuted}
                  reducedMotion={reducedMotion}
                />
              </Pressable>
            ) : (
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceElevated,
                }}
              >
                <Ionicons name="arrow-forward" size={17} color={colors.text} />
              </View>
            )}
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
});

function WishlistHeart({
  active,
  activeColor,
  inactiveColor,
  reducedMotion,
}: {
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    cancelAnimation(progress);
    if (reducedMotion) {
      progress.value = active ? 1 : 0;
      return;
    }
    progress.value = withTiming(active ? 1 : 0, {
      duration: motion.standard,
      reduceMotion: ReduceMotion.System,
    });
    return () => cancelAnimation(progress);
  }, [active, progress, reducedMotion]);

  const outlineStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.78]) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      {
        scale: interpolate(progress.value, [0, 0.65, 1], [0.58, 1.14, 1]),
      },
    ],
  }));

  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute' }, outlineStyle]}>
        <Ionicons name="heart-outline" size={22} color={inactiveColor} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute' }, fillStyle]}>
        <Ionicons name="heart" size={22} color={activeColor} />
      </Animated.View>
    </View>
  );
}
