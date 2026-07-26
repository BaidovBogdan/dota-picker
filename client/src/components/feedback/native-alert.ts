import { Alert, Platform } from 'react-native';

type AlertAction = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export function showNativeAlert(title: string, message: string, actions: AlertAction[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, actions, {
      cancelable: actions.some((action) => action.style === 'cancel'),
    });
    return;
  }

  const confirmation = actions.find((action) => action.style !== 'cancel') ?? actions[0];
  const hasCancel = actions.some((action) => action.style === 'cancel');
  if (hasCancel) {
    if (typeof globalThis.confirm === 'function' && globalThis.confirm(`${title}\n\n${message}`)) {
      confirmation?.onPress?.();
    }
    return;
  }

  if (typeof globalThis.alert === 'function') globalThis.alert(`${title}\n\n${message}`);
  confirmation?.onPress?.();
}
