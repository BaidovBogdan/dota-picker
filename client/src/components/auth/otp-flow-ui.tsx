import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

const OTP_LENGTH = 4;
const OTP_CELL_WIDTH = 58;
const OTP_CELL_HEIGHT = 64;
const OTP_CELL_GAP = 10;
const OTP_ROW_WIDTH = OTP_CELL_WIDTH * OTP_LENGTH + OTP_CELL_GAP * (OTP_LENGTH - 1);
const OTP_ROW_OFFSETS = Array.from(
  { length: OTP_LENGTH },
  (_, index) => (index - (OTP_LENGTH - 1) / 2) * (OTP_CELL_WIDTH + OTP_CELL_GAP),
);
const OTP_CROSS_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;

type OtpTextFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  error?: string | undefined;
  invalid?: boolean;
  pending: boolean;
  autoFocus?: boolean;
  onSubmit?: () => void;
  onComplete?: (code: string) => void;
  animatedVerification?: boolean;
  verified?: boolean;
  onVerifiedAnimationComplete?: () => void;
};

export function OtpTextField({
  value,
  onChangeText,
  onBlur,
  error,
  invalid = false,
  pending,
  autoFocus = false,
  onSubmit,
  onComplete,
  animatedVerification = false,
  verified = false,
  onVerifiedAnimationComplete,
}: OtpTextFieldProps) {
  const { colors, alpha } = useAppTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);
  const submittedCodeRef = useRef<string | null>(null);
  const animationStartedRef = useRef(false);
  const collapseStartedRef = useRef(false);
  const successStartedRef = useRef(false);
  const completionRef = useRef(onVerifiedAnimationComplete);
  const [focused, setFocused] = useState(false);
  const [orbitReady, setOrbitReady] = useState(false);
  const [collapseComplete, setCollapseComplete] = useState(false);
  const orbit = useSharedValue(0);
  const success = useSharedValue(0);

  const markOrbitReady = useCallback(() => {
    setOrbitReady(true);
  }, []);
  const markCollapseComplete = useCallback(() => {
    setCollapseComplete(true);
  }, []);
  const notifyVerifiedAnimationComplete = useCallback(() => {
    completionRef.current?.();
  }, []);

  useEffect(() => {
    completionRef.current = onVerifiedAnimationComplete;
  }, [onVerifiedAnimationComplete]);

  useEffect(() => {
    if (value.length < OTP_LENGTH) submittedCodeRef.current = null;
  }, [value]);

  useEffect(() => {
    if (!animatedVerification) return;

    if (pending && value.length === OTP_LENGTH && !animationStartedRef.current) {
      animationStartedRef.current = true;
      collapseStartedRef.current = false;
      successStartedRef.current = false;
      setOrbitReady(reduceMotion);
      setCollapseComplete(false);
      cancelAnimation(orbit);
      cancelAnimation(success);
      success.value = 0;

      if (reduceMotion) {
        orbit.value = 0;
      } else {
        orbit.value = 0;
        orbit.value = withTiming(
          0.84,
          {
            duration: 2_050,
            easing: Easing.linear,
          },
          (finished) => {
            if (finished) scheduleOnRN(markOrbitReady);
          },
        );
      }
      return;
    }

    if (animationStartedRef.current && pending && reduceMotion && !orbitReady) {
      cancelAnimation(orbit);
      orbit.value = 0;
      setOrbitReady(true);
      return;
    }

    if (
      animationStartedRef.current &&
      !verified &&
      (value.length < OTP_LENGTH || (!pending && invalid))
    ) {
      animationStartedRef.current = false;
      collapseStartedRef.current = false;
      successStartedRef.current = false;
      setOrbitReady(false);
      setCollapseComplete(false);
      cancelAnimation(orbit);
      cancelAnimation(success);
      success.value = 0;
      orbit.value = reduceMotion
        ? 0
        : withTiming(0, {
            duration: 320,
            easing: Easing.out(Easing.cubic),
          });
    }
  }, [
    animatedVerification,
    invalid,
    markOrbitReady,
    orbit,
    orbitReady,
    pending,
    reduceMotion,
    success,
    value.length,
    verified,
  ]);

  useEffect(() => {
    if (
      !animatedVerification ||
      !verified ||
      (!orbitReady && !reduceMotion) ||
      collapseStartedRef.current
    ) {
      return;
    }

    collapseStartedRef.current = true;
    if (reduceMotion) {
      const frame = requestAnimationFrame(markCollapseComplete);
      return () => cancelAnimationFrame(frame);
    }

    cancelAnimation(orbit);
    orbit.value = withTiming(
      1,
      {
        duration: 360,
        easing: Easing.inOut(Easing.cubic),
      },
      (finished) => {
        if (finished) scheduleOnRN(markCollapseComplete);
      },
    );
  }, [animatedVerification, markCollapseComplete, orbit, orbitReady, reduceMotion, verified]);

  useEffect(() => {
    if (!animatedVerification || !verified || !collapseComplete || successStartedRef.current) {
      return;
    }

    successStartedRef.current = true;
    cancelAnimation(success);
    success.value = 0;
    success.value = withTiming(
      1,
      {
        duration: reduceMotion ? 220 : 760,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) scheduleOnRN(notifyVerifiedAnimationComplete);
      },
    );
  }, [
    animatedVerification,
    collapseComplete,
    notifyVerifiedAnimationComplete,
    reduceMotion,
    success,
    verified,
  ]);

  useEffect(
    () => () => {
      cancelAnimation(orbit);
      cancelAnimation(success);
    },
    [orbit, success],
  );

  const groupStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      orbit.value,
      [0, 0.18, 0.8, 1],
      [0, 0, 720, 720],
      Extrapolation.CLAMP,
    );

    return {
      opacity: interpolate(success.value, [0, 0.28], [1, 0], Extrapolation.CLAMP),
      transform: [{ rotate: `${rotation}deg` }],
    };
  });
  const successStyle = useAnimatedStyle(() => ({
    opacity: interpolate(success.value, [0, 0.18, 1], [0, 1, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(success.value, [0, 0.52, 1], [0.82, 1.03, 1], Extrapolation.CLAMP),
      },
    ],
  }));
  const outerRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(success.value, [0, 0.14, 0.8, 1], [0, 0.72, 0.18, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(success.value, [0, 1], [0.18, 1.65], Extrapolation.CLAMP),
      },
    ],
  }));
  const innerRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(success.value, [0, 0.18, 1], [0, 0.76, 0.18], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(success.value, [0, 0.82, 1], [0.28, 1.08, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const sanitizedValue = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
  const activeIndex = Math.min(sanitizedValue.length, OTP_LENGTH - 1);
  const handleChangeText = (rawValue: string) => {
    const nextValue = rawValue.replace(/\D/g, '').slice(0, OTP_LENGTH);
    onChangeText(nextValue);

    if (
      nextValue.length === OTP_LENGTH &&
      nextValue !== submittedCodeRef.current &&
      !pending &&
      onComplete
    ) {
      submittedCodeRef.current = nextValue;
      if (animatedVerification) Keyboard.dismiss();
      onComplete(nextValue);
    }
  };

  return (
    <View style={{ marginBottom: 14 }}>
      <AppText variant="data" color={error || invalid ? colors.live : colors.textMuted}>
        {t('auth.otpCode')}
      </AppText>

      <View
        style={{
          height: animatedVerification ? 214 : 82,
          marginTop: 8,
          justifyContent: 'center',
        }}
      >
        <Animated.View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.otpStage,
            {
              width: OTP_ROW_WIDTH,
              height: animatedVerification ? 164 : OTP_CELL_HEIGHT,
              top: '50%',
              marginTop: -(animatedVerification ? 164 : OTP_CELL_HEIGHT) / 2,
            },
            groupStyle,
          ]}
        >
          {Array.from({ length: OTP_LENGTH }, (_, index) => (
            <OtpDigitCell
              key={index}
              index={index}
              digit={sanitizedValue[index] ?? ''}
              active={focused && activeIndex === index && !pending}
              error={Boolean(error) || invalid}
              animated={animatedVerification}
              orbit={orbit}
              success={success}
            />
          ))}
        </Animated.View>

        {animatedVerification ? (
          <Animated.View
            pointerEvents="none"
            accessible={verified}
            accessibilityRole="text"
            style={[styles.successStage, successStyle]}
          >
            <AppText variant="title" style={{ textAlign: 'center' }}>
              {t('auth.verifiedTitle')}
            </AppText>
            <AppText
              variant="caption"
              color={colors.textMuted}
              style={{ marginTop: 4, textAlign: 'center' }}
            >
              {t('auth.verifiedBody')}
            </AppText>
            <View style={styles.successMark}>
              <Animated.View
                style={[styles.successOuterRing, { borderColor: colors.success }, outerRingStyle]}
              />
              <Animated.View
                style={[styles.successInnerRing, { borderColor: colors.success }, innerRingStyle]}
              />
              <View
                style={[
                  styles.successCheck,
                  {
                    borderColor: colors.success,
                    backgroundColor: colors.surface,
                    shadowColor: colors.success,
                  },
                ]}
              >
                <Ionicons name="checkmark" size={27} color={colors.success} />
              </View>
            </View>
            <AppText variant="data" color={colors.success} style={{ textAlign: 'center' }}>
              {t('auth.verifiedSecure')}
            </AppText>
          </Animated.View>
        ) : null}

        <TextInput
          ref={inputRef}
          value={sanitizedValue}
          onChangeText={handleChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur();
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
          textContentType="oneTimeCode"
          importantForAutofill="yes"
          maxLength={OTP_LENGTH}
          selection={{ start: sanitizedValue.length, end: sanitizedValue.length }}
          editable={!pending && !verified}
          autoFocus={autoFocus}
          returnKeyType={onSubmit ? 'go' : 'done'}
          onSubmitEditing={onSubmit}
          caretHidden
          contextMenuHidden={false}
          selectionColor="transparent"
          accessibilityLabel={t('auth.otpCode')}
          accessibilityValue={{ text: `${sanitizedValue.length} / ${OTP_LENGTH}` }}
          style={[
            styles.hiddenInput,
            {
              width: OTP_ROW_WIDTH,
              height: animatedVerification ? 164 : OTP_CELL_HEIGHT,
              top: '50%',
              marginTop: -(animatedVerification ? 164 : OTP_CELL_HEIGHT) / 2,
              color: 'transparent',
              backgroundColor: 'transparent',
            },
          ]}
        />
      </View>

      {error ? (
        <AppText
          accessibilityRole="alert"
          variant="caption"
          color={colors.live}
          style={{ marginTop: 7 }}
        >
          {error}
        </AppText>
      ) : null}

      {!pending && !verified && sanitizedValue.length < OTP_LENGTH ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 0,
            top: 1,
            width: 8,
            height: 8,
            borderRadius: shape.round,
            backgroundColor: focused ? colors.cobalt : alpha.bone20,
          }}
        />
      ) : null}
    </View>
  );
}

function OtpDigitCell({
  index,
  digit,
  active,
  error,
  animated,
  orbit,
  success,
}: {
  index: number;
  digit: string;
  active: boolean;
  error: boolean;
  animated: boolean;
  orbit: SharedValue<number>;
  success: SharedValue<number>;
}) {
  const { colors, alpha } = useAppTheme();
  const direction = OTP_CROSS_DIRECTIONS[index] ?? OTP_CROSS_DIRECTIONS[0];
  const initialX = OTP_ROW_OFFSETS[index] ?? 0;
  const finalOffset = (index - 1.5) * 2.4;
  const animatedStyle = useAnimatedStyle(() => {
    if (!animated) {
      return {
        transform: [{ translateX: initialX }, { translateY: 0 }, { scale: 1 }],
      };
    }

    const progress = orbit.value;
    const moveProgress = interpolate(
      progress,
      [index * 0.018, 0.2 + index * 0.018],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const radius = interpolate(
      progress,
      [0, 0.2, 0.4, 0.72, 0.88, 1],
      [54, 54, 68, 54, 38, 0],
      Extrapolation.CLAMP,
    );
    const collapseProgress = interpolate(progress, [0.88, 1], [0, 1], Extrapolation.CLAMP);
    const targetX = direction.x * radius + finalOffset * collapseProgress;
    const targetY = direction.y * radius + finalOffset * 0.58 * collapseProgress;
    const translateX = initialX + (targetX - initialX) * moveProgress;
    const translateY = targetY * moveProgress;

    return {
      opacity: interpolate(success.value, [0, 0.28], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX },
        { translateY },
        {
          scale: interpolate(progress, [0, 0.86, 1], [1, 0.96, 0.86], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const borderColor = error
    ? colors.live
    : active
      ? colors.cobalt
      : digit
        ? colors.outline
        : alpha.bone20;

  return (
    <Animated.View
      style={[
        styles.otpCell,
        {
          zIndex: index + 1,
          borderColor,
          backgroundColor: colors.surface,
          shadowColor: colors.shadow,
        },
        animatedStyle,
      ]}
    >
      <AppText
        variant="title"
        maxFontSizeMultiplier={1.25}
        style={{
          fontFamily: 'IBMPlexMono_500Medium',
          fontSize: 24,
          lineHeight: 30,
          textAlign: 'center',
        }}
      >
        {digit}
      </AppText>
      {digit ? (
        <>
          <View style={[styles.cellAccentHorizontal, { backgroundColor: colors.live }]} />
          <View style={[styles.cellAccentVertical, { backgroundColor: colors.live }]} />
        </>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  otpStage: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCell: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: OTP_CELL_WIDTH,
    height: OTP_CELL_HEIGHT,
    marginLeft: -OTP_CELL_WIDTH / 2,
    marginTop: -OTP_CELL_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 17,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  cellAccentHorizontal: {
    position: 'absolute',
    top: -2,
    right: 8,
    width: 18,
    height: 2,
    borderRadius: 2,
  },
  cellAccentVertical: {
    position: 'absolute',
    top: 8,
    right: -2,
    width: 2,
    height: 18,
    borderRadius: 2,
  },
  hiddenInput: {
    position: 'absolute',
    alignSelf: 'center',
    opacity: 0.012,
    padding: 0,
  },
  successStage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  successMark: {
    width: 106,
    height: 106,
    marginTop: 9,
    marginBottom: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successOuterRing: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderWidth: 1,
    borderRadius: 46,
  },
  successInnerRing: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderWidth: 1,
    borderRadius: 34,
  },
  successCheck: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 15,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
});

export function DevelopmentOtpNotice() {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  if (!__DEV__) return null;

  return (
    <View
      style={{
        marginBottom: 14,
        padding: 12,
        borderWidth: 2,
        borderRadius: shape.control,
        borderColor: colors.cobalt,
        backgroundColor: colors.surface,
      }}
    >
      <AppText variant="data" color={colors.cobalt}>
        {t('auth.testCodeTitle')}
      </AppText>
      <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
        {t('auth.testCodeBody')}
      </AppText>
    </View>
  );
}

export function AuthErrorBanner({ error }: { error: Error | null }) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  if (!error) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        marginBottom: 14,
        padding: 10,
        borderWidth: 2,
        borderRadius: shape.control,
        borderColor: colors.live,
        backgroundColor: colors.surface,
      }}
    >
      <AppText variant="data" color={colors.live}>
        {t('auth.error')}
      </AppText>
      <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
        {error.message}
      </AppText>
    </View>
  );
}

export function OtpResendButton({
  cooldown,
  pending,
  onPress,
}: {
  cooldown: number;
  pending: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      label={cooldown > 0 ? t('auth.resendCodeIn', { seconds: cooldown }) : t('auth.resendCode')}
      tone="ghost"
      disabled={pending || cooldown > 0}
      onPress={onPress}
      style={{ marginTop: 4 }}
    />
  );
}
