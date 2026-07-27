import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useTranslation } from '@/i18n';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { Hero } from '@/types/domain';

type Props = {
  hero?: Hero | undefined;
  size?: number;
  onPress?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
  label?: string | undefined;
  showName?: boolean;
  slotNumber?: string;
  transitionMs?: number;
};

export function HeroPortrait({
  hero,
  size = 58,
  onPress,
  onRemove,
  label,
  showName = true,
  slotNumber,
  transitionMs = 120,
}: Props) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const showImage = Boolean(hero?.imageUrl && hero.imageUrl !== failedImageUrl);
  const initials = hero?.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const fallbackAccent =
    hero?.attribute === 'strength'
      ? colors.enemy
      : hero?.attribute === 'agility'
        ? colors.ally
        : hero?.attribute === 'intelligence'
          ? colors.primary
          : colors.textMuted;

  const portrait = (
    <View
      style={{
        width: size,
        height: size,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: shape.media,
        backgroundColor: hero ? colors.surfaceElevated : colors.surface,
        borderColor: colors.outline,
        borderWidth: 1,
        borderStyle: hero ? 'solid' : 'dashed',
      }}
    >
      {hero && showImage ? (
        <Image
          source={{ uri: hero.imageUrl }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="disk"
          enforceEarlyResizing
          recyclingKey={String(hero.id)}
          transition={transitionMs}
          onError={() => setFailedImageUrl(hero.imageUrl)}
        />
      ) : hero ? (
        <View
          style={{
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <AppText
            variant="data"
            color={fallbackAccent}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ maxWidth: size * 0.72, textAlign: 'center', fontSize: 9 }}
          >
            {initials || '—'}
          </AppText>
        </View>
      ) : (
        <Ionicons name="add" size={22} color={colors.textMuted} />
      )}
      {slotNumber ? (
        <View
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            minWidth: 21,
            minHeight: 17,
            paddingHorizontal: 3,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: hero ? colors.ink : colors.surfaceElevated,
            borderLeftWidth: 1,
            borderTopWidth: 1,
            borderColor: colors.outline,
          }}
        >
          <AppText
            variant="data"
            color={hero ? colors.paper : colors.textMuted}
            style={{ fontSize: 8, lineHeight: 10 }}
          >
            {slotNumber}
          </AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ alignItems: 'center', width: size }}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            hero ? t('draft.editHero', { name: hero.name }) : (label ?? t('draft.addHero'))
          }
          hitSlop={3}
          onPress={onPress}
          style={{ width: size, height: size }}
        >
          {portrait}
        </Pressable>
      ) : (
        portrait
      )}
      {hero && onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('draft.removeHero', { name: hero.name })}
          hitSlop={8}
          onPress={onRemove}
          style={{
            position: 'absolute',
            top: -7,
            right: -7,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: colors.live,
            borderWidth: 2,
            borderColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3,
          }}
        >
          <Ionicons name="close" size={15} color="#FFFFFF" />
        </Pressable>
      ) : null}
      {hero && showName ? (
        <AppText
          variant="caption"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={{ marginTop: 6, width: size + 8, textAlign: 'center', fontSize: 9 }}
        >
          {hero.name}
        </AppText>
      ) : null}
    </View>
  );
}
