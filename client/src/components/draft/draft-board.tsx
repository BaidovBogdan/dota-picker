import Ionicons from '@expo/vector-icons/Ionicons';
import LottieView from 'lottie-react-native';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import {
  DraftCaptureActions,
  type DraftCaptureActionsConfig,
} from '@/components/draft/draft-capture-actions';
import { HeroPortrait } from '@/components/hero/hero-portrait';
import { AppText } from '@/components/ui/app-text';
import { fallbackHeroes } from '@/data/heroes';
import { type DraftAccessRequest, useDraftAccessGuard } from '@/hooks/use-draft-access';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/store/app-store';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { DraftTeam } from '@/types/domain';

const plusAnimation = require('../../../assets/lottie/plus.json');

function TargetPick({ size }: { size: number }) {
  const position = useAppStore((state) => state.draft.position);
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      accessibilityLabel={
        position ? `${t('home.yourRole')}, ${t('position.title')} ${position}` : t('home.yourRole')
      }
      style={{
        width: size,
        height: size,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: shape.compact,
        borderColor: colors.cobalt,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText variant="data" color={colors.cobalt}>
        {position ? `P${position}` : t('draft.you')}
      </AppText>
    </View>
  );
}

function TeamRow({
  team,
  slotSize,
  requestAccess,
  showHeader = true,
  showDivider = true,
}: {
  team: DraftTeam;
  slotSize: number;
  requestAccess: DraftAccessRequest;
  showHeader?: boolean;
  showDivider?: boolean;
}) {
  const heroIds = useAppStore((state) => state.draft[team]);
  const catalog = useAppStore((state) => state.heroes);
  const removeHero = useAppStore((state) => state.removeHero);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const catalogById = useMemo(
    () => new Map((catalog.length ? catalog : fallbackHeroes).map((hero) => [hero.id, hero])),
    [catalog],
  );
  const isAllies = team === 'allies';
  const slots = Array.from({ length: isAllies ? 4 : 5 }, (_, index) => heroIds[index]);

  const openHeroSelect = (heroId?: number) => {
    requestAccess(() => {
      router.push({
        pathname: '/hero-select',
        params: {
          team,
          ...(heroId ? { replaceHeroId: String(heroId) } : {}),
        },
      });
    });
  };

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingTop: showHeader ? 10 : 8,
        paddingBottom: 11,
        backgroundColor: colors.surface,
        borderBottomWidth: showDivider ? 2 : 0,
        borderColor: colors.outline,
      }}
    >
      {showHeader ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 11,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            <AppText
              variant="data"
              color={colors.textMuted}
              style={{ fontSize: 8, lineHeight: 11 }}
            >
              {t('draft.onBoard')}
            </AppText>
            <AppText
              variant="inscription"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              maxFontSizeMultiplier={1.5}
              style={{ marginTop: 1 }}
            >
              {t(isAllies ? 'draft.alliesCount' : 'draft.enemiesCount', {
                current: heroIds.length,
                maximum: isAllies ? 4 : 5,
              })}
            </AppText>
          </View>
          <View
            style={{
              minWidth: 30,
              minHeight: 22,
              paddingHorizontal: 5,
              backgroundColor: isAllies ? colors.cobalt : colors.live,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="data" color="#FFFFFF" style={{ fontSize: 9, lineHeight: 11 }}>
              {t(isAllies ? 'draft.allyCode' : 'draft.enemyCode')}
            </AppText>
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}>
        {slots.map((heroId, index) => {
          const hero = heroId ? catalogById.get(heroId) : undefined;
          return (
            <HeroPortrait
              key={`${team}-${index}`}
              hero={hero}
              size={slotSize}
              showName={false}
              slotNumber={String(index + 1).padStart(2, '0')}
              label={t('draft.addHero')}
              onPress={() => openHeroSelect(heroId)}
              onRemove={heroId ? () => requestAccess(() => removeHero(team, heroId)) : undefined}
            />
          );
        })}
        {isAllies ? <TargetPick size={slotSize} /> : null}
      </View>
    </View>
  );
}

function CaptureOnlyDraftBoard({
  capture,
  onRequestAccess,
}: {
  capture?: DraftCaptureActionsConfig;
  onRequestAccess?: DraftAccessRequest;
}) {
  const draftAccess = useDraftAccessGuard();
  if (!capture) return null;

  return (
    <DraftCaptureActions
      actions={capture}
      requestAccess={onRequestAccess ?? draftAccess.requestAccess}
      accessPending={draftAccess.status === 'pending'}
    />
  );
}

function InteractiveDraftBoard({
  capture,
  onRequestAccess,
}: {
  capture?: DraftCaptureActionsConfig;
  onRequestAccess?: DraftAccessRequest;
}) {
  const { width } = useWindowDimensions();
  const allies = useAppStore((state) => state.draft.allies);
  const [alliesExpanded, setAlliesExpanded] = useState(allies.length > 0);
  const draftAccess = useDraftAccessGuard();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const horizontalGutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const contentWidth = Math.max(0, Math.min(width, layout.contentMaxWidth) - horizontalGutter * 2);
  const slotSize = Math.max(44, Math.min(66, Math.floor((contentWidth - 40) / 5)));
  const requestAccess = onRequestAccess ?? draftAccess.requestAccess;

  useEffect(() => {
    return useAppStore.subscribe((state, previousState) => {
      if (
        state.draft.allies.length > 0 &&
        state.draft.allies.length !== previousState.draft.allies.length
      ) {
        setAlliesExpanded(true);
      }
    });
  }, []);

  return (
    <View
      style={{
        width: '100%',
        overflow: 'hidden',
        borderWidth: 2,
        borderRadius: shape.card,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
      }}
    >
      <TeamRow team="enemies" slotSize={slotSize} requestAccess={requestAccess} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: alliesExpanded }}
        accessibilityLabel={t(alliesExpanded ? 'draft.hideAllies' : 'draft.addAllies')}
        onPress={() => setAlliesExpanded((current) => !current)}
        style={{
          minHeight: 48,
          paddingHorizontal: 11,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.surface,
          borderBottomWidth: alliesExpanded || capture ? 2 : 0,
          borderColor: colors.outline,
        }}
      >
        <View
          style={{
            width: 29,
            height: 29,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 15,
            backgroundColor: colors.paper,
          }}
        >
          <LottieView
            source={plusAnimation}
            autoPlay={!reducedMotion && !alliesExpanded}
            loop={false}
            progress={reducedMotion ? 1 : undefined}
            style={{ width: 27, height: 27 }}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText
            variant="inscription"
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={1.5}
            style={{ fontSize: 16, lineHeight: 18 }}
          >
            {t(alliesExpanded ? 'draft.hideAllies' : 'draft.addAllies')} · {allies.length}/4
          </AppText>
          <AppText
            variant="caption"
            color={colors.textMuted}
            style={{ fontSize: 10, lineHeight: 13 }}
          >
            {t('draft.alliesOptional')}
          </AppText>
        </View>
        <Ionicons
          name={alliesExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.text}
        />
      </Pressable>
      {alliesExpanded ? (
        <View>
          <TeamRow
            team="allies"
            slotSize={slotSize}
            requestAccess={requestAccess}
            showHeader={false}
            showDivider={Boolean(capture)}
          />
        </View>
      ) : null}
      {capture ? (
        <DraftCaptureActions
          actions={capture}
          requestAccess={requestAccess}
          accessPending={draftAccess.status === 'pending'}
          embedded
        />
      ) : null}
    </View>
  );
}

export function DraftBoard({
  capture,
  onRequestAccess,
  captureOnly = false,
}: {
  capture?: DraftCaptureActionsConfig;
  onRequestAccess?: DraftAccessRequest;
  captureOnly?: boolean;
}) {
  return captureOnly ? (
    <CaptureOnlyDraftBoard
      {...(capture ? { capture } : {})}
      {...(onRequestAccess ? { onRequestAccess } : {})}
    />
  ) : (
    <InteractiveDraftBoard
      {...(capture ? { capture } : {})}
      {...(onRequestAccess ? { onRequestAccess } : {})}
    />
  );
}
