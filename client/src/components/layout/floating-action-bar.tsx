import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { ComponentProps } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useReducedTransparency } from '@/hooks/use-reduced-transparency';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Props = {
  label: string;
  onPress: () => void;
  icon?: ComponentProps<typeof Ionicons>['name'];
  secondaryAction?: {
    label: string;
    onPress: () => void;
    icon?: ComponentProps<typeof Ionicons>['name'];
    disabled?: boolean;
    iconOnly?: boolean;
  };
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  testID?: string;
  bottomOffset?: number;
  fullWidth?: boolean;
  appearance?: 'default' | 'transparentGlass';
};

export const FLOATING_ACTION_BAR_BOTTOM_INSET = 112;

export function FloatingActionBar({
  label,
  onPress,
  icon,
  secondaryAction,
  disabled,
  loading,
  accessibilityHint,
  testID,
  bottomOffset = 0,
  fullWidth = false,
  appearance = 'default',
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors, alpha, isDark } = useAppTheme();
  const reduceTransparency = useReducedTransparency();
  const horizontalGutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const useMaterial = Platform.OS === 'ios' && !reduceTransparency;
  const transparentGlass = appearance === 'transparentGlass';
  const compactSecondary = secondaryAction?.iconOnly === true;
  const fallbackGlass = isDark ? 'rgba(16, 17, 18, 0.82)' : 'rgba(248, 247, 241, 0.84)';
  const content = (
    <View
      style={{
        padding: transparentGlass ? 7 : 9,
        flexDirection: secondaryAction ? 'row' : 'column',
        alignItems: compactSecondary ? 'center' : 'stretch',
        gap: secondaryAction ? 8 : 0,
      }}
    >
      {compactSecondary ? <View pointerEvents="none" style={{ width: 54, height: 1 }} /> : null}
      <Button
        label={label}
        onPress={onPress}
        tone={transparentGlass ? 'ghost' : 'dota'}
        style={{ minHeight: 58, flex: secondaryAction ? 1 : undefined }}
        {...(icon ? { icon } : {})}
        {...(disabled === undefined ? {} : { disabled })}
        {...(loading === undefined ? {} : { loading })}
        {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
        {...(testID === undefined ? {} : { testID })}
      />
      {secondaryAction ? (
        <Button
          label={secondaryAction.label}
          onPress={secondaryAction.onPress}
          tone="secondary"
          style={
            compactSecondary
              ? { width: 54, minHeight: 54, flex: undefined }
              : { minHeight: 58, flex: 1 }
          }
          iconOnly={compactSecondary}
          {...(secondaryAction.icon ? { icon: secondaryAction.icon } : {})}
          {...(secondaryAction.disabled === undefined
            ? {}
            : { disabled: secondaryAction.disabled })}
        />
      ) : null}
    </View>
  );

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
          paddingHorizontal: fullWidth ? 0 : horizontalGutter,
          paddingBottom: insets.bottom + 10,
        }}
      >
        {transparentGlass ? (
          <View
            style={{
              overflow: 'hidden',
              borderRadius: shape.feature,
              backgroundColor: useMaterial ? colors.transparent : fallbackGlass,
            }}
          >
            {useMaterial ? (
              <BlurView
                intensity={48}
                tint={isDark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
                style={{
                  backgroundColor: isDark ? 'rgba(16, 17, 18, 0.16)' : 'rgba(248, 247, 241, 0.12)',
                }}
              >
                {content}
              </BlurView>
            ) : (
              <View style={{ backgroundColor: fallbackGlass }}>{content}</View>
            )}
          </View>
        ) : (
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
        )}
      </View>
    </View>
  );
}
