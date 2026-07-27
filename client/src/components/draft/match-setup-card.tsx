import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, View } from 'react-native';

import { PositionPicker } from '@/components/draft/position-picker';
import { AppText } from '@/components/ui/app-text';
import { ranks } from '@/data/options';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/app-store';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export function MatchSetupCard() {
  const draft = useAppStore((state) => state.draft);
  const setRank = useAppStore((state) => state.setRank);
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: shape.feature,
        backgroundColor: colors.surfaceElevated,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          minHeight: 58,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.ink,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.cobalt,
          }}
        >
          <Ionicons name="options-outline" size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="data" color={colors.live}>
            {t('home.matchSetupEyebrow')}
          </AppText>
          <AppText variant="inscription" color={colors.paper} style={{ fontSize: 18 }}>
            {t('home.matchSetup')}
          </AppText>
        </View>
        <AppText variant="data" color={colors.paper} style={{ fontSize: 9 }}>
          {draft.position ? `P${draft.position}` : '—'} / {t(draft.rank ? `rank.${draft.rank}` : 'rank.any')}
        </AppText>
      </View>

      <View style={{ padding: 12 }}>
        <View
          style={{
            marginBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <AppText variant="data" color={colors.cobalt}>
            01 · {t('position.title')}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {t('home.yourRole')}
          </AppText>
        </View>
        <PositionPicker contained />
      </View>

      <View
        style={{
          height: 1,
          marginHorizontal: 12,
          backgroundColor: alpha.bone20,
        }}
      />

      <View style={{ padding: 12 }}>
        <View
          style={{
            marginBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <AppText variant="data" color={colors.live}>
            02 · {t('rank.title')}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {t('home.rank')}
          </AppText>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {ranks.map((rank) => {
            const active = draft.rank === rank.value;
            return (
              <Pressable
                key={rank.labelKey}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => setRank(rank.value)}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 13,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: active ? colors.live : colors.outline,
                  backgroundColor: active ? colors.live : colors.surface,
                }}
              >
                <AppText variant="data" color={active ? '#FFFFFF' : colors.textMuted}>
                  {t(rank.labelKey)}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
