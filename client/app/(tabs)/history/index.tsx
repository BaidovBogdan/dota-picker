import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { DotaStateAnimation } from '@/components/feedback/dota-state-animation';
import { showNativeAlert } from '@/components/feedback/native-alert';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n';
import { nativeLargeHeaderOptions } from '@/navigation/native-header';
import { getServerHistory } from '@/services/api/dota';
import { useAppStore } from '@/store/app-store';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { AnalysisResult } from '@/types/domain';

export default function HistoryScreen() {
  const history = useAppStore((state) => state.history);
  const removeHistory = useAppStore((state) => state.removeHistory);
  const session = useAppStore((state) => state.session);
  const isRemoteBootstrapPending = useAppStore((state) => state.isRemoteBootstrapPending);
  const [search, setSearch] = useState('');
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const registeredUserId = session?.kind === 'registered' ? session.userId : null;

  useFocusEffect(
    useCallback(() => {
      if (!registeredUserId || isRemoteBootstrapPending) return;
      const expectedUserId = registeredUserId;
      let active = true;
      void getServerHistory()
        .then((serverHistory) => {
          const store = useAppStore.getState();
          if (active && store.session?.userId === expectedUserId) {
            store.mergeHistory(serverHistory);
          }
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [isRemoteBootstrapPending, registeredUserId]),
  );

  const visibleHistory = useMemo(
    () =>
      history.filter((item) => {
        if (!normalizedSearch) return true;
        const searchable = [
          item.patch,
          item.draft.position ? `p${item.draft.position}` : '',
          item.draft.position ? t(`position.${item.draft.position}`) : '',
          ...item.recommendations.map((recommendation) => recommendation.hero.name),
        ]
          .join(' ')
          .toLocaleLowerCase();
        return searchable.includes(normalizedSearch);
      }),
    [history, normalizedSearch, t],
  );

  const confirmRemove = (item: AnalysisResult) => {
    showNativeAlert(t('history.deleteTitle'), t('history.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => removeHistory(item.id),
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeLargeHeaderOptions(colors),
          title: t('history.title'),
          headerLargeTitleEnabled: true,
          headerSearchBarOptions: {
            placeholder: t('history.search'),
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
      <FlashList
        data={visibleHistory}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 0, paddingBottom: 106 }}
        ListHeaderComponent={
          <View
            style={{
              minHeight: 84,
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'stretch',
              borderWidth: 2,
              borderRadius: shape.card,
              borderColor: colors.outline,
              backgroundColor: colors.surface,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: 86,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.cobalt,
                borderRightWidth: 2,
                borderColor: colors.outline,
              }}
            >
              <AppText
                variant="display"
                color="#FFFFFF"
                style={{ fontSize: 34, lineHeight: 36, letterSpacing: -1 }}
              >
                {String(visibleHistory.length).padStart(2, '0')}
              </AppText>
            </View>
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 14 }}>
              <AppText variant="data" color={colors.live}>
                {t('history.eyebrow')}
              </AppText>
              <AppText variant="inscription" style={{ marginTop: 3 }}>
                {normalizedSearch ? t('history.searchResults') : t('history.title')}
              </AppText>
            </View>
            <View style={{ width: 8, backgroundColor: colors.live }} />
          </View>
        }
        ListEmptyComponent={<EmptyArchive searching={Boolean(normalizedSearch)} />}
        renderItem={({ item, index }) => (
          <HistoryCard item={item} index={index} onRemove={() => confirmRemove(item)} />
        )}
      />
    </>
  );
}

function EmptyArchive({ searching = false }: { searching?: boolean }) {
  const isFocused = useIsFocused();
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        flex: 1,
        minHeight: 360,
        overflow: 'hidden',
        borderWidth: 2,
        borderRadius: shape.card,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
      }}
    >
      <View
        style={{
          flex: 1,
          minHeight: 236,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <DotaStateAnimation active={isFocused} scene="empty" size={166} />
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {t(searching ? 'history.noMatches' : 'history.empty')}
        </AppText>
        <AppText
          variant="body"
          color={colors.textMuted}
          style={{ maxWidth: 320, marginTop: 8, textAlign: 'center' }}
        >
          {t(searching ? 'history.noMatchesBody' : 'history.emptyBody')}
        </AppText>
      </View>
      {!searching ? (
        <View
          style={{
            padding: 12,
            borderTopWidth: 2,
            borderColor: colors.outline,
          }}
        >
          <Button
            label={t('home.newDraft')}
            tone="dota"
            icon="add"
            onPress={() => router.navigate('/(tabs)')}
          />
        </View>
      ) : null}
    </View>
  );
}

function HistoryCard({
  item,
  index,
  onRemove,
}: {
  item: AnalysisResult;
  index: number;
  onRemove: () => void;
}) {
  const first = item.recommendations[0];
  const { colors, alpha } = useAppTheme();
  const { t, locale } = useTranslation();
  if (!first) return null;

  const sourceColor = item.source === 'server' ? colors.cobalt : colors.live;
  const date = new Date(item.createdAt).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View
      style={{
        marginBottom: 12,
        overflow: 'hidden',
        borderWidth: 2,
        borderRadius: shape.card,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
      }}
    >
      <View
        style={{
          minHeight: 28,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 2,
          borderColor: colors.outline,
        }}
      >
        <View
          style={{
            alignSelf: 'stretch',
            justifyContent: 'center',
            paddingHorizontal: 9,
            backgroundColor: colors.text,
          }}
        >
          <AppText variant="data" color={colors.background}>
            {String(index + 1).padStart(2, '0')}
          </AppText>
        </View>
        <AppText
          variant="data"
          color={sourceColor}
          numberOfLines={1}
          style={{ flex: 1, paddingHorizontal: 10 }}
        >
          {item.source === 'offline' ? t('history.offline') : item.patch}
        </AppText>
        <View style={{ width: 34, alignSelf: 'stretch', backgroundColor: sourceColor }} />
      </View>

      <View style={{ minHeight: 96, flexDirection: 'row', alignItems: 'stretch' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('history.open')}: ${first.hero.name}`}
          onPress={() => router.push({ pathname: '/result/[id]', params: { id: item.id } })}
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: 'row',
            alignItems: 'stretch',
          }}
        >
          <View
            style={{
              width: 94,
              height: 96,
              flexShrink: 0,
              overflow: 'hidden',
              borderRightWidth: 2,
              borderColor: colors.outline,
              backgroundColor: colors.surfaceElevated,
            }}
          >
            {first.hero.imageUrl ? (
              <Image
                source={{ uri: first.hero.imageUrl }}
                contentFit="cover"
                cachePolicy="disk"
                enforceEarlyResizing
                recyclingKey={item.id}
                transition={120}
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="title" color={sourceColor}>
                  {first.hero.name.slice(0, 2)}
                </AppText>
              </View>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', padding: 12 }}>
            <AppText variant="data" color={sourceColor} numberOfLines={1}>
              {t('history.position', { position: item.draft.position ?? '—' })}
            </AppText>
            <AppText variant="title" numberOfLines={1} style={{ marginTop: 3 }}>
              {first.hero.name}
            </AppText>
            <AppText
              variant="caption"
              color={colors.textMuted}
              numberOfLines={1}
              style={{ marginTop: 5 }}
            >
              {date}
            </AppText>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('common.delete')}: ${first.hero.name}`}
          hitSlop={6}
          onPress={onRemove}
          style={{
            width: 54,
            alignItems: 'center',
            justifyContent: 'center',
            borderLeftWidth: 2,
            borderColor: colors.outline,
            backgroundColor: colors.background,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 16,
              backgroundColor: alpha.ember16,
            }}
          >
            <Ionicons name="close" size={20} color={colors.live} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
