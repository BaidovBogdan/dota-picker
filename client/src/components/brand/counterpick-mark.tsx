import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/theme/use-app-theme';

type Props = { size?: number };

export function CounterpickMark({ size = 40 }: Props) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: colors.live,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: '-3deg' }],
      }}
    >
      <AppText
        variant="inscription"
        color="#FFFFFF"
        maxFontSizeMultiplier={1}
        style={{ fontSize: size * 0.42, lineHeight: size * 0.52, letterSpacing: -0.5 }}
      >
        CP
      </AppText>
    </View>
  );
}
