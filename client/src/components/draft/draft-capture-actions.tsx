import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { type DraftAccessRequest, useDraftAccessGuard } from '@/hooks/use-draft-access';
import { useTranslation } from '@/i18n';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export type DraftCaptureActionsConfig = {
  busy: boolean;
  onCamera: () => void;
  onLibrary: () => void;
};

type Props = {
  actions: DraftCaptureActionsConfig;
  requestAccess?: DraftAccessRequest;
  accessPending?: boolean;
  embedded?: boolean;
};

export function DraftCaptureActions({
  actions,
  requestAccess,
  accessPending,
  embedded = false,
}: Props) {
  const draftAccess = useDraftAccessGuard();
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const guard = requestAccess ?? draftAccess.requestAccess;
  const pending = accessPending ?? draftAccess.status === 'pending';
  const disabled = actions.busy;
  const busy = actions.busy || pending;

  return (
    <View
      style={{
        minHeight: 122,
        padding: 6,
        flexDirection: 'row',
        gap: 6,
        overflow: 'hidden',
        borderWidth: embedded ? 0 : 2,
        borderRadius: embedded ? 0 : shape.card,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.scanDraft')}
        accessibilityHint={t('home.scanHint')}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={() => guard(actions.onCamera)}
        android_ripple={{ color: alpha.bone12 }}
        style={{
          minHeight: 110,
          width: '75%',
          flexGrow: 0,
          flexShrink: 1,
          minWidth: 0,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          overflow: 'hidden',
          borderRadius: shape.control,
          backgroundColor: colors.cobalt,
        }}
      >
        <AppText
          variant="display"
          color="#FFFFFF"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.68}
          style={{ flex: 1, minWidth: 0, fontSize: 27, lineHeight: 28 }}
        >
          {busy ? t('common.loading') : t('home.scanDraft')}
        </AppText>
        <View
          style={{
            width: 46,
            height: 46,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: shape.round,
            backgroundColor: alpha.bone12,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="scan-outline" size={27} color="#FFFFFF" />
          )}
        </View>
      </Pressable>

      <View style={{ flex: 1, minWidth: 74, gap: 6 }}>
        <CaptureAction
          icon="create-outline"
          label={t('home.manualEntry')}
          disabled={disabled}
          busy={pending}
          onPress={() => guard(() => router.push('/draft/manual' as Href))}
        />
        <CaptureAction
          icon="images-outline"
          label={t('draft.gallery')}
          disabled={disabled}
          busy={pending}
          onPress={() => guard(actions.onLibrary)}
        />
      </View>
    </View>
  );
}

function CaptureAction({
  icon,
  label,
  disabled,
  busy,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.background }}
      style={{
        minHeight: 52,
        flex: 1,
        minWidth: 0,
        paddingHorizontal: 6,
        paddingVertical: 5,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        borderRadius: shape.compact,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <Ionicons name={icon} size={19} color={colors.text} />
      <AppText
        variant="data"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ maxWidth: '100%', fontSize: 8, lineHeight: 10, textAlign: 'center' }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
