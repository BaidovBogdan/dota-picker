import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { memo, useCallback } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { useTranslation } from '@/i18n';
import { layout } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

const specs = [
  {
    routeName: 'index',
    number: '01',
    labelKey: 'nav.draft',
    a11yKey: 'nav.draftA11y',
    icon: 'scan-outline',
  },
  {
    routeName: 'history',
    number: '02',
    labelKey: 'nav.history',
    a11yKey: 'nav.historyA11y',
    icon: 'time-outline',
  },
  {
    routeName: 'profile',
    number: '03',
    labelKey: 'nav.profile',
    a11yKey: 'nav.profileA11y',
    icon: 'person-outline',
  },
] as const;

export const DotaTabBar = memo(function DotaTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const barWidth = Math.min(width, layout.contentMaxWidth);
  const visibleTabs = specs.flatMap((spec) => {
    const route = state.routes.find((item) => item.name === spec.routeName);
    return route ? [{ ...spec, route }] : [];
  });

  const commit = useCallback(
    (index: number) => {
      const item = visibleTabs[index];
      if (!item) return;
      const isFocused = state.routes[state.index]?.key === item.route.key;
      const event = navigation.emit({
        type: 'tabPress',
        target: item.route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        Haptics.selectionAsync().catch(() => {});
        navigation.navigate(item.route.name, item.route.params);
      }
    },
    [navigation, state.index, state.routes, visibleTabs],
  );

  return (
    <View
      style={{
        position: 'absolute',
        left: (width - barWidth) / 2,
        width: barWidth,
        bottom: 0,
        height: layout.tabBarHeight + insets.bottom,
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderTopWidth: 2,
        borderColor: colors.outline,
        zIndex: 50,
      }}
    >
      {visibleTabs.map((item, index) => {
        const isFocused = state.routes[state.index]?.key === item.route.key;
        const options = descriptors[item.route.key]?.options;
        return (
          <Pressable
            key={item.route.key}
            accessibilityRole="tab"
            accessibilityLabel={options?.tabBarAccessibilityLabel ?? t(item.a11yKey)}
            accessibilityState={{ selected: isFocused }}
            testID={options?.tabBarButtonTestID}
            onPress={() => commit(index)}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: layout.tabBarHeight + insets.bottom,
              paddingHorizontal: 8,
              paddingTop: 5,
              paddingBottom: 5 + insets.bottom,
              justifyContent: 'space-between',
              backgroundColor: isFocused ? colors.ink : colors.surface,
              borderLeftWidth: index === 0 ? 0 : 1,
              borderColor: colors.outline,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <AppText
                variant="data"
                color={isFocused ? colors.paper : colors.textMuted}
                maxFontSizeMultiplier={1.1}
              >
                {item.number}
              </AppText>
              <TabIcon
                active={isFocused}
                icon={item.icon}
                color={isFocused ? colors.paper : colors.textMuted}
              />
            </View>
            <AppText
              variant="inscription"
              color={isFocused ? colors.paper : colors.textMuted}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              maxFontSizeMultiplier={1.1}
              style={{ width: '100%', flexShrink: 1, fontSize: 14, lineHeight: 17 }}
            >
              {t(item.labelKey)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
});

const TabIcon = memo(function TabIcon({
  active,
  icon,
  color,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        width: 30,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 15,
        backgroundColor: active ? colors.cobalt : colors.transparent,
      }}
    >
      <Ionicons name={icon} size={21} color={active ? '#FFFFFF' : color} />
    </View>
  );
});
