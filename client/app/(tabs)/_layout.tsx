import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { useCallback } from 'react';

import { DotaTabBar } from '@/components/navigation/dota-tab-bar';

export default function TabLayout() {
  return <CustomTabs />;
}

function CustomTabs() {
  const renderTabBar = useCallback((props: BottomTabBarProps) => <DotaTabBar {...props} />, []);
  return (
    <Tabs tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
