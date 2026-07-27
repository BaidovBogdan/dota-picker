import { Stack } from 'expo-router';

import { nativeLargeHeaderOptions } from '@/navigation/native-header';
import { useAppTheme } from '@/theme/use-app-theme';

export default function MetaLayout() {
  const { colors } = useAppTheme();

  return (
    <Stack screenOptions={{ ...nativeLargeHeaderOptions(colors), headerLargeTitleEnabled: true }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
