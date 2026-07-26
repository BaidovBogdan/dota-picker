import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ComponentProps } from 'react';
import { TouchableOpacity } from 'react-native';

import { layout } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Props = {
  name: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
};

export function IconButton({ name, label, onPress, size = 48, disabled = false }: Props) {
  const { colors } = useAppTheme();
  const hitInset = Math.max(4, Math.ceil((layout.minTouch - size) / 2));
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      activeOpacity={0.72}
      disabled={disabled}
      hitSlop={hitInset}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size / 2,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        borderColor: colors.outline,
        opacity: disabled ? 0.42 : 1,
      }}
    >
      <Ionicons name={name} size={21} color={colors.text} />
    </TouchableOpacity>
  );
}
