export type RankBracket = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type DraftDataPopulationId = 'ranked_all_pick' | 'public_all_pick';

export type DraftDataSource =
  | 'opendota_public_matches_explorer_positions'
  | 'opendota_public_matches_lane_roles';

export type DraftDataPopulation = {
  id: DraftDataPopulationId;
  version: 1;
  audience: 'opendota_recent_public_sample';
  lobbyTypes: number[];
  gameModes: number[];
  minimumMatches: number;
};

export type DraftDataHealth = {
  snapshotId: string | null;
  snapshotVersion: 1;
  source: DraftDataSource;
  population: DraftDataPopulation;
  fallbackFrom: DraftDataPopulationId | null;
  matchCount: number;
  minimumMatches: number;
  rankMatchCounts: Partial<Record<RankBracket, number>>;
  generatedAt: string | null;
  expiresAt: string | null;
  availability: 'ready' | 'collecting' | 'unavailable';
  isStale: boolean;
};

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
  statisticsScope?: 'rank' | 'all_ranks' | undefined;
};

export type DraftSnapshotHero = HeroMeta & {
  rankStats: Partial<Record<RankBracket, { picks: number; wins: number }>>;
};

export type DraftPairStat = {
  heroId: number;
  patchGames: number;
  patchWins: number;
  rankGames: number;
  rankWins: number;
};

export type DraftPairScope = {
  patch: string;
  rank: RankBracket | null;
  rankFilter: 'average_match_rank' | 'all_ranks';
  window: 'current_patch' | 'rolling_recent_public_matches';
  fetchedAt: string;
  isStale: boolean;
  availability: 'ready' | 'collecting' | 'unavailable';
  dataHealth?: DraftDataHealth | undefined;
};

export type MetaSnapshot = {
  heroes: HeroMeta[];
  patch: string;
  fetchedAt: string;
  matchupByEnemy: Map<number, Map<number, DraftPairStat>>;
  synergyByAlly: Map<number, Map<number, DraftPairStat>>;
  pairScope: DraftPairScope | null;
  matchupBaselineByHero?: Map<number, number>;
  positionMeta?: MetaPositionSnapshot;
  dataHealth?: DraftDataHealth | undefined;
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

export type HeroPositionMethod =
  | 'lane_role'
  | 'lane_role_farm_priority'
  | 'lane_role_scenario'
  | 'lane_role_scenario_approximation';

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
  window:
    | 'current_patch_30d'
    | 'current_patch_parsed_lane_roles'
    | 'rolling_lane_role_scenarios';
  minimumGames: number;
  fetchedAt: string;
  isStale: boolean;
  availability: MetaPositionAvailability;
  positionStats: HeroPositionStat[];
  dataHealth?: DraftDataHealth | undefined;
};
