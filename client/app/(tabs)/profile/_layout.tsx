import { Stack } from 'expo-router';

import { nativeHeaderOptions, nativeLargeHeaderOptions } from '@/navigation/native-header';
import { useAppTheme } from '@/theme/use-app-theme';

export default function ProfileLayout() {
  const { colors } = useAppTheme();

  return (
    <Stack screenOptions={nativeHeaderOptions(colors)}>
      <Stack.Screen
        name="index"
        options={{ ...nativeLargeHeaderOptions(colors), headerLargeTitleEnabled: true }}
      />
      <Stack.Screen name="reviews" options={{ headerLargeTitleEnabled: true }} />
      <Stack.Screen name="lottie-lab" options={{ headerLargeTitleEnabled: false }} />
      <Stack.Screen name="loader-preview" options={{ headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
