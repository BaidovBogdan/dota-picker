import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { fallbackHeroes } from '@/data/heroes';
import { useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import { useAppTheme } from '@/theme/use-app-theme';

export default function NativeLargeTitleScreen() {
  const [search, setSearch] = useState('');
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const heroes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return fallbackHeroes
      .filter((hero) => !query || hero.name.toLowerCase().includes(query))
      .slice(0, 40);
  }, [search]);

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title: t('nativeTest.largeTitle'),
          headerLargeTitleEnabled: true,
          headerBackButtonDisplayMode: 'minimal',
          headerSearchBarOptions: {
            placeholder: t('nativeTest.search'),
            hideWhenScrolling: false,
            placement: 'stacked',
            barTintColor: 'transparent',
            tintColor: colors.cobalt,
            textColor: colors.text,
            hintTextColor: colors.textMuted,
            headerIconColor: colors.textMuted,
            onChangeText: (event) => setSearch(event.nativeEvent.text),
            onCancelButtonPress: () => setSearch(''),
            onClose: () => setSearch(''),
          },
        }}
      />
      <FlatList
        data={heroes}
        keyExtractor={(hero) => String(hero.id)}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        ListHeaderComponent={
          <View
            style={{
              paddingBottom: 8,
              borderBottomWidth: 2,
              borderColor: colors.outline,
            }}
          >
            <AppText variant="data" color={colors.textMuted}>
              {t('nativeTest.listEyebrow')} · {heroes.length}
            </AppText>
          </View>
        }
        renderItem={({ item, index }) => (
          <View
            style={{
              minHeight: 68,
              flexDirection: 'row',
              alignItems: 'center',
              borderBottomWidth: 1,
              borderColor: colors.grid,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: index === 0 ? colors.live : colors.cobalt,
              }}
            >
              <AppText variant="data" color="#FFFFFF">
                {String(index + 1).padStart(2, '0')}
              </AppText>
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
              <AppText variant="title" numberOfLines={1}>
                {item.name}
              </AppText>
              <AppText
                variant="caption"
                color={colors.textMuted}
                numberOfLines={1}
                style={{ marginTop: 2 }}
              >
                {item.positions?.length
                  ? item.positions.map((position) => `P${position}`).join(' · ')
                  : t('nativeTest.roleUnknown')}
              </AppText>
            </View>
            <AppText variant="data" color={index === 0 ? colors.live : colors.cobalt}>
              {item.positions?.[0] ? `P${item.positions[0]}` : '—'}
            </AppText>
          </View>
        )}
      />
    </>
  );
}
