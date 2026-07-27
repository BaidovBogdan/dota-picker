import type {
  ActivityEvent,
  AdminAnalysis,
  AdminHeroDetail,
  AdminMetaSnapshot,
  AdminReview,
  AdminUser,
  DailyMetric,
  HeroPosition,
  RankBracket,
} from '../types';

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
  const enemyCount = 1 + (index % 5);
  const allyCount = index % 5;
  const enemyHeroes = Array.from(
    { length: enemyCount },
    (_, heroIndex) => heroes[(index + heroIndex * 3) % heroes.length],
  );
  const allyHeroes = Array.from(
    { length: allyCount },
    (_, heroIndex) => heroes[(index + enemyCount * 3 + heroIndex * 5) % heroes.length],
  ).filter((hero) => !enemyHeroes.includes(hero));
  const recommendations = recommendation
    ? Array.from(
        new Set([
          recommendation,
          heroes[(index * 5 + 8) % heroes.length],
          heroes[(index * 5 + 13) % heroes.length],
        ]),
      ).slice(0, 3)
    : [];
  return {
    id: `chk_${String(9_200 + index).padStart(6, '0')}`,
    userId: user.id,
    status: failed ? 'failed' : processing ? 'processing' : 'completed',
    source,
    imageUrl: source === 'photo' ? draftScreenshots[index % draftScreenshots.length] : null,
    recommendation,
    recommendations,
    position: ((index % 5) + 1) as HeroPosition,
    rank: index % 9 === 0 ? null : ((index % 8) + 1) as RankBracket,
    allyHeroes,
    enemyHeroes,
    confidence: source === 'photo' && !failed ? 0.82 + ((index * 11) % 17) / 100 : null,
    durationMs: processing ? null : failed ? 30_000 : 1_150 + ((index * 317) % 3_900),
    patch: index < 89 ? '7.41' : '7.40c',
    costUsd: source === 'photo' ? 0.0021 + ((index * 3) % 11) / 10_000 : 0,
    errorCode: failed ? (index % 2 === 0 ? 'VISION_TIMEOUT' : 'IMAGE_TOO_BLURRY') : null,
    createdAt: isoMinutesAgo(3 + index * 46),
  };
});

const reviewHeroIds: Record<string, number> = {
  Abaddon: 102,
  Axe: 2,
  Bane: 3,
  Bristleback: 99,
  'Drow Ranger': 6,
  Earthshaker: 7,
  'Ember Spirit': 106,
  Invoker: 74,
  Juggernaut: 8,
  Lina: 25,
  Lion: 26,
  Mars: 129,
  Pangolier: 120,
  'Phantom Assassin': 44,
  Puck: 13,
  'Queen of Pain': 39,
  Rubick: 86,
  'Shadow Fiend': 11,
  'Storm Spirit': 17,
  Tidehunter: 29,
  Ursa: 70,
  Windranger: 21,
};

const reviewHeroSlugs: Record<string, string> = {
  'Queen of Pain': 'queenofpain',
  Windranger: 'windrunner',
};

const toReviewHero = (name: string) => ({
  id: reviewHeroIds[name] ?? 1,
  name,
  imageUrl: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${
    reviewHeroSlugs[name] ?? name.toLowerCase().replaceAll(' ', '_')
  }.png`,
});

const reviewComments = [
  'Взял первого героя и действительно выиграл линию. Хотелось бы ещё видеть сложность исполнения.',
  'Контрпик сработал, объяснение по синергии было особенно полезным.',
  'Второй вариант оказался лучше первого для нашего состава.',
  null,
  'Рекомендации хорошие, но против этого драфта не хватило героя с быстрым темпом.',
  'Фото распозналось правильно, результат получил быстро.',
  'Помогло принять решение перед последним пиком.',
  null,
  'Не согласен с первым вариантом, зато третий полностью закрыл матчап.',
  'Добавьте больше информации по предметам после выбора героя.',
];

const completedAnalyses = initialAnalyses.filter((analysis) => analysis.status === 'completed');

export const initialReviews: AdminReview[] = Array.from({ length: 24 }, (_, index) => {
  const analysis = completedAnalyses[index % completedAnalyses.length]!;
  const rating = ([5, 5, 4, 5, 3, 4, 5, 4, 2, 5, 4, 5] as const)[index % 12]!;
  const selectedHeroes = index % 4 === 0
    ? []
    : [
        toReviewHero(analysis.recommendations[0]!),
        ...(index % 3 === 0 ? [toReviewHero(analysis.recommendations[1]!)] : []),
      ];
  const createdAt = isoMinutesAgo(17 + index * 79);
  return {
    id: `review-${String(index + 1).padStart(4, '0')}`,
    userId: analysis.userId,
    analysisId: analysis.id,
    rating,
    selectedHeroes,
    comment: reviewComments[index % reviewComments.length] ?? null,
    createdAt,
    updatedAt: createdAt,
  };
});

const metaHeroes = [
  { id: 42, name: 'skeleton_king', localizedName: 'Wraith King', slug: 'skeleton_king', roles: ['Carry', 'Durable'], position: 1 },
  { id: 13, name: 'puck', localizedName: 'Puck', slug: 'puck', roles: ['Initiator', 'Disabler'], position: 2 },
  { id: 2, name: 'axe', localizedName: 'Axe', slug: 'axe', roles: ['Initiator', 'Durable'], position: 3 },
  { id: 123, name: 'hoodwink', localizedName: 'Hoodwink', slug: 'hoodwink', roles: ['Support', 'Nuker'], position: 4 },
  { id: 111, name: 'oracle', localizedName: 'Oracle', slug: 'oracle', roles: ['Support', 'Nuker'], position: 5 },
] as const;

const heroImage = (slug: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;

const createMetaSnapshot = (rank: RankBracket | null): AdminMetaSnapshot => {
  const rankShift = rank === null ? 0 : rank - 4.5;
  const positionStats = metaHeroes.map((hero, index) => {
    const picks = Math.max(24, Math.round(1_860 - index * 143 + rankShift * (37 + index * 3)));
    const winRate = Math.min(0.612, Math.max(0.501, 0.573 - index * 0.006 + rankShift * 0.0018));
    return {
      heroId: hero.id,
      position: hero.position as HeroPosition,
      picks,
      wins: Math.round(picks * winRate),
      winRate,
      isApproximate: hero.position !== 2,
      method: hero.position === 2 ? 'lane_role' as const : 'lane_role_farm_priority' as const,
    };
  });
  return {
    heroes: metaHeroes.map((hero, index) => {
      const position = positionStats[index];
      return {
        id: hero.id,
        name: hero.name,
        localizedName: hero.localizedName,
        imageUrl: heroImage(hero.slug),
        roles: [...hero.roles],
        picks: position.picks,
        wins: position.wins,
        winRate: position.winRate,
      };
    }),
    patch: '7.41',
    rank,
    rankFilter: rank === null ? 'all_ranks' : 'average_match_rank',
    window: 'current_patch_30d',
    minimumGames: 10,
    fetchedAt: isoMinutesAgo(rank === null ? 18 : 23 + (rank ?? 0)),
    isStale: false,
    availability: 'ready',
    positionStats,
  };
};

export const metaSnapshots: AdminMetaSnapshot[] = [
  createMetaSnapshot(null),
  ...Array.from({ length: 8 }, (_, index) => createMetaSnapshot((index + 1) as RankBracket)),
];

export const heroDetails: AdminHeroDetail[] = metaHeroes.map((hero, heroIndex) => {
  const rankWinRates = Array.from({ length: 8 }, (_, index) => {
    const rank = (index + 1) as RankBracket;
    const games = 210 + heroIndex * 44 + rank * 31;
    const winRate = 0.526 + heroIndex * 0.004 + (rank - 4.5) * 0.0026;
    return {
      rank,
      games,
      wins: Math.round(games * winRate),
      winRate,
      window: 'rolling_7d' as const,
    };
  });
  return {
    heroId: hero.id,
    generatedAt: isoMinutesAgo(38 + heroIndex * 11),
    isStale: false,
    rankWinRates,
    builds: [
      {
        id: `${hero.name}-tempo`,
        games: 132 + heroIndex * 17,
        wins: 74 + heroIndex * 9,
        winRate: 0.561 + heroIndex * 0.003,
        itemNames: ['Power Treads', 'Magic Wand', 'Blink Dagger', 'Black King Bar'],
      },
      {
        id: `${hero.name}-scaling`,
        games: 96 + heroIndex * 13,
        wins: 51 + heroIndex * 7,
        winRate: 0.531 + heroIndex * 0.004,
        itemNames: ['Phase Boots', 'Aghanim’s Scepter', 'Shard', 'Refresher Orb'],
      },
    ],
    buildSampleSize: 412 + heroIndex * 76,
    availability: { builds: 'ready' },
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
    detail: 'Снимок ролей P1–P5 для патча 7.41',
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
