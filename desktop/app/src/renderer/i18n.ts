import { useCallback } from 'react';
import { useAppStore } from './store';
import type { Language } from './types';

export function localeFor(language: Language): string {
  return language === 'en' ? 'en-US' : 'ru-RU';
}

export function textFor(language: Language, russian: string, english: string): string {
  return language === 'en' ? english : russian;
}

export function useI18n() {
  const language = useAppStore((state) => state.preferences?.language ?? 'en');
  const text = useCallback(
    (russian: string, english: string) => textFor(language, russian, english),
    [language],
  );
  return {
    language,
    locale: localeFor(language),
    text,
  };
}
