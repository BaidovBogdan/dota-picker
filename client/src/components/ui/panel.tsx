import { ComponentProps, PropsWithChildren } from 'react';
import { View } from 'react-native';

import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Props = PropsWithChildren<ComponentProps<typeof View>>;

export function Panel({ children, style, ...props }: Props) {
  const { colors } = useAppTheme();
  return (
    <View
      {...props}
      style={[
        {
          padding: 16,
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderColor: colors.outline,
          borderRadius: shape.card,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
