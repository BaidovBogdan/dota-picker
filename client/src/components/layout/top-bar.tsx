import { ReactNode } from 'react';
import { Animated, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { layout } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Props = {
  title?: string;
  eyebrow?: string;
  trailing?: ReactNode;
  dividerOpacity?: Animated.AnimatedInterpolation<number>;
};

export function TopBar({ title = 'Counterpick', eyebrow, trailing, dividerOpacity }: Props) {
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const horizontalGutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const showContext = title.toLowerCase() !== 'counterpick' || Boolean(eyebrow);

  return (
    <View
      style={{
        minHeight: 66,
        width: '100%',
        maxWidth: layout.contentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: horizontalGutter,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <AppText
          variant="inscription"
          maxFontSizeMultiplier={1.2}
          style={{ fontSize: 20, lineHeight: 22, letterSpacing: -0.4 }}
        >
          COUNTER
        </AppText>
        <View style={{ backgroundColor: colors.live, paddingHorizontal: 4, marginLeft: 3 }}>
          <AppText
            variant="inscription"
            color="#FFFFFF"
            maxFontSizeMultiplier={1.2}
            style={{ fontSize: 20, lineHeight: 22, letterSpacing: -0.4 }}
          >
            PICK
          </AppText>
        </View>
      </View>
      {showContext ? (
        <View
          style={{
            flex: 1,
            minWidth: 0,
            marginLeft: 12,
            paddingLeft: 12,
            borderLeftWidth: 1,
            borderColor: colors.outline,
          }}
        >
          {eyebrow ? (
            <AppText
              variant="data"
              color={colors.textMuted}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {eyebrow}
            </AppText>
          ) : null}
          {title.toLowerCase() !== 'counterpick' ? (
            <AppText
              variant="inscription"
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 16, lineHeight: 18 }}
            >
              {title}
            </AppText>
          ) : null}
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {trailing}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          left: 0,
          height: 2,
          opacity: dividerOpacity ?? 0,
          backgroundColor: colors.outline,
        }}
      />
    </View>
  );
}
