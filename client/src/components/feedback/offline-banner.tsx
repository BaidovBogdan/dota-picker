import { useNetInfo } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useTranslation } from '@/i18n';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export function OfflineBanner() {
  const network = useNetInfo();
  const [isOnline, setIsOnline] = useState(() => onlineManager.isOnline());
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  useEffect(() => onlineManager.subscribe(setIsOnline), []);

  if (isOnline !== false && network.isConnected !== false && network.isInternetReachable !== false)
    return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={`${t('states.offlineTitle')}. ${t('states.offlineBody')}`}
      style={[
        styles.root,
        {
          borderColor: colors.outline,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <View style={[styles.status, { backgroundColor: colors.live }]}>
        <View style={styles.signal} />
        <AppText variant="data" color="#FFFFFF" numberOfLines={1}>
          {t('common.offline')}
        </AppText>
      </View>
      <View style={styles.copy}>
        <AppText variant="caption" color={colors.text}>
          {t('states.offlineBody')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 54,
    marginBottom: 12,
    borderWidth: 2,
    borderRadius: shape.card,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  status: {
    width: 92,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: 'center',
    gap: 5,
  },
  signal: {
    width: 22,
    height: 2,
    backgroundColor: '#FFFFFF',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});
