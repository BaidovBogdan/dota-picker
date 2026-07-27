import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useAppStore } from '@/store/app-store';
import { themes } from '@/theme/tokens';

type ResolvedMode = keyof typeof themes;

type AppThemeContextValue = {
  mode: 'system' | ResolvedMode;
  resolvedMode: ResolvedMode;
  isDark: boolean;
} & (typeof themes)[ResolvedMode];

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const mode = useAppStore((state) => state.themeMode);
  const systemMode = useColorScheme();
  const resolvedMode = mode === 'system' ? (systemMode === 'dark' ? 'dark' : 'light') : mode;
  const value = useMemo<AppThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      isDark: resolvedMode === 'dark',
      ...themes[resolvedMode],
    }),
    [mode, resolvedMode],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error('AppThemeProvider is missing');
  return value;
}
