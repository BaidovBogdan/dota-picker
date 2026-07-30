import type { Confidence, EnginePhase, Hero, Position } from './types';

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'Нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Нет данных';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Нет данных';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

export const formatRelative = (value: string | null | undefined) => {
  if (!value) return 'ещё не было';
  const date = new Date(value);
  const delta = date.getTime() - Date.now();
  if (Number.isNaN(delta)) return 'ещё не было';
  const formatter = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' });
  const minutes = Math.round(delta / 60_000);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(delta / 3_600_000);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(delta / 86_400_000), 'day');
};

export const formatPercent = (value: number | null | undefined, digits = 1) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
};

export const heroName = (hero: Hero | null | undefined) =>
  hero?.localizedName?.trim() || hero?.name?.replace(/^npc_dota_hero_/, '').replaceAll('_', ' ') || 'Неизвестный герой';

export const positionName = (position: Position) => {
  const positions = {
    1: 'Керри',
    2: 'Мид',
    3: 'Оффлейн',
    4: 'Поддержка',
    5: 'Полная поддержка',
  };
  return positions[position];
};

export const rankName = (rank: number | null | undefined) => {
  const ranks: Record<number, string> = {
    1: 'Рекрут',
    2: 'Страж',
    3: 'Рыцарь',
    4: 'Герой',
    5: 'Легенда',
    6: 'Властелин',
    7: 'Божество',
    8: 'Титан',
  };
  return rank ? ranks[rank] ?? `Ранг ${rank}` : 'Все ранги';
};

export const confidenceName = (confidence: Confidence) => {
  const values: Record<Confidence, string> = {
    high: 'Высокая',
    medium: 'Средняя',
    low: 'Низкая',
  };
  return values[confidence];
};

export const reasonName = (reason: string) => {
  const reasons: Record<string, string> = {
    strong_counter: 'Сильный ответ на выбранных соперников',
    good_role_fit: 'Уверенно играет на выбранной позиции',
    meta_favorite: 'Стабильный результат в актуальной мете',
    fills_team_need: 'Закрывает потребность состава',
    strong_synergy: 'Хорошо сочетается с союзниками',
    stable_across_draft: 'Не проваливается против остального драфта',
    limited_matchup_data: 'Выборка matchup пока ограничена',
  };
  return reasons[reason] ?? reason.replaceAll('_', ' ');
};

export const phaseCopy = (phase: EnginePhase) => {
  const copy: Record<EnginePhase, { title: string; description: string }> = {
    off: {
      title: 'Ассистент выключен',
      description: 'Включите его перед поиском матча. Он будет ждать Dota в фоне.',
    },
    starting: {
      title: 'Запускаем ассистента',
      description: 'Проверяем доступ к захвату окна и подключение к серверу.',
    },
    waiting_for_dota: {
      title: 'Ждём Dota 2',
      description: 'Запустите игру. Ассистент сам распознает начало драфта.',
    },
    watching_draft: {
      title: 'Драфт найден',
      description: 'Следим за изменениями пиков и готовим контрпик.',
    },
    recognizing: {
      title: 'Распознаём героев',
      description: 'Анализируем только окно Dota 2 и сверяем найденные портреты.',
    },
    analyzing: {
      title: 'Считаем лучший ответ',
      description: 'Сверяем матчапы всех рангов, синергию и актуальную мету.',
    },
    ready: {
      title: 'Результат готов',
      description: 'Последний контрпик сохранён в истории.',
    },
    quota: {
      title: 'Попытки закончились',
      description: 'Ассистент поставлен на паузу до обновления лимита.',
    },
    error: {
      title: 'Нужно ваше внимание',
      description: 'Ассистент остановился. Повторите подключение.',
    },
  };
  return copy[phase];
};
