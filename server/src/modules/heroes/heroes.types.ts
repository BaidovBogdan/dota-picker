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
};

