import { Stack } from 'expo-router';
import { View } from 'react-native';

import { MatchReadyLoader } from '@/components/analysis/match-ready-loader';
import { Screen } from '@/components/layout/screen';
import { useTranslation } from '@/i18n';

export default function LoaderPreviewScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen
        options={{
          title: t('analysis.title'),
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Screen nativeHeader scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 24 }}>
          <MatchReadyLoader />
        </View>
      </Screen>
    </>
  );
}
