import { ComponentProps, PropsWithChildren } from 'react';
import { PixelRatio, Platform, StyleSheet, Text, TextStyle } from 'react-native';

import { useAppTheme } from '@/theme/use-app-theme';

type Variant = 'display' | 'title' | 'inscription' | 'body' | 'label' | 'data' | 'caption';
type Props = PropsWithChildren<
  ComponentProps<typeof Text> & {
    variant?: Variant;
    color?: string;
  }
>;

const variantStyle = {
  display: {
    fontFamily: 'Oswald_700Bold',
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -0.7,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'Oswald_700Bold',
    fontSize: 24,
    lineHeight: 27,
    letterSpacing: -0.25,
    textTransform: 'uppercase',
  },
  inscription: {
    fontFamily: 'Oswald_600SemiBold',
    fontSize: 19,
    lineHeight: 22,
    letterSpacing: 0.1,
    textTransform: 'uppercase',
  },
  body: { fontFamily: 'IBMPlexSans_400Regular', fontSize: 15, lineHeight: 22 },
  label: { fontFamily: 'IBMPlexSans_600SemiBold', fontSize: 14, lineHeight: 19 },
  data: {
    fontFamily: 'IBMPlexMono_500Medium',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  caption: { fontFamily: 'IBMPlexSans_500Medium', fontSize: 12.5, lineHeight: 18 },
} as const;

const withOswaldInsets = (
  style: TextStyle,
  allowFontScaling: boolean | undefined,
  maxFontSizeMultiplier: number | undefined | null,
) => {
  if (
    Platform.OS === 'web' ||
    !style.fontFamily?.startsWith('Oswald_') ||
    typeof style.fontSize !== 'number' ||
    typeof style.lineHeight !== 'number'
  ) {
    return style;
  }

  const fontScale =
    allowFontScaling === false
      ? 1
      : typeof maxFontSizeMultiplier === 'number' && maxFontSizeMultiplier > 0
        ? Math.min(PixelRatio.getFontScale(), maxFontSizeMultiplier)
        : PixelRatio.getFontScale();
  const fontSize = style.fontSize * fontScale;
  const lineHeight = style.lineHeight * fontScale;
  const halfNegativeLeading = Math.max(0, (fontSize * 1.482 - lineHeight) / 2);
  const topInset = Math.ceil(
    Math.max(0, fontSize * 1.042 - (fontSize * 1.193 - halfNegativeLeading)),
  );
  const bottomInset = Math.ceil(
    Math.max(0, fontSize * 0.166 - (fontSize * 0.289 - halfNegativeLeading)),
  );

  if (topInset === 0 && bottomInset === 0) return style;

  const paddingTop =
    typeof style.paddingTop === 'number'
      ? style.paddingTop
      : typeof style.paddingVertical === 'number'
        ? style.paddingVertical
        : typeof style.padding === 'number'
          ? style.padding
          : 0;
  const paddingBottom =
    typeof style.paddingBottom === 'number'
      ? style.paddingBottom
      : typeof style.paddingVertical === 'number'
        ? style.paddingVertical
        : typeof style.padding === 'number'
          ? style.padding
          : 0;

  return {
    ...style,
    ...(Platform.OS === 'android' ? { includeFontPadding: true } : {}),
    paddingTop: paddingTop + topInset,
    paddingBottom: paddingBottom + bottomInset,
  };
};

export function AppText({ variant = 'body', color, style, children, ...props }: Props) {
  const { colors } = useAppTheme();
  const flattenedStyle = StyleSheet.flatten<TextStyle>([
    variantStyle[variant] as TextStyle,
    { color: color ?? colors.text },
    style,
  ]);

  return (
    <Text
      {...props}
      style={withOswaldInsets(flattenedStyle, props.allowFontScaling, props.maxFontSizeMultiplier)}
    >
      {children}
    </Text>
  );
}
