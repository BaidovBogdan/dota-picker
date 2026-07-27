export type RankBracket = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type HeroMeta = {
  id: number;
  name: string;
  localizedName: string;
  primaryAttribute: 'str' | 'agi' | 'int' | 'all';
  attackType: 'Melee' | 'Ranged';
  roles: string[];
  imageUrl: string;
  iconUrl: string;
  picks: number;
  wins: number;
  winRate: number;
};

export type MatchupStat = {
  heroId: number;
  gamesPlayed: number;
  wins: number;
};

export type MetaSnapshot = {
  heroes: HeroMeta[];
  patch: string;
  fetchedAt: string;
  matchupByEnemy: Map<number, Map<number, MatchupStat>>;
  matchupBaselineByHero?: Map<number, number>;
  positionMeta?: MetaPositionSnapshot;
};

export type PatchMeta = {
  id: number;
  name: string;
  releasedAt: string | null;
};

export type RankWinRate = {
  rank: RankBracket;
  games: number;
  wins: number;
  winRate: number | null;
  window: 'rolling_7d';
};

export type HeroBuildItem = {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  order: number;
  medianPurchaseSec: number;
  p25PurchaseSec: number;
  p75PurchaseSec: number;
};

export type HeroBuildVariant = {
  id: string;
  games: number;
  wins: number;
  winRate: number;
  items: HeroBuildItem[];
  source: 'parsed_current_patch';
};

export type HeroBuildAvailability = 'ready' | 'collecting' | 'unavailable';

export type HeroDetail = {
  hero: HeroMeta;
  patch: PatchMeta;
  generatedAt: string;
  isStale: boolean;
  rankWinRates: RankWinRate[];
  builds: HeroBuildVariant[];
  buildSampleSize: number;
  availability: {
    builds: HeroBuildAvailability;
  };
};

export type HeroPosition = 1 | 2 | 3 | 4 | 5;

export type HeroPositionMethod = 'lane_role' | 'lane_role_farm_priority';

export type HeroPositionStat = {
  heroId: number;
  position: HeroPosition;
  picks: number;
  wins: number;
  winRate: number;
  isApproximate: boolean;
  method: HeroPositionMethod;
};

export type MetaPositionAvailability = 'ready' | 'collecting';

export type MetaPositionSnapshot = {
  patch: string;
  rank: RankBracket | null;
  rankFilter: 'average_match_rank' | 'all_ranks';
  window: 'current_patch_30d';
  minimumGames: number;
  fetchedAt: string;
  isStale: boolean;
  availability: MetaPositionAvailability;
  positionStats: HeroPositionStat[];
};
