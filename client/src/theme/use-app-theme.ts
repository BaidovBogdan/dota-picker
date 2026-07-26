import { useColorScheme } from 'react-native';

import { useAppStore } from '@/store/app-store';
import { themes } from '@/theme/tokens';

export function useAppTheme() {
  const mode = useAppStore((state) => state.themeMode);
  const systemMode = useColorScheme();
  const resolvedMode = mode === 'system' ? (systemMode === 'dark' ? 'dark' : 'light') : mode;
  return { mode, resolvedMode, isDark: resolvedMode === 'dark', ...themes[resolvedMode] };
}
