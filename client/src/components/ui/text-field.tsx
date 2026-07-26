import { ComponentProps, useState } from 'react';
import { StyleProp, TextInput, View, ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Props = ComponentProps<typeof TextInput> & {
  label: string;
  error?: string | undefined;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({ label, error, containerStyle, onFocus, onBlur, ...props }: Props) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const accent = error ? colors.live : focused ? colors.cobalt : colors.outline;

  return (
    <View style={[{ marginBottom: 16 }, containerStyle]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 7,
        }}
      >
        <AppText variant="data" color={focused ? colors.cobalt : colors.textMuted}>
          {label}
        </AppText>
        <View
          style={{
            width: focused ? 34 : 12,
            height: 4,
            borderRadius: 2,
            backgroundColor: accent,
          }}
        />
      </View>
      <TextInput
        {...props}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        accessibilityLabel={error ? `${label}. ${error}` : label}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.cobalt}
        autoCapitalize="none"
        style={[
          {
            minHeight: 56,
            paddingHorizontal: 14,
            color: colors.text,
            fontFamily: 'IBMPlexSans_500Medium',
            fontSize: 15,
            backgroundColor: focused ? colors.surface : colors.surfaceElevated,
            borderWidth: 2,
            borderRadius: shape.control,
            borderColor: accent,
            outlineStyle: 'solid',
            outlineWidth: 0,
            outlineColor: colors.transparent,
          },
          props.style,
        ]}
      />
      {error ? (
        <AppText
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          variant="caption"
          color={colors.live}
          style={{ marginTop: 6 }}
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
