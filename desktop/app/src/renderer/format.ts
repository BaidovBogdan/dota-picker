import { localeFor, textFor } from './i18n';
import type { Confidence, EnginePhase, Hero, Language, Position } from './types';

const dateTimeFormatters: Record<Language, Intl.DateTimeFormat> = {
  ru: new Intl.DateTimeFormat(localeFor('ru'), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }),
  en: new Intl.DateTimeFormat(localeFor('en'), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }),
};

const dateFormatters: Record<Language, Intl.DateTimeFormat> = {
  ru: new Intl.DateTimeFormat(localeFor('ru'), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
  en: new Intl.DateTimeFormat(localeFor('en'), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
};

const relativeTimeFormatters: Record<Language, Intl.RelativeTimeFormat> = {
  ru: new Intl.RelativeTimeFormat(localeFor('ru'), { numeric: 'auto' }),
  en: new Intl.RelativeTimeFormat(localeFor('en'), { numeric: 'auto' }),
};

const percentFormatters = new Map<string, Intl.NumberFormat>();

function percentFormatter(language: Language, digits: number): Intl.NumberFormat {
  const key = `${language}:${digits}`;
  const cached = percentFormatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(localeFor(language), {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  percentFormatters.set(key, formatter);
  return formatter;
}

export const formatDateTime = (value: string | null | undefined, language: Language = 'en') => {
  if (!value) return textFor(language, 'Нет данных', 'No data');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return textFor(language, 'Нет данных', 'No data');
  return dateTimeFormatters[language].format(date);
};

export const formatDate = (value: string | null | undefined, language: Language = 'en') => {
  if (!value) return textFor(language, 'Нет данных', 'No data');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return textFor(language, 'Нет данных', 'No data');
  return dateFormatters[language].format(date);
};

export const formatRelative = (value: string | null | undefined, language: Language = 'en') => {
  if (!value) return textFor(language, 'ещё не было', 'never');
  const date = new Date(value);
  const delta = date.getTime() - Date.now();
  if (Number.isNaN(delta)) return textFor(language, 'ещё не было', 'never');
  const formatter = relativeTimeFormatters[language];
  const minutes = Math.round(delta / 60_000);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(delta / 3_600_000);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(delta / 86_400_000), 'day');
};

export const formatPercent = (
  value: number | null | undefined,
  digits = 1,
  language: Language = 'en',
) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return percentFormatter(language, digits).format(value);
};

export const heroName = (hero: Hero | null | undefined, language: Language = 'en') => {
  const technicalName = hero?.name?.replace(/^npc_dota_hero_/, '').replaceAll('_', ' ');
  if (language === 'en') return hero?.localizedName?.trim() || technicalName || 'Unknown hero';
  return hero?.localizedName?.trim() || technicalName || 'Неизвестный герой';
};

export const positionName = (position: Position, language: Language = 'en') => {
  const positions: Record<Language, Record<Position, string>> = {
    ru: {
      1: 'Керри',
      2: 'Мид',
      3: 'Оффлейн',
      4: 'Поддержка',
      5: 'Полная поддержка',
    },
    en: {
      1: 'Carry',
      2: 'Mid',
      3: 'Offlane',
      4: 'Soft Support',
      5: 'Hard Support',
    },
  };
  return positions[language][position];
};

export const rankName = (rank: number | null | undefined, language: Language = 'en') => {
  const ranks: Record<Language, Record<number, string>> = {
    ru: {
      1: 'Рекрут',
      2: 'Страж',
      3: 'Рыцарь',
      4: 'Герой',
      5: 'Легенда',
      6: 'Властелин',
      7: 'Божество',
      8: 'Титан',
    },
    en: {
      1: 'Herald',
      2: 'Guardian',
      3: 'Crusader',
      4: 'Archon',
      5: 'Legend',
      6: 'Ancient',
      7: 'Divine',
      8: 'Immortal',
    },
  };
  return rank
    ? ranks[language][rank] ?? textFor(language, `Ранг ${rank}`, `Rank ${rank}`)
    : textFor(language, 'Все ранги', 'All ranks');
};

export const confidenceName = (confidence: Confidence, language: Language = 'en') => {
  const values: Record<Language, Record<Confidence, string>> = {
    ru: { high: 'Высокая', medium: 'Средняя', low: 'Низкая' },
    en: { high: 'High', medium: 'Medium', low: 'Low' },
  };
  return values[language][confidence];
};

export const reasonName = (reason: string, language: Language = 'en') => {
  const reasons: Record<Language, Record<string, string>> = {
    ru: {
      strong_counter: 'Сильный ответ на выбранных соперников',
      good_role_fit: 'Уверенно играет на выбранной позиции',
      meta_favorite: 'Стабильный результат в актуальной мете',
      fills_team_need: 'Закрывает потребность состава',
      strong_synergy: 'Хорошо сочетается с союзниками',
      stable_across_draft: 'Не проваливается против остального драфта',
      limited_matchup_data: 'Выборка matchup пока ограничена',
    },
    en: {
      strong_counter: 'Strong answer to the selected enemies',
      good_role_fit: 'Reliable fit for the selected position',
      meta_favorite: 'Consistent result in the current meta',
      fills_team_need: 'Fills a gap in your lineup',
      strong_synergy: 'Pairs well with your allies',
      stable_across_draft: 'Remains reliable against the rest of the draft',
      limited_matchup_data: 'Matchup sample is still limited',
    },
  };
  return reasons[language][reason] ?? reason.replaceAll('_', ' ');
};

export const roleName = (role: string, language: Language = 'en') => {
  if (language === 'en') return role;
  const roles: Record<string, string> = {
    Carry: 'Керри',
    Support: 'Поддержка',
    Nuker: 'Бёрст',
    Disabler: 'Контроль',
    Jungler: 'Лес',
    Durable: 'Стойкость',
    Escape: 'Мобильность',
    Pusher: 'Пуш',
    Initiator: 'Инициация',
  };
  return roles[role] ?? role;
};

export const phaseCopy = (phase: EnginePhase, language: Language = 'en') => {
  const copy: Record<Language, Record<EnginePhase, { title: string; description: string }>> = {
    ru: {
      off: { title: 'Ассистент выключен', description: 'Включите его перед поиском матча. Он будет ждать Dota в фоне.' },
      starting: { title: 'Запускаем ассистента', description: 'Проверяем доступ к захвату окна и подключение к серверу.' },
      waiting_for_dota: { title: 'Ждём Dota 2', description: 'Запустите игру. Ассистент сам распознает начало драфта.' },
      watching_draft: { title: 'Драфт найден', description: 'Следим за изменениями пиков и готовим контрпик.' },
      recognizing: { title: 'Распознаём героев', description: 'Сверяем портреты в кадре Dota 2; локальный GSI помогает определить фазу и команду.' },
      analyzing: { title: 'Считаем лучший ответ', description: 'Сверяем матчапы всех рангов, синергию и актуальную мету.' },
      ready: { title: 'Результат готов', description: 'Последний контрпик сохранён в истории.' },
      quota: { title: 'Попытки закончились', description: 'Ассистент поставлен на паузу до обновления лимита.' },
      error: { title: 'Нужно ваше внимание', description: 'Ассистент остановился. Повторите подключение.' },
    },
    en: {
      off: { title: 'Assistant is off', description: 'Turn it on before queuing. It will wait for Dota in the background.' },
      starting: { title: 'Starting assistant', description: 'Checking window capture access and server connection.' },
      waiting_for_dota: { title: 'Waiting for Dota 2', description: 'Launch the game. The assistant will detect the draft automatically.' },
      watching_draft: { title: 'Draft detected', description: 'Watching pick changes and preparing counterpicks.' },
      recognizing: { title: 'Recognizing heroes', description: 'Matching portraits in the Dota 2 frame while local GSI identifies phase and team.' },
      analyzing: { title: 'Calculating the best answer', description: 'Comparing all-rank matchups, synergy, and the current meta.' },
      ready: { title: 'Result is ready', description: 'The latest counterpick was saved to history.' },
      quota: { title: 'No attempts left', description: 'The assistant is paused until your limit refreshes.' },
      error: { title: 'Your attention is needed', description: 'The assistant stopped. Try connecting again.' },
    },
  };
  return copy[language][phase];
};
