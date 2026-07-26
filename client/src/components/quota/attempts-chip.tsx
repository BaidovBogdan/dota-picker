import { router } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/app-store';
import { useAppTheme } from '@/theme/use-app-theme';

export function AttemptsChip() {
  const attempts = useAppStore((state) => state.attempts);
  const isPro = useAppStore((state) => state.session?.plan === 'pro');
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t('quota.a11y', {
        remaining: attempts.remaining,
        maximum: attempts.maximum,
      })}
      activeOpacity={0.72}
      onPress={() => router.push('/plans')}
      style={{
        minHeight: 40,
        paddingHorizontal: 11,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ width: 6, height: 6, backgroundColor: isPro ? colors.cobalt : colors.live }} />
      <AppText
        variant="data"
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={{ fontSize: 13, lineHeight: 17 }}
      >
        {attempts.remaining}/{attempts.maximum}
      </AppText>
    </TouchableOpacity>
  );
}
