import * as Haptics from 'expo-haptics';
import { ScrollView, TouchableOpacity } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { positions } from '@/data/options';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/app-store';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export function PositionPicker() {
  const selected = useAppStore((state) => state.draft.position);
  const setPosition = useAppStore((state) => state.setPosition);
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {positions.map((position) => {
        const active = position.id === selected;
        const label = t(`position.${position.id}`);
        return (
          <TouchableOpacity
            key={position.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${position.short}, ${label}`}
            activeOpacity={0.75}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setPosition(position.id);
            }}
            style={{
              minHeight: 58,
              minWidth: 82,
              paddingHorizontal: 12,
              paddingVertical: 8,
              justifyContent: 'center',
              backgroundColor: active ? colors.cobalt : colors.surface,
              borderWidth: 2,
              borderRadius: shape.compact,
              borderColor: active ? colors.cobalt : colors.outline,
            }}
          >
            <AppText variant="data" color={active ? '#FFFFFF' : colors.textMuted}>
              {position.short}
            </AppText>
            <AppText variant="caption" color={active ? '#FFFFFF' : colors.text} numberOfLines={1}>
              {label}
            </AppText>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
