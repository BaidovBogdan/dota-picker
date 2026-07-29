import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { positions } from '@/data/options';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/app-store';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { Position } from '@/types/domain';

export function PositionPicker({
  contained = false,
  onSelect,
}: {
  contained?: boolean;
  onSelect?: (position: Position) => void;
}) {
  const selected = useAppStore((state) => state.draft.position);
  const setPosition = useAppStore((state) => state.setPosition);
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const horizontalGutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: contained ? 0 : -horizontalGutter }}
      contentContainerStyle={{
        gap: 8,
        paddingHorizontal: contained ? 0 : horizontalGutter,
      }}
    >
      {positions.map((position) => {
        const active = position.id === selected;
        const label = t(`position.${position.id}`);
        return (
          <Pressable
            key={position.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${position.short}, ${label}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setPosition(position.id);
              onSelect?.(position.id);
            }}
            style={{
              minHeight: 58,
              minWidth: 82,
              paddingHorizontal: 12,
              paddingVertical: 8,
              justifyContent: 'center',
              backgroundColor: active ? colors.cobalt : colors.surface,
              borderWidth: 2,
              borderRadius: shape.control,
              borderColor: active ? colors.cobalt : colors.outline,
            }}
          >
            <AppText variant="data" color={active ? '#FFFFFF' : colors.textMuted}>
              {position.short}
            </AppText>
            <AppText variant="caption" color={active ? '#FFFFFF' : colors.text} numberOfLines={1}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
