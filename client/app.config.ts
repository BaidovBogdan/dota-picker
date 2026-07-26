import type { ExpoConfig } from 'expo/config';

const isProduction = process.env.EAS_BUILD_PROFILE === 'production';
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
if (isProduction && !apiUrl) throw new Error('EXPO_PUBLIC_API_URL is required for production');
if (
  isProduction &&
  (!process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ||
    !process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY)
) {
  throw new Error('RevenueCat iOS and Android API keys are required for production');
}

const config: ExpoConfig = {
  name: 'Counterpick',
  slug: 'dota-picker',
  version: '0.1.0',
  icon: './assets/brand/app-icon-modern-v4.png',
  orientation: 'portrait',
  scheme: 'counterpick',
  userInterfaceStyle: 'automatic',
  locales: {
    ru: './languages/ru.json',
    en: './languages/en.json',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.counterpick.mobile',
    infoPlist: {
      CFBundleAllowMixedLocalizations: true,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/brand/app-icon-modern-v4.png',
      backgroundColor: '#2049D8',
    },
    package: 'app.counterpick.mobile',
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-localization',
    [
      'expo-splash-screen',
      {
        image: './assets/brand/app-icon-modern-v4.png',
        imageWidth: 164,
        backgroundColor: '#F1F0E8',
        dark: {
          image: './assets/brand/app-icon-modern-v4.png',
          backgroundColor: '#101112',
        },
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Counterpick to select a draft screenshot and recognize heroes.',
        cameraPermission: 'Allow Counterpick to photograph a draft and recognize heroes.',
        microphonePermission: false,
      },
    ],
    'expo-secure-store',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    apiUrl: apiUrl ?? 'http://localhost:4000/v1',
  },
};

export default config;
