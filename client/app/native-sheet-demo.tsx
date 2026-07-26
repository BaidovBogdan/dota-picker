import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { useTranslation } from '@/i18n';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

const positions = [1, 2, 3, 4, 5] as const;
const ranks = [3, 5, 7] as const;

export default function NativeSheetDemoScreen() {
  const [position, setPosition] = useState<(typeof positions)[number]>(2);
  const [rank, setRank] = useState<(typeof ranks)[number]>(5);
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 22, paddingBottom: 72 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
          <AppText variant="data" color={colors.live}>
            FORM SHEET · 0.55 / 1.00
          </AppText>
          <AppText variant="display" style={{ marginTop: 5 }}>
            {t('nativeTest.sheetTitle')}
          </AppText>
        </View>
        <IconButton name="close" label={t('nativeTest.sheetClose')} onPress={close} size={46} />
      </View>

      <AppText variant="body" color={colors.textMuted} style={{ maxWidth: 520, marginTop: 14 }}>
        {t('nativeTest.sheetBody')}
      </AppText>

      <View
        style={{
          marginTop: 24,
          paddingTop: 12,
          borderTopWidth: 2,
          borderColor: colors.outline,
        }}
      >
        <AppText variant="inscription">{t('nativeTest.sheetSection')}</AppText>

        <AppText variant="data" color={colors.textMuted} style={{ marginTop: 18 }}>
          {t('nativeTest.sheetRole')}
        </AppText>
        <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {positions.map((item) => {
            const active = item === position;
            return (
              <TouchableOpacity
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                activeOpacity={0.74}
                onPress={() => setPosition(item)}
                style={{
                  width: 52,
                  height: 48,
                  borderRadius: shape.control,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: active ? colors.cobalt : colors.outline,
                  backgroundColor: active ? colors.cobalt : colors.background,
                }}
              >
                <AppText variant="data" color={active ? '#FFFFFF' : colors.text}>
                  P{item}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        <AppText variant="data" color={colors.textMuted} style={{ marginTop: 22 }}>
          {t('nativeTest.sheetRank')}
        </AppText>
        <View style={{ marginTop: 8, gap: 8 }}>
          {ranks.map((item) => {
            const active = item === rank;
            return (
              <TouchableOpacity
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                activeOpacity={0.74}
                onPress={() => setRank(item)}
                style={{
                  minHeight: 58,
                  paddingHorizontal: 14,
                  borderRadius: shape.control,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 2,
                  borderColor: active ? colors.cobalt : colors.outline,
                  backgroundColor: active ? colors.cobalt : colors.background,
                }}
              >
                <AppText variant="title" color={active ? '#FFFFFF' : colors.text}>
                  {t(`rank.${item}`)}
                </AppText>
                <View style={{ flex: 1 }} />
                <AppText variant="data" color={active ? '#FFFFFF' : colors.textMuted}>
                  0{item}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
