import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ComponentProps, ReactNode, useCallback } from 'react';
import { StyleProp, TouchableOpacity, View, ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useTranslation } from '@/i18n';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Tone = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dota';
type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress: () => void;
  tone?: Tone;
  icon?: IconName;
  trailing?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({
  label,
  onPress,
  tone = 'primary',
  icon,
  trailing,
  disabled = false,
  loading = false,
  style,
  accessibilityHint,
  testID,
}: Props) {
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const palette: Record<Tone, { background: string; border: string; foreground: string }> = {
    primary: {
      background: colors.cobalt,
      border: colors.cobalt,
      foreground: '#FFFFFF',
    },
    secondary: {
      background: colors.surface,
      border: colors.outline,
      foreground: colors.text,
    },
    ghost: {
      background: colors.transparent,
      border: colors.transparent,
      foreground: colors.text,
    },
    danger: {
      background: colors.live,
      border: colors.live,
      foreground: '#FFFFFF',
    },
    dota: {
      background: colors.cobalt,
      border: colors.cobalt,
      foreground: '#FFFFFF',
    },
  };
  const current = palette[tone];
  const isDisabled = disabled || loading;
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }, [onPress]);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      activeOpacity={0.78}
      testID={testID}
      disabled={isDisabled}
      onPress={handlePress}
      style={[
        {
          minHeight: 54,
          paddingHorizontal: 16,
          backgroundColor: current.background,
          borderColor: current.border,
          borderWidth: tone === 'ghost' ? 0 : 2,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          borderRadius: shape.control,
          opacity: isDisabled ? 0.42 : 1,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {tone === 'dota' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: 5,
            backgroundColor: colors.live,
          }}
        />
      ) : null}
      {icon ? <Ionicons name={icon} size={20} color={current.foreground} /> : null}
      <AppText
        variant="inscription"
        color={current.foreground}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        style={{ flexShrink: 1, textAlign: 'center', fontSize: 18, lineHeight: 21 }}
      >
        {loading ? t('common.loading') : label}
      </AppText>
      {trailing}
      {tone === 'secondary' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 8,
            top: 8,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: alpha.bone20,
          }}
        />
      ) : null}
    </TouchableOpacity>
  );
}
