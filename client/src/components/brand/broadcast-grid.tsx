import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

import { useAppTheme } from '@/theme/use-app-theme';

export function BroadcastGrid() {
  const { colors } = useAppTheme();
  return (
    <Svg pointerEvents="none" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
      <Defs>
        <Pattern id="broadcast-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <Path d="M 24 0 L 0 0 0 24" fill="none" stroke={colors.grid} strokeWidth="1" />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#broadcast-grid)" />
    </Svg>
  );
}
