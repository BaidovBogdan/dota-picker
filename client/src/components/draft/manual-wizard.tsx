import CloseIcon from '@expo/material-symbols/close.xml';
import SkipNextIcon from '@expo/material-symbols/skip_next.xml';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { type Href, router, Stack, useFocusEffect, useIsFocused } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import Svg, { Circle } from 'react-native-svg';

import { MessageState, Skeleton } from '@/components/feedback/states';
import { HeroPortrait } from '@/components/hero/hero-portrait';
import {
  FLOATING_ACTION_BAR_BOTTOM_INSET,
  FloatingActionBar,
} from '@/components/layout/floating-action-bar';
import { AppText } from '@/components/ui/app-text';
import { useDraftAccessGuard } from '@/hooks/use-draft-access';
import { useTranslation } from '@/i18n';
import { getHeroes } from '@/services/api/dota';
import { useAppStore } from '@/store/app-store';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { DraftTeam, Hero, Position } from '@/types/domain';
import { createId } from '@/utils/id';

type WizardStep = 0 | 1 | 2 | 3;

type HeroCatalogItem =
  { kind: 'rail-spacer' } | { kind: 'letter'; letter: string } | { kind: 'hero'; hero: Hero };

type RankOption = {
  value: number;
  labelKey: string;
  mmr: string;
};

type HeroWizardStepProps = {
  step: 0 | 1;
  team: DraftTeam;
  nextPath: Href;
};

const rankOptions: RankOption[] = [
  { value: 1, labelKey: 'rank.1', mmr: '0–769' },
  { value: 2, labelKey: 'rank.2', mmr: '770–1539' },
  { value: 3, labelKey: 'rank.3', mmr: '1540–2309' },
  { value: 4, labelKey: 'rank.4', mmr: '2310–3079' },
  { value: 5, labelKey: 'rank.5', mmr: '3080–3849' },
  { value: 6, labelKey: 'rank.6', mmr: '3850–4619' },
  { value: 7, labelKey: 'rank.7', mmr: '4620–5420' },
  { value: 8, labelKey: 'rank.8', mmr: '5420+' },
];

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const roles: Position[] = [1, 2, 3, 4, 5];
const roleIconSources: Record<Position, number> = {
  1: require('../../../assets/roles/carry.webp'),
  2: require('../../../assets/roles/mid.webp'),
  3: require('../../../assets/roles/offlane.webp'),
  4: require('../../../assets/roles/soft-support.webp'),
  5: require('../../../assets/roles/hard-support.webp'),
};
const selectedRailHeight = 72;
const catalogStateHeight = 320;
const rankIconUrl = (rank: number) =>
  `https://www.opendota.com/assets/images/dota2/rank_icons/rank_icon_${rank}.png`;
const heroCatalogKey = (item: HeroCatalogItem) =>
  item.kind === 'rail-spacer'
    ? 'selected-hero-rail-spacer'
    : item.kind === 'letter'
      ? `letter-${item.letter}`
      : `hero-${item.hero.id}`;

const closeRoute = () => {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
};

function useHeroesQuery() {
  const sessionUserId = useAppStore((state) => state.session?.userId);
  return useQuery({
    queryKey: ['heroes', sessionUserId],
    queryFn: ({ signal }) => getHeroes(signal),
    staleTime: 30 * 60 * 1000,
  });
}

function ProgressRing({ step }: { step: WizardStep }) {
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const size = 28;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (step + 1) / 4;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('manual.progressA11y', { current: step + 1 })}
      accessibilityValue={{ min: 1, max: 4, now: step + 1 }}
      style={{
        minWidth: 68,
        minHeight: 36,
        paddingHorizontal: 7,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: shape.round,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={alpha.bone12}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.cobalt}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <AppText
        variant="data"
        numberOfLines={1}
        style={{ fontSize: 9, lineHeight: 11, letterSpacing: 0.1 }}
      >
        {step + 1}/4
      </AppText>
    </View>
  );
}

function WizardHeader({
  actionDisabled,
  actionLabel,
  actionLoading = false,
  onAction,
  onSkip,
  searchOptions,
  step,
}: {
  actionDisabled: boolean;
  actionLabel: string;
  actionLoading?: boolean;
  onAction: () => void;
  onSkip?: () => void;
  searchOptions?: object;
  step: WizardStep;
}) {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen
        options={{
          title: t(`manual.step.${step + 1}`),
          headerSearchBarOptions: searchOptions as never,
        }}
      />
      {step === 0 ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel={t('common.close')}
            icon={Platform.OS === 'ios' ? 'xmark' : CloseIcon}
            separateBackground
            onPress={closeRoute}
          />
        </Stack.Toolbar>
      ) : null}
      <Stack.Toolbar placement="right">
        {onSkip ? (
          <Stack.Toolbar.Button
            accessibilityLabel={t('manual.skip')}
            icon={Platform.OS === 'android' ? SkipNextIcon : undefined}
            separateBackground
            onPress={onSkip}
          >
            {Platform.OS === 'ios' ? t('manual.skip') : null}
          </Stack.Toolbar.Button>
        ) : null}
        <Stack.Toolbar.View>
          <ProgressRing step={step} />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="bottom">
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Button
            accessibilityLabel={actionLabel}
            disabled={actionDisabled}
            variant="prominent"
            onPress={onAction}
          >
            {actionLoading ? t('common.loading') : actionLabel}
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Spacer />
        </Stack.Toolbar>
      ) : null}
    </>
  );
}

function AndroidAction({
  disabled,
  label,
  loading = false,
  onPress,
  final = false,
}: {
  disabled: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
  final?: boolean;
}) {
  if (Platform.OS !== 'android') return null;

  return (
    <FloatingActionBar
      label={label}
      icon={final ? 'git-compare-outline' : 'arrow-forward'}
      loading={loading}
      disabled={disabled}
      onPress={onPress}
      appearance="transparentGlass"
      testID="manual-wizard-continue"
    />
  );
}

const SelectedHeroAvatar = memo(function SelectedHeroAvatar({
  hero,
  index,
  onRemove,
  team,
}: {
  hero?: Hero;
  index: number;
  onRemove: (heroId: number) => void;
  team: DraftTeam;
}) {
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const accent = team === 'enemies' ? colors.live : colors.cobalt;

  if (!hero) {
    return (
      <View
        style={{
          width: 50,
          height: 50,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 25,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: alpha.bone20,
          backgroundColor: alpha.bone04,
        }}
      >
        <AppText variant="data" color={colors.textMuted} style={{ fontSize: 8 }}>
          {String(index + 1).padStart(2, '0')}
        </AppText>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('draft.removeHero', { name: hero.name })}
      onPress={() => onRemove(hero.id)}
      style={{
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        borderColor: accent,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <Image
        source={{ uri: hero.imageUrl }}
        style={{ width: '100%', height: '100%', borderRadius: 23 }}
        contentFit="cover"
        cachePolicy="disk"
        enforceEarlyResizing
        recyclingKey={`manual-selected-${hero.id}`}
      />
      <View
        style={{
          position: 'absolute',
          top: -3,
          right: -3,
          width: 18,
          height: 18,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 9,
          borderWidth: 2,
          borderColor: colors.background,
          backgroundColor: accent,
        }}
      >
        <Ionicons name="close" size={11} color="#FFFFFF" />
      </View>
    </Pressable>
  );
});

const SelectedHeroesRail = memo(function SelectedHeroesRail({
  heroes,
  maximum,
  selectedIds,
  team,
  onRemove,
}: {
  heroes: Hero[];
  maximum: number;
  selectedIds: number[];
  team: DraftTeam;
  onRemove: (heroId: number) => void;
}) {
  const heroById = useMemo(() => new Map(heroes.map((hero) => [hero.id, hero])), [heroes]);

  return (
    <View
      style={{
        width: '100%',
        maxWidth: layout.contentMaxWidth,
        height: selectedRailHeight,
        paddingHorizontal: layout.phoneGutter,
        paddingTop: 9,
        paddingBottom: 13,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      {Array.from({ length: maximum }, (_, index) => {
        const heroId = selectedIds[index];
        const hero = heroId ? heroById.get(heroId) : undefined;
        return (
          <SelectedHeroAvatar
            key={`${team}-${index}`}
            index={index}
            team={team}
            onRemove={onRemove}
            {...(hero ? { hero } : {})}
          />
        );
      })}
    </View>
  );
});

type HeroCatalogRowProps = {
  blocked: boolean;
  full: boolean;
  hero: Hero;
  onToggle: (heroId: number) => void;
  rowHeight: number;
  selected: boolean;
  team: DraftTeam;
};

const HeroCatalogRow = memo(function HeroCatalogRow({
  blocked,
  full,
  hero,
  onToggle,
  rowHeight,
  selected,
  team,
}: HeroCatalogRowProps) {
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const disabled = blocked || (full && !selected);
  const accent = team === 'enemies' ? colors.live : colors.cobalt;
  const selectedFill = team === 'enemies' ? alpha.ember16 : alpha.river16;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={
        selected
          ? t('draft.removeHero', { name: hero.name })
          : blocked
            ? t('manual.heroOnOtherSide', { name: hero.name })
            : t('heroSelect.choose', { name: hero.name })
      }
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={() => onToggle(hero.id)}
      style={{
        height: rowHeight,
        marginLeft: layout.phoneGutter,
        marginRight: 42,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: colors.outline,
        backgroundColor: selected ? selectedFill : colors.surface,
        opacity: disabled ? 0.38 : 1,
      }}
    >
      <HeroPortrait hero={hero} size={48} showName={false} transitionMs={0} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="inscription" numberOfLines={1}>
          {hero.name}
        </AppText>
        <AppText
          variant="caption"
          color={selected ? accent : colors.textMuted}
          numberOfLines={1}
          style={{ marginTop: 2, fontSize: 11, lineHeight: 14 }}
        >
          {t('heroSelect.positions', {
            positions: hero.positions.map((position) => `P${position}`).join(' · '),
          })}
        </AppText>
      </View>
      <Ionicons
        name={blocked ? 'lock-closed' : selected ? 'checkmark-circle' : 'add-circle-outline'}
        size={27}
        color={selected ? accent : colors.textMuted}
      />
    </Pressable>
  );
});

function AlphabetRail({
  itemIndexByLetter,
  onSelect,
  team,
  top,
}: {
  itemIndexByLetter: ReadonlyMap<string, number>;
  onSelect: (itemIndex: number) => void;
  team: DraftTeam;
  top: number;
}) {
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const accent = team === 'enemies' ? colors.live : colors.cobalt;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top,
        right: 3,
        bottom: Platform.OS === 'android' ? 104 : 76,
        width: 32,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 28,
          paddingVertical: 5,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 14,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: alpha.bone12,
          backgroundColor: alpha.iron90,
        }}
      >
        {alphabet.map((letter) => {
          const itemIndex = itemIndexByLetter.get(letter);
          const enabled = itemIndex !== undefined;
          return (
            <Pressable
              key={letter}
              accessibilityRole="button"
              accessibilityLabel={t('manual.jumpToLetter', { letter })}
              accessibilityState={{ disabled: !enabled }}
              disabled={!enabled}
              onPress={() => {
                if (itemIndex === undefined) return;
                onSelect(itemIndex);
              }}
              style={{
                width: 26,
                height: 15,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
              }}
            >
              <AppText
                variant="data"
                color={enabled ? accent : alpha.bone20}
                style={{ fontSize: 8, lineHeight: 9, letterSpacing: 0 }}
              >
                {letter}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function HeroPicker({
  heroes,
  isError,
  isLoading,
  onRetry,
  search,
  team,
}: {
  heroes: Hero[];
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  search: string;
  team: DraftTeam;
}) {
  const selectedIds = useAppStore((state) => state.draft[team]);
  const oppositeIds = useAppStore((state) =>
    team === 'allies' ? state.draft.enemies : state.draft.allies,
  );
  const addHero = useAppStore((state) => state.addHero);
  const removeHero = useAppStore((state) => state.removeHero);
  const { fontScale } = useWindowDimensions();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const headerHeight = useHeaderHeight();
  const listRef = useRef<FlatList<HeroCatalogItem>>(null);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const maximum = team === 'allies' ? 4 : 5;
  const railTop = Platform.OS === 'ios' ? headerHeight : 0;
  const heroRowHeight = Math.max(68, Math.ceil(40 * fontScale));
  const letterRowHeight = Math.max(32, Math.ceil(20 * fontScale));
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const oppositeSet = useMemo(() => new Set(oppositeIds), [oppositeIds]);
  const orderedHeroes = useMemo(
    () => [...heroes].sort((left, right) => left.name.localeCompare(right.name)),
    [heroes],
  );
  const catalog = useMemo(() => {
    const items: HeroCatalogItem[] = [{ kind: 'rail-spacer' }];
    const layouts = [{ index: 0, length: selectedRailHeight, offset: 0 }];
    const itemIndexByLetter = new Map<string, number>();
    let offset = selectedRailHeight;
    let currentLetter: string | null = null;

    for (const hero of orderedHeroes) {
      if (deferredSearch && !hero.name.toLocaleLowerCase().includes(deferredSearch)) continue;
      const letter = hero.name.trim().charAt(0).toLocaleUpperCase() || '#';
      if (letter !== currentLetter) {
        const index = items.length;
        itemIndexByLetter.set(letter, index);
        items.push({ kind: 'letter', letter });
        layouts.push({ index, length: letterRowHeight, offset });
        offset += letterRowHeight;
        currentLetter = letter;
      }

      const index = items.length;
      items.push({ kind: 'hero', hero });
      layouts.push({ index, length: heroRowHeight, offset });
      offset += heroRowHeight;
    }

    return { itemIndexByLetter, items, layouts };
  }, [deferredSearch, heroRowHeight, letterRowHeight, orderedHeroes]);

  const toggleHero = useCallback(
    (heroId: number) => {
      Haptics.selectionAsync().catch(() => {});
      if (useAppStore.getState().draft[team].includes(heroId)) removeHero(team, heroId);
      else addHero(team, heroId);
    },
    [addHero, removeHero, team],
  );

  const removeSelectedHero = useCallback(
    (heroId: number) => removeHero(team, heroId),
    [removeHero, team],
  );

  const jumpToItem = useCallback((itemIndex: number) => {
    Haptics.selectionAsync().catch(() => {});
    listRef.current?.recordInteraction();
    listRef.current?.scrollToIndex({
      animated: false,
      index: itemIndex,
      viewOffset: selectedRailHeight,
      viewPosition: 0,
    });
  }, []);
  const getItemLayout = useCallback(
    (_data: ArrayLike<HeroCatalogItem> | null | undefined, index: number) =>
      catalog.layouts[index] ?? {
        index,
        length: heroRowHeight,
        offset: catalog.layouts.at(-1)?.offset ?? 0,
      },
    [catalog.layouts, heroRowHeight],
  );

  const renderItem = useCallback(
    ({ item }: { item: HeroCatalogItem }) => {
      if (item.kind === 'rail-spacer') {
        return <View style={{ height: selectedRailHeight }} />;
      }

      if (item.kind === 'letter') {
        return (
          <View
            style={{
              height: letterRowHeight,
              marginLeft: layout.phoneGutter,
              marginRight: 42,
              paddingHorizontal: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: colors.background,
            }}
          >
            <AppText
              variant="data"
              color={team === 'enemies' ? colors.live : colors.cobalt}
              style={{ width: 20 }}
            >
              {item.letter}
            </AppText>
            <View
              style={{
                flex: 1,
                height: StyleSheet.hairlineWidth,
                backgroundColor: colors.outline,
              }}
            />
          </View>
        );
      }

      return (
        <HeroCatalogRow
          hero={item.hero}
          team={team}
          rowHeight={heroRowHeight}
          selected={selectedSet.has(item.hero.id)}
          blocked={oppositeSet.has(item.hero.id)}
          full={selectedIds.length >= maximum}
          onToggle={toggleHero}
        />
      );
    },
    [
      colors,
      heroRowHeight,
      letterRowHeight,
      maximum,
      oppositeSet,
      selectedIds.length,
      selectedSet,
      team,
      toggleHero,
    ],
  );

  const catalogIsEmpty = catalog.items.length === 1;

  return (
    <>
      <FlatList
        ref={listRef}
        data={catalog.items}
        keyExtractor={heroCatalogKey}
        getItemLayout={getItemLayout}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          flex: 1,
          alignSelf: 'center',
          backgroundColor: colors.background,
        }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingBottom: Platform.OS === 'android' ? FLOATING_ACTION_BAR_BOTTOM_INSET + 18 : 34,
        }}
        renderItem={renderItem}
        ListFooterComponent={
          catalogIsEmpty ? (
            <View
              style={{
                minHeight: catalogStateHeight,
                marginHorizontal: layout.phoneGutter,
                paddingTop: 8,
              }}
            >
              {isLoading ? (
                <View style={{ gap: 8 }}>
                  <Skeleton height={68} />
                  <Skeleton height={68} />
                  <Skeleton height={68} />
                  <Skeleton height={68} />
                </View>
              ) : isError ? (
                <MessageState
                  title={t('heroSelect.loadError')}
                  message={t('heroSelect.errorBody')}
                  icon="cloud-offline-outline"
                  actionLabel={t('common.retry')}
                  onAction={onRetry}
                />
              ) : (
                <MessageState
                  title={t('heroSelect.empty')}
                  message={t('heroSelect.emptyBody')}
                  icon="search-outline"
                />
              )}
            </View>
          ) : null
        }
      />
      <View
        style={{
          position: 'absolute',
          top: railTop,
          right: 0,
          left: 0,
          zIndex: 2,
          alignItems: 'center',
        }}
      >
        <SelectedHeroesRail
          heroes={heroes}
          maximum={maximum}
          selectedIds={selectedIds}
          team={team}
          onRemove={removeSelectedHero}
        />
      </View>
      {!deferredSearch && catalog.itemIndexByLetter.size > 1 && !isLoading && !isError ? (
        <AlphabetRail
          itemIndexByLetter={catalog.itemIndexByLetter}
          team={team}
          top={railTop + selectedRailHeight + 8}
          onSelect={jumpToItem}
        />
      ) : null}
    </>
  );
}

function HeroStepContent({ search, team }: { search: string; team: DraftTeam }) {
  const query = useHeroesQuery();

  return (
    <HeroPicker
      heroes={query.data ?? []}
      isError={query.isError}
      isLoading={query.isLoading}
      onRetry={() => void query.refetch()}
      search={search}
      team={team}
    />
  );
}

function RankPicker({
  selected,
  onSelect,
}: {
  selected: number | null;
  onSelect: (rank: number) => void;
}) {
  const { width } = useWindowDimensions();
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const gutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const cardWidth = Math.max(142, (Math.min(width, layout.contentMaxWidth) - gutter * 2 - 10) / 2);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: layout.contentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: gutter,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'android' ? FLOATING_ACTION_BAR_BOTTOM_INSET + 24 : 42,
      }}
    >
      <View
        style={{
          marginBottom: 12,
          padding: 14,
          borderRadius: shape.feature,
          backgroundColor: colors.surfaceElevated,
        }}
      >
        <AppText variant="data" color={colors.cobalt}>
          {t('manual.rankEyebrow')}
        </AppText>
        <AppText variant="title" style={{ marginTop: 4 }}>
          {t('manual.rankHeading')}
        </AppText>
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: 5 }}>
          {t('manual.rankBody')}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {rankOptions.map((option) => {
          const active = selected === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={`${t(option.labelKey)}, ${option.mmr} MMR`}
              accessibilityState={{ checked: active }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onSelect(option.value);
              }}
              style={{
                width: cardWidth,
                minHeight: 126,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                overflow: 'hidden',
                borderWidth: 1,
                borderRadius: shape.card,
                borderColor: active ? colors.cobalt : colors.outline,
                backgroundColor: active ? alpha.primary16 : colors.surface,
              }}
            >
              <Image
                source={{ uri: rankIconUrl(option.value) }}
                style={{ width: 62, height: 78, flexShrink: 0 }}
                contentFit="contain"
                cachePolicy="disk"
                enforceEarlyResizing
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="data" color={active ? colors.cobalt : colors.textMuted}>
                  {String(option.value).padStart(2, '0')}
                </AppText>
                <AppText
                  variant="inscription"
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.68}
                  style={{ marginTop: 2, fontSize: 17, lineHeight: 20 }}
                >
                  {t(option.labelKey)}
                </AppText>
                <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 5 }}>
                  {option.mmr} MMR
                </AppText>
              </View>
              {active ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 22,
                    height: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 11,
                    backgroundColor: colors.cobalt,
                  }}
                >
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function RolePicker({
  selected,
  onSelect,
}: {
  selected: Position | null;
  onSelect: (position: Position) => void;
}) {
  const { width } = useWindowDimensions();
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const gutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: layout.contentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: gutter,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'android' ? FLOATING_ACTION_BAR_BOTTOM_INSET + 24 : 42,
      }}
    >
      <View
        style={{
          marginBottom: 10,
          padding: 14,
          borderRadius: shape.feature,
          backgroundColor: colors.surfaceElevated,
        }}
      >
        <AppText variant="data" color={colors.live}>
          {t('manual.roleEyebrow')}
        </AppText>
        <AppText variant="title" style={{ marginTop: 4 }}>
          {t('manual.roleHeading')}
        </AppText>
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: 5 }}>
          {t('manual.roleBody')}
        </AppText>
      </View>
      <View style={{ gap: 8 }}>
        {roles.map((position) => {
          const active = selected === position;
          return (
            <Pressable
              key={position}
              accessibilityRole="radio"
              accessibilityLabel={`P${position}, ${t(`manual.role.${position}`)}`}
              accessibilityState={{ checked: active }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onSelect(position);
              }}
              style={{
                minHeight: 82,
                padding: 7,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                overflow: 'hidden',
                borderWidth: 1,
                borderRadius: shape.card,
                borderColor: active ? colors.cobalt : colors.outline,
                backgroundColor: active ? alpha.primary16 : colors.surface,
              }}
            >
              <View
                style={{
                  width: 68,
                  height: 68,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  borderRadius: shape.control,
                  backgroundColor: colors.surfaceElevated,
                }}
              >
                <Image
                  source={roleIconSources[position]}
                  style={{
                    width: 48,
                    height: 48,
                    tintColor: active ? colors.cobalt : colors.text,
                  }}
                  contentFit="contain"
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText
                  variant="inscription"
                  numberOfLines={1}
                  style={{ fontSize: 18, lineHeight: 21 }}
                >
                  {t(`manual.role.${position}`)}
                </AppText>
              </View>
              <View
                style={{
                  width: 34,
                  height: 34,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 17,
                  borderWidth: 1,
                  borderColor: active ? colors.cobalt : colors.outline,
                  backgroundColor: active ? colors.cobalt : colors.background,
                }}
              >
                <Ionicons
                  name={active ? 'checkmark' : 'arrow-forward'}
                  size={18}
                  color={active ? '#FFFFFF' : colors.textMuted}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function RoleStepContent({
  selected,
  onSelect,
}: {
  selected: Position | null;
  onSelect: (position: Position) => void;
}) {
  return <RolePicker selected={selected} onSelect={onSelect} />;
}

export function ManualHeroWizardStep({ step, team, nextPath }: HeroWizardStepProps) {
  const selectedCount = useAppStore((state) => state.draft[team].length);
  const setPhoto = useAppStore((state) => state.setPhoto);
  const [search, setSearch] = useState('');
  const searchBarRef = useRef<SearchBarCommands>(null);
  const isFocused = useIsFocused();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const actionLabel = t('common.continue');
  const actionDisabled = team === 'enemies' && selectedCount === 0;

  useEffect(() => {
    if (step === 0) setPhoto(null);
  }, [setPhoto, step]);

  const goNext = useCallback(() => {
    if (actionDisabled) return;
    Keyboard.dismiss();
    searchBarRef.current?.blur();
    router.push(nextPath);
  }, [actionDisabled, nextPath]);

  const searchOptions = useMemo(
    () => ({
      ref: searchBarRef,
      placeholder: t('heroSelect.search'),
      hideWhenScrolling: false,
      placement: 'stacked' as const,
      tintColor: team === 'enemies' ? colors.live : colors.cobalt,
      textColor: colors.text,
      hintTextColor: colors.textMuted,
      headerIconColor: colors.textMuted,
      disableBackButtonOverride: true,
      onChangeText: (event: { nativeEvent: { text: string } }) => setSearch(event.nativeEvent.text),
      onCancelButtonPress: () => setSearch(''),
      onClose: () => setSearch(''),
    }),
    [colors, t, team],
  );

  return (
    <>
      <WizardHeader
        step={step}
        actionLabel={actionLabel}
        actionDisabled={actionDisabled}
        onAction={goNext}
        {...(step === 1 ? { onSkip: goNext } : {})}
        searchOptions={searchOptions}
      />
      {isFocused ? <HeroStepContent search={search} team={team} /> : null}
      {isFocused ? (
        <AndroidAction disabled={actionDisabled} label={actionLabel} onPress={goNext} />
      ) : null}
    </>
  );
}

export function ManualRankWizardStep() {
  const selected = useAppStore((state) => state.draft.rank);
  const setRank = useAppStore((state) => state.setRank);
  const isFocused = useIsFocused();
  const { t } = useTranslation();
  const actionLabel = t('common.continue');
  const actionDisabled = selected === null;
  const goNext = useCallback(() => {
    if (!actionDisabled) router.push('/draft/manual/role');
  }, [actionDisabled]);

  return (
    <>
      <WizardHeader
        step={2}
        actionLabel={actionLabel}
        actionDisabled={actionDisabled}
        onAction={goNext}
      />
      {isFocused ? <RankPicker selected={selected} onSelect={setRank} /> : null}
      {isFocused ? (
        <AndroidAction disabled={actionDisabled} label={actionLabel} onPress={goNext} />
      ) : null}
    </>
  );
}

export function ManualRoleWizardStep() {
  const selected = useAppStore((state) => state.draft.position);
  const setPosition = useAppStore((state) => state.setPosition);
  const [analysisStarting, setAnalysisStarting] = useState(false);
  const analysisLock = useRef(false);
  const isFocused = useIsFocused();
  const draftAccess = useDraftAccessGuard();
  const { t } = useTranslation();
  const actionLabel = t('home.analyze');
  const actionDisabled = analysisStarting || selected === null;

  useFocusEffect(
    useCallback(
      () => () => {
        analysisLock.current = false;
        setAnalysisStarting(false);
      },
      [],
    ),
  );

  const analyze = useCallback(() => {
    if (actionDisabled || analysisLock.current) return;
    draftAccess.requestAccess(() => {
      analysisLock.current = true;
      setAnalysisStarting(true);
      router.replace({
        pathname: '/analysis',
        params: { idempotencyKey: createId('manual') },
      });
    });
  }, [actionDisabled, draftAccess]);

  return (
    <>
      <WizardHeader
        step={3}
        actionLabel={actionLabel}
        actionDisabled={actionDisabled}
        actionLoading={analysisStarting}
        onAction={analyze}
      />
      {isFocused ? <RoleStepContent selected={selected} onSelect={setPosition} /> : null}
      {isFocused ? (
        <AndroidAction
          disabled={actionDisabled}
          label={actionLabel}
          loading={analysisStarting}
          onPress={analyze}
          final
        />
      ) : null}
    </>
  );
}
