import type { ActivityEvent, AdminAnalysis, AdminUser, DailyMetric } from '../types';

const now = new Date('2026-07-26T16:35:00.000Z');

const names = [
  'Алексей Морозов',
  'Илья Волков',
  'Мария Орлова',
  'Даниил Ким',
  'Анна Белова',
  'Тимур Садыков',
  'Егор Павлов',
  'София Лебедева',
  'Никита Фролов',
  'Полина Новикова',
  'Maksim Gray',
  'Oliver Chen',
  'Артём Котов',
  'Виктория Юдина',
  'Роман Захаров',
  'Дарья Соколова',
  'Кирилл Мельник',
  'Алина Воронова',
  'Denis Rowe',
  'Mia Foster',
  'Сергей Громов',
  'Олег Сафин',
  'Валерия Тихонова',
  'Степан Королёв',
  'Лев Михайлов',
  'Ксения Миронова',
  'Arman Lee',
  'Noah King',
  'Ярослав Денисов',
  'Елена Крылова',
  'Дмитрий Самойлов',
  'Надежда Романова',
];

const countries = ['KZ', 'RU', 'UA', 'DE', 'PL', 'US', 'GE', 'UZ'];
const devices = [
  'iPhone 16 Pro',
  'iPhone 15',
  'iPhone 14 Pro',
  'Pixel 10',
  'Galaxy S26',
  'Nothing Phone 4',
  'iPad Air',
  'Pixel 9a',
];
const draftScreenshots = [
  new URL('../../../client/assets/brand/battleground-hero-v2.jpg', import.meta.url).href,
  new URL('../../../client/assets/brand/draft-scan-hero-light.jpg', import.meta.url).href,
];
const heroes = [
  'Abaddon',
  'Axe',
  'Bane',
  'Bristleback',
  'Drow Ranger',
  'Earthshaker',
  'Ember Spirit',
  'Invoker',
  'Juggernaut',
  'Lina',
  'Lion',
  'Mars',
  'Pangolier',
  'Phantom Assassin',
  'Puck',
  'Queen of Pain',
  'Rubick',
  'Shadow Fiend',
  'Storm Spirit',
  'Tidehunter',
  'Ursa',
  'Windranger',
];

const isoMinutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('ё', 'e')
    .replaceAll(/[^\p{L}\p{N}]+/gu, '.')
    .replaceAll(/^\.+|\.+$/g, '');

export const initialUsers: AdminUser[] = Array.from({ length: 42 }, (_, index) => {
  const kind = index % 5 === 0 || index % 11 === 0 ? 'guest' : 'user';
  const plan = kind === 'user' && (index % 4 === 0 || index % 9 === 0) ? 'pro' : 'free';
  const displayName = kind === 'guest' ? `Гость ${4208 + index * 37}` : names[index % names.length];
  const createdMinutesAgo = 180 + index * 1_931;
  const lastActiveMinutesAgo = index < 6 ? index * 4 + 2 : 24 + index * 87;
  const analysesCount = 1 + ((index * 13 + 7) % 84);

  return {
    id: `usr_${String(index + 1).padStart(4, '0')}`,
    displayName,
    email: kind === 'user' ? `${slugify(displayName)}${index > names.length - 1 ? index : ''}@example.com` : null,
    kind,
    plan,
    status: index === 13 || index === 31 ? 'suspended' : 'active',
    quotaBalance: plan === 'pro' ? 17 + (index % 11) : index % 4,
    analysesCount,
    successRate: 86 + ((index * 7) % 135) / 10,
    country: countries[(index * 3) % countries.length],
    device: devices[(index * 5) % devices.length],
    createdAt: isoMinutesAgo(createdMinutesAgo),
    lastActiveAt: isoMinutesAgo(lastActiveMinutesAgo),
    planExpiresAt: plan === 'pro' ? new Date(now.getTime() + (9 + index) * 86_400_000).toISOString() : null,
  };
});

export const initialAnalyses: AdminAnalysis[] = Array.from({ length: 126 }, (_, index) => {
  const user = initialUsers[(index * 7) % initialUsers.length];
  const failed = index % 19 === 0 || index % 37 === 0;
  const processing = !failed && index % 41 === 0;
  const source = index % 4 === 0 ? 'manual' : 'photo';
  const recommendation = failed || processing ? null : heroes[(index * 5 + 3) % heroes.length];
  const detectedCount = 3 + (index % 7);

  return {
    id: `chk_${String(9_200 + index).padStart(6, '0')}`,
    userId: user.id,
    status: failed ? 'failed' : processing ? 'processing' : 'completed',
    source,
    imageUrl: source === 'photo' ? draftScreenshots[index % draftScreenshots.length] : null,
    recommendation,
    position: (index % 5) + 1,
    detectedHeroes: Array.from(
      { length: detectedCount },
      (_, heroIndex) => heroes[(index + heroIndex * 3) % heroes.length],
    ),
    confidence: source === 'photo' && !failed ? 0.82 + ((index * 11) % 17) / 100 : null,
    durationMs: processing ? null : failed ? 30_000 : 1_150 + ((index * 317) % 3_900),
    patch: index < 89 ? '7.39d' : '7.39c',
    costUsd: source === 'photo' ? 0.0021 + ((index * 3) % 11) / 10_000 : 0,
    errorCode: failed ? (index % 2 === 0 ? 'VISION_TIMEOUT' : 'IMAGE_TOO_BLURRY') : null,
    createdAt: isoMinutesAgo(3 + index * 46),
  };
});

export const dailyMetrics: DailyMetric[] = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(now.getTime() - (29 - index) * 86_400_000);
  const weekday = date.getUTCDay();
  const weekendFactor = weekday === 0 || weekday === 6 ? 1.16 : 1;
  const trend = 76 + index * 3.1;
  const wave = Math.sin(index / 2.2) * 14 + Math.cos(index / 4.7) * 9;
  const checks = Math.round((trend + wave) * weekendFactor);
  return {
    date: date.toISOString(),
    checks,
    users: Math.round(checks * (0.43 + (index % 4) * 0.025)),
    failures: Math.max(2, Math.round(checks * (0.045 + (index % 5) * 0.006))),
  };
});

export const initialActivity: ActivityEvent[] = [
  {
    id: 'evt_1',
    type: 'analysis',
    title: 'Проверка завершена',
    detail: 'Queen of Pain · позиция 2 · 94%',
    createdAt: isoMinutesAgo(1),
    tone: 'positive',
  },
  {
    id: 'evt_2',
    type: 'user',
    title: 'Новый пользователь',
    detail: 'sofia.lebedeva@example.com',
    createdAt: isoMinutesAgo(4),
    tone: 'neutral',
  },
  {
    id: 'evt_3',
    type: 'billing',
    title: 'Подключён Pro',
    detail: 'Месячная подписка · $3.99',
    createdAt: isoMinutesAgo(7),
    tone: 'positive',
  },
  {
    id: 'evt_4',
    type: 'analysis',
    title: 'Не удалось распознать',
    detail: 'Слишком размытое изображение',
    createdAt: isoMinutesAgo(12),
    tone: 'negative',
  },
  {
    id: 'evt_5',
    type: 'system',
    title: 'OpenDota обновлён',
    detail: 'Снимок меты для патча 7.39d',
    createdAt: isoMinutesAgo(19),
    tone: 'neutral',
  },
  {
    id: 'evt_6',
    type: 'analysis',
    title: 'Проверка завершена',
    detail: 'Earthshaker · позиция 4 · 91%',
    createdAt: isoMinutesAgo(24),
    tone: 'positive',
  },
  {
    id: 'evt_7',
    type: 'system',
    title: 'Повышенная задержка',
    detail: 'Vision API · p95 4.8 сек',
    createdAt: isoMinutesAgo(41),
    tone: 'warning',
  },
];
