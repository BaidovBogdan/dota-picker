import { PropsWithChildren, ReactNode } from 'react';
import { Animated, ScrollViewProps, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BroadcastGrid } from '@/components/brand/broadcast-grid';
import { layout } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type Props = PropsWithChildren<{
  scroll?: boolean;
  bottomInset?: number;
  keyboard?: boolean;
  nativeHeader?: boolean;
  showGrid?: boolean;
  onScroll?: ScrollViewProps['onScroll'];
  scrollEventThrottle?: number;
  refreshControl?: ScrollViewProps['refreshControl'];
  stickyHeader?: ReactNode;
}>;

export function Screen({
  children,
  scroll = true,
  bottomInset = 88,
  keyboard = false,
  nativeHeader = false,
  showGrid = false,
  onScroll,
  scrollEventThrottle,
  refreshControl,
  stickyHeader,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const horizontalGutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const content = scroll ? (
    <Animated.ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentInsetAdjustmentBehavior={nativeHeader ? 'automatic' : undefined}
      automaticallyAdjustKeyboardInsets={keyboard}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={scrollEventThrottle}
      refreshControl={refreshControl}
      contentContainerStyle={{
        width: '100%',
        maxWidth: layout.contentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: horizontalGutter,
        paddingTop: nativeHeader ? 0 : 10,
        paddingBottom: bottomInset + (nativeHeader ? 0 : insets.bottom),
      }}
    >
      {children}
    </Animated.ScrollView>
  ) : (
    <View
      style={{
        flex: 1,
        width: '100%',
        maxWidth: layout.contentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: horizontalGutter,
        paddingBottom: insets.bottom,
      }}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={nativeHeader ? [] : ['top']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {showGrid ? <BroadcastGrid /> : null}
      {stickyHeader}
      {content}
    </SafeAreaView>
  );
}
