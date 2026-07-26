import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { ComponentProps, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Props = {
  label: string;
  onPress: () => void;
  icon?: ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  testID?: string;
  bottomOffset?: number;
};

export const FLOATING_ACTION_BAR_BOTTOM_INSET = 112;

export function FloatingActionBar({
  label,
  onPress,
  icon,
  disabled,
  loading,
  accessibilityHint,
  testID,
  bottomOffset = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors, alpha, isDark } = useAppTheme();
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const horizontalGutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const useMaterial = Platform.OS === 'ios' && !reduceTransparency;
  const content = (
    <View style={{ padding: 9 }}>
      <Button
        label={label}
        onPress={onPress}
        tone="dota"
        style={{ minHeight: 58 }}
        {...(icon ? { icon } : {})}
        {...(disabled === undefined ? {} : { disabled })}
        {...(loading === undefined ? {} : { loading })}
        {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
        {...(testID === undefined ? {} : { testID })}
      />
    </View>
  );

  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then(setReduceTransparency)
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );
    return () => subscription.remove();
  }, []);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: bottomOffset,
        zIndex: 100,
        elevation: 20,
      }}
    >
      <View
        pointerEvents="box-none"
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: horizontalGutter,
          paddingBottom: insets.bottom + 10,
        }}
      >
        <View
          style={{
            borderRadius: shape.feature,
            backgroundColor: colors.surface,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: -5 },
            shadowOpacity: isDark ? 0.42 : 0.2,
            shadowRadius: 14,
            elevation: 14,
          }}
        >
          <View
            style={{
              overflow: 'hidden',
              borderRadius: shape.feature,
              borderWidth: 2,
              borderColor: colors.outline,
              backgroundColor: colors.surface,
            }}
          >
            {useMaterial ? (
              <BlurView
                intensity={82}
                tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
                style={{ backgroundColor: alpha.iron72 }}
              >
                {content}
              </BlurView>
            ) : (
              <View style={{ backgroundColor: colors.surface }}>{content}</View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
