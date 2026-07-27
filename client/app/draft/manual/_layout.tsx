import { Stack } from 'expo-router';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { nativeHeaderOptions } from '@/navigation/native-header';
import { useAppTheme } from '@/theme/use-app-theme';

export default function ManualDraftLayout() {
  const reducedMotion = useReducedMotion();
  const { colors } = useAppTheme();

  return (
    <Stack
      screenOptions={{
        ...nativeHeaderOptions(colors),
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitleEnabled: false,
        headerTitleAlign: 'center',
        freezeOnBlur: true,
        animation: reducedMotion ? 'none' : 'default',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="allies" />
      <Stack.Screen name="rank" />
      <Stack.Screen name="role" />
    </Stack>
  );
}
