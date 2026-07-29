import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { Oswald_600SemiBold } from '@expo-google-fonts/oswald/600SemiBold';
import { Oswald_700Bold } from '@expo-google-fonts/oswald/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Appearance, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BootstrapGate } from '@/components/bootstrap-gate';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { AppProviders } from '@/providers/app-providers';
import { AppThemeProvider, useAppTheme } from '@/theme/use-app-theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 180, fade: true });

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <ThemedRootLayout />
    </AppThemeProvider>
  );
}

function ThemedRootLayout() {
  const [fonts, fontError] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    Oswald_600SemiBold,
    Oswald_700Bold,
    IBMPlexMono_500Medium,
  });
  const fontsReady = fonts || Boolean(fontError);
  const reducedMotion = useReducedMotion();
  const { colors, isDark, mode, resolvedMode } = useAppTheme();
  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.cobalt,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.outline,
        notification: colors.live,
      },
    };
  }, [colors, isDark]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(mode === 'system' ? 'unspecified' : resolvedMode);
    }
  }, [mode, resolvedMode]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.iron }}>
      <ThemeProvider value={navigationTheme}>
        <AppProviders>
          <BootstrapGate fontsReady={fontsReady}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShown: false,
                freezeOnBlur: true,
                contentStyle: { backgroundColor: colors.iron },
                animation: reducedMotion ? 'none' : 'fade_from_bottom',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="wishlist"
                options={{
                  headerShown: true,
                  animation: reducedMotion ? 'none' : 'slide_from_right',
                }}
              />
              <Stack.Screen
                name="meta"
                options={{
                  headerShown: false,
                  animation: reducedMotion ? 'none' : 'slide_from_right',
                }}
              />
              <Stack.Screen
                name="hero/[id]"
                options={{
                  headerShown: true,
                  animation: reducedMotion ? 'none' : 'slide_from_right',
                }}
              />
              <Stack.Screen
                name="draft/manual"
                options={{
                  presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal',
                  headerShown: false,
                  sheetAllowedDetents: [1],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: true,
                  gestureEnabled: true,
                  animation: reducedMotion ? 'none' : 'default',
                  contentStyle: { backgroundColor: colors.background },
                }}
              />
              <Stack.Screen
                name="hero-select"
                options={{
                  presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal',
                  headerShown: true,
                  sheetAllowedDetents: [0.72, 1],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: true,
                  gestureEnabled: true,
                  contentStyle: { backgroundColor: colors.background },
                }}
              />
              <Stack.Screen
                name="photo-review"
                options={{ animation: reducedMotion ? 'none' : 'slide_from_right' }}
              />
              <Stack.Screen
                name="analysis"
                options={{ gestureEnabled: false, animation: reducedMotion ? 'none' : 'fade' }}
              />
              <Stack.Screen
                name="result/[id]"
                options={{ animation: reducedMotion ? 'none' : 'slide_from_right' }}
              />
              <Stack.Screen
                name="feedback/[analysisId]"
                options={{
                  presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal',
                  headerShown: true,
                  sheetAllowedDetents: [0.72, 1],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: true,
                  gestureEnabled: true,
                  contentStyle: { backgroundColor: colors.background },
                }}
              />
              <Stack.Screen
                name="auth"
                options={{
                  presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal',
                  headerShown: true,
                  sheetAllowedDetents: [1],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: false,
                  gestureEnabled: true,
                  contentStyle: { backgroundColor: colors.background },
                }}
              />
              <Stack.Screen
                name="change-password"
                options={{
                  presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal',
                  headerShown: true,
                  sheetAllowedDetents: [0.72, 1],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: true,
                  gestureEnabled: true,
                  contentStyle: { backgroundColor: colors.background },
                }}
              />
              <Stack.Screen
                name="plans"
                options={{
                  presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal',
                  headerShown: true,
                  sheetAllowedDetents: [1],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: false,
                  gestureEnabled: true,
                  contentStyle: { backgroundColor: colors.background },
                }}
              />
              <Stack.Screen
                name="native-large-title"
                options={{
                  headerShown: true,
                  animation: reducedMotion ? 'none' : 'slide_from_right',
                }}
              />
              <Stack.Screen
                name="native-sheet-demo"
                options={{
                  presentation: 'formSheet',
                  headerShown: false,
                  sheetAllowedDetents: [0.55, 1],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: true,
                  gestureEnabled: true,
                  contentStyle: { backgroundColor: colors.surface },
                }}
              />
            </Stack>
          </BootstrapGate>
        </AppProviders>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
