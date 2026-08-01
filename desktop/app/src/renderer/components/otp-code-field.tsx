import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useI18n } from '../i18n';

const OTP_LENGTH = 4;

const normalizeCode = (value: string) => value.replace(/\D/g, '').slice(0, OTP_LENGTH);

type OtpCodeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  onBlur?: () => void;
  label: string;
  hint?: string;
  error?: string;
  name?: string;
  autoFocus?: boolean;
  pending?: boolean;
  disabled?: boolean;
};

export function OtpCodeField({
  value,
  onChange,
  onComplete,
  onBlur,
  label,
  hint,
  error,
  name,
  autoFocus = false,
  pending = false,
  disabled = false,
}: OtpCodeFieldProps) {
  const { text } = useI18n();
  const generatedId = useId();
  const inputId = `otp-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const statusId = pending ? `${inputId}-status` : undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedCodeRef = useRef<string | null>(null);
  const [focused, setFocused] = useState(false);
  const code = normalizeCode(value);
  const describedBy = [errorId, !error ? hintId : undefined, statusId].filter(Boolean).join(' ') || undefined;

  useEffect(() => {
    if (code.length < OTP_LENGTH) submittedCodeRef.current = null;
  }, [code]);

  useEffect(() => {
    if (!error) return;
    submittedCodeRef.current = null;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [error]);

  const submitCode = (nextCode: string) => {
    if (
      nextCode.length !== OTP_LENGTH ||
      submittedCodeRef.current === nextCode ||
      pending ||
      disabled ||
      !onComplete
    ) {
      return;
    }
    submittedCodeRef.current = nextCode;
    onComplete(nextCode);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextCode = normalizeCode(event.currentTarget.value);
    onChange(nextCode);
    submitCode(nextCode);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitCode(code);
  };

  const activeIndex = Math.min(code.length, OTP_LENGTH - 1);

  return (
    <div
      className={`otp-code-field ${error ? 'is-invalid' : ''} ${pending ? 'is-pending' : ''}`}
      aria-busy={pending}
    >
      <label className="otp-code-field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="otp-code-field__stage">
        <div className="otp-code-field__cells" aria-hidden>
          {Array.from({ length: OTP_LENGTH }, (_, index) => {
            const digit = code[index] ?? '';
            const active = focused && !pending && activeIndex === index;
            return (
              <span
                className={`otp-code-field__cell ${digit ? 'is-filled' : ''} ${active ? 'is-active' : ''}`}
                key={index}
              >
                {digit}
              </span>
            );
          })}
        </div>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          className="otp-code-field__input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          enterKeyHint="done"
          maxLength={OTP_LENGTH}
          value={code}
          autoFocus={autoFocus}
          disabled={disabled || pending}
          spellCheck={false}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={(event) => {
            setFocused(true);
            if (error && code.length === OTP_LENGTH) event.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
        />
      </div>
      {error ? (
        <span className="otp-code-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="otp-code-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {pending ? (
        <span className="sr-only" id={statusId} role="status">
          {text('Проверяем код', 'Verifying code')}
        </span>
      ) : null}
    </div>
  );
}
