import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { MetaHeroRow } from '@/components/meta/meta-hero-row';
import { Skeleton } from '@/components/feedback/states';
import { AppText } from '@/components/ui/app-text';
import { useTranslation } from '@/i18n';
import type { MetaSnapshot } from '@/services/api/dota';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { Position } from '@/types/domain';

const roleFilters: (Position | null)[] = [null, 1, 2, 3, 4, 5];

export function MetaDiscoverySection({
  snapshot,
  loading,
}: {
  snapshot: MetaSnapshot | undefined;
  loading: boolean;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const mastheadIds = useMemo(
    () => new Set(snapshot?.entries.map((entry) => entry.hero.id) ?? []),
    [snapshot?.entries],
  );
  const heroes = useMemo(
    () => {
      const positionStats = position
        ? new Map(
            (snapshot?.positionStats ?? [])
              .filter((stat) => stat.position === position)
              .map((stat) => [stat.heroId, stat]),
          )
        : null;
      return (snapshot?.catalog ?? [])
        .filter((hero) => !mastheadIds.has(hero.id))
        .flatMap((hero) => {
          if (!positionStats || !position) return [hero];
          const stat = positionStats.get(hero.id);
          if (!stat) return [];
          return [{
            ...hero,
            positions: [position],
            picks: stat.picks,
            wins: stat.wins,
            winRate: stat.winRate,
          }];
        })
        .sort((left, right) =>
          (right.winRate ?? 0) - (left.winRate ?? 0)
          || (right.picks ?? 0) - (left.picks ?? 0)
          || left.id - right.id,
        )
        .slice(0, 4);
    },
    [mastheadIds, position, snapshot?.catalog, snapshot?.positionStats],
  );

  return (
    <View style={{ marginTop: 22 }}>
      <View
        style={{
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="data" color={colors.live} style={{ marginBottom: 2 }}>
            {t('meta.liveWindow')}
          </AppText>
          <AppText variant="display" style={{ fontSize: 28, lineHeight: 31 }}>
            {t('meta.now')}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('meta.viewAll')}
          onPress={() => router.push('/meta' as Href)}
          style={{
            minHeight: 42,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: 21,
            backgroundColor: alpha.river16,
          }}
        >
          <AppText variant="data" color={colors.cobalt} style={{ fontSize: 9 }}>
            {t('meta.viewAll')}
          </AppText>
          <Ionicons name="arrow-forward" size={16} color={colors.cobalt} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 7, paddingBottom: 10 }}
      >
        {roleFilters.map((value) => {
          const active = position === value;
          return (
            <Pressable
              key={value ?? 'all'}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => setPosition(value)}
              style={{
                minWidth: 50,
                minHeight: 38,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 19,
                borderWidth: 1,
                borderColor: active ? colors.cobalt : colors.outline,
                backgroundColor: active ? colors.cobalt : colors.surface,
              }}
            >
              <AppText variant="data" color={active ? '#FFFFFF' : colors.textMuted}>
                {value ? `P${value}` : t('meta.allRoles')}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={{
          padding: 8,
          gap: 7,
          borderRadius: shape.feature,
          backgroundColor: colors.surfaceElevated,
        }}
      >
        {loading && !snapshot
          ? Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} height={72} />
            ))
          : heroes.map((hero, index) => (
              <MetaHeroRow
                key={hero.id}
                hero={hero}
                index={index}
                onPress={() =>
                  router.push(`/hero/${hero.id}` as Href)
                }
              />
            ))}
        {!loading && snapshot && heroes.length === 0 ? (
          <View
            style={{
              minHeight: 92,
              padding: 16,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="caption" color={colors.textMuted} style={{ textAlign: 'center' }}>
              {t('meta.noRoleData')}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText
        variant="caption"
        color={colors.textMuted}
        style={{ marginTop: 8, paddingHorizontal: 4, fontSize: 10 }}
      >
        {t(snapshot?.isStale ? 'meta.staleNote' : 'meta.rollingNote', {
          patch: snapshot?.patch ?? '—',
        })}
      </AppText>
    </View>
  );
}
