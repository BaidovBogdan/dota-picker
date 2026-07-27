import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useReducedTransparency } from '@/hooks/use-reduced-transparency';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/app-store';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export function AttemptsChip() {
  const attempts = useAppStore((state) => state.attempts);
  const isPro = useAppStore((state) => state.session?.plan === 'pro');
  const { colors, alpha, isDark } = useAppTheme();
  const { t } = useTranslation();
  const reduceTransparency = useReducedTransparency();
  const useMaterial = Platform.OS === 'ios' && !reduceTransparency;
  const content = (
    <View
      style={{
        minHeight: 40,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: shape.round,
          backgroundColor: isPro ? colors.cobalt : colors.live,
        }}
      />
      <AppText
        variant="data"
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={{ fontSize: 13, lineHeight: 17 }}
      >
        {attempts.remaining}/{attempts.maximum}
      </AppText>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('quota.a11y', {
        remaining: attempts.remaining,
        maximum: attempts.maximum,
      })}
      onPress={() => router.push('/plans')}
      style={{
        minHeight: 40,
        minWidth: 72,
        overflow: 'hidden',
        borderWidth: 1,
        borderRadius: shape.control,
        borderColor: isDark ? alpha.bone20 : alpha.bone12,
        backgroundColor: useMaterial ? colors.transparent : alpha.iron90,
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.3 : 0.14,
        shadowRadius: 12,
        elevation: 5,
      }}
    >
      {useMaterial ? (
        <BlurView
          intensity={76}
          tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={{ backgroundColor: alpha.iron72 }}
        >
          {content}
        </BlurView>
      ) : (
        <View style={{ backgroundColor: alpha.iron90 }}>{content}</View>
      )}
    </Pressable>
  );
}
