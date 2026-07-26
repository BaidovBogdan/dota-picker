import LottieView from 'lottie-react-native';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

const loadingSource = require('../../../assets/lottie/loading.json');

export function MatchReadyLoader() {
  const reduced = useReducedMotion();
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState(reduced ? 9 : 1);

  useEffect(() => {
    if (reduced) {
      setAccepted(9);
      return;
    }
    setAccepted(1);
    const interval = setInterval(() => {
      setAccepted((current) => Math.min(9, current + 1));
    }, 420);
    return () => clearInterval(interval);
  }, [reduced]);

  const stages = [t('analysis.stageDraft'), t('analysis.stageMeta'), t('analysis.stageCounter')];
  const activeStage = accepted < 4 ? 0 : accepted < 7 ? 1 : 2;

  return (
    <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('analysis.title')}
        accessibilityValue={{
          min: 0,
          max: 9,
          now: accepted,
          text: `${accepted}/9`,
        }}
        style={{
          width: '100%',
          overflow: 'hidden',
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderRadius: shape.card,
          borderColor: colors.outline,
        }}
      >
        <View
          style={{
            minHeight: 42,
            flexDirection: 'row',
            alignItems: 'stretch',
            borderBottomWidth: 2,
            borderBottomColor: colors.outline,
          }}
        >
          <View
            style={{
              minWidth: 68,
              paddingHorizontal: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.live,
            }}
          >
            <AppText variant="data" color={colors.onPrimary}>
              {t('brand.live')}
            </AppText>
          </View>
          <View
            style={{
              flex: 1,
              paddingHorizontal: 11,
              alignItems: 'flex-start',
              justifyContent: 'center',
            }}
          >
            <AppText variant="data" color={colors.textMuted}>
              {t('analysis.title')}
            </AppText>
          </View>
          <View
            style={{
              minWidth: 60,
              paddingHorizontal: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.text,
            }}
          >
            <AppText variant="inscription" color={colors.background}>
              {String(accepted).padStart(2, '0')}/09
            </AppText>
          </View>
        </View>

        <View
          style={{
            minHeight: 176,
            flexDirection: 'row',
            borderBottomWidth: 2,
            borderBottomColor: colors.outline,
          }}
        >
          <View
            style={{
              width: '42%',
              minWidth: 126,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.cobalt,
              borderRightWidth: 2,
              borderRightColor: colors.outline,
            }}
          >
            <View
              pointerEvents="none"
              style={{
                width: 108,
                height: 108,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.onPrimary,
                borderWidth: 2,
                borderRadius: shape.feature,
                borderColor: colors.outline,
              }}
            >
              <LottieView
                source={loadingSource}
                resizeMode="contain"
                renderMode="AUTOMATIC"
                style={{ width: 86, height: 86 }}
                webStyle={{ width: 86, height: 86 }}
                {...(reduced
                  ? Platform.OS === 'web'
                    ? { autoPlay: false, loop: false }
                    : { progress: 0.58 }
                  : { autoPlay: true, loop: true, speed: 0.92 })}
              />
            </View>
          </View>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              paddingHorizontal: 14,
              paddingVertical: 18,
              justifyContent: 'space-between',
            }}
          >
            <AppText variant="data" color={colors.live}>
              0{activeStage + 1} / 03
            </AppText>
            <AppText
              variant="display"
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.62}
              style={{ fontSize: 35, lineHeight: 36, flexShrink: 1 }}
            >
              {stages[activeStage]}
            </AppText>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {Array.from({ length: 9 }, (_, index) => (
                <View
                  key={index}
                  style={{
                    flex: 1,
                    height: 8,
                    backgroundColor:
                      index < accepted ? (index >= 6 ? colors.live : colors.cobalt) : alpha.bone12,
                  }}
                />
              ))}
            </View>
          </View>
        </View>

        <View>
          {stages.map((stage, index) => {
            const complete = index < activeStage;
            const active = index === activeStage;
            return (
              <View
                key={stage}
                style={{
                  minHeight: 48,
                  paddingHorizontal: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 11,
                  backgroundColor: active ? alpha.primary16 : colors.surface,
                  borderBottomWidth: index === stages.length - 1 ? 0 : 1,
                  borderBottomColor: colors.outline,
                }}
              >
                <View
                  style={{
                    width: 32,
                    minHeight: 26,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active
                      ? colors.cobalt
                      : complete
                        ? colors.text
                        : colors.surfaceElevated,
                    borderWidth: active || complete ? 0 : 1,
                    borderColor: colors.outline,
                  }}
                >
                  <AppText
                    variant="data"
                    color={
                      active ? colors.onPrimary : complete ? colors.background : colors.textMuted
                    }
                  >
                    0{index + 1}
                  </AppText>
                </View>
                <AppText
                  variant="label"
                  color={active || complete ? colors.text : colors.textMuted}
                  style={{ flex: 1 }}
                >
                  {stage}
                </AppText>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: active ? colors.live : complete ? colors.cobalt : alpha.bone12,
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>

      <View
        style={{
          marginTop: 14,
          minHeight: 44,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          borderLeftWidth: 6,
          borderLeftColor: colors.live,
        }}
      >
        <AppText variant="data" color={colors.textMuted}>
          {t('analysis.doNotClose')}
        </AppText>
      </View>
    </View>
  );
}
