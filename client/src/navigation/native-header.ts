import { Platform } from 'react-native';

type HeaderColors = {
  background: string;
  text: string;
};

export const nativeHeaderOptions = (colors: HeaderColors) =>
  ({
    headerShown: true,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerTransparent: Platform.OS === 'ios',
    headerTintColor: colors.text,
    headerStyle: {
      backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background,
    },
    headerLargeStyle: {
      backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background,
    },
    headerTitleStyle: { color: colors.text },
    headerLargeTitleStyle: { color: colors.text },
    scrollEdgeEffects: { top: 'soft' },
  }) as const;

export const nativeLargeHeaderOptions = (colors: HeaderColors) =>
  ({
    ...nativeHeaderOptions(colors),
    headerTransparent: false,
    headerStyle: { backgroundColor: colors.background },
    headerLargeStyle: { backgroundColor: colors.background },
  }) as const;
