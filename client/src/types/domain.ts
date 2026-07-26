export type HeroAttribute = 'strength' | 'agility' | 'intelligence' | 'universal';
export type Position = 1 | 2 | 3 | 4 | 5;
export type DraftTeam = 'allies' | 'enemies';
export type DraftSource = 'manual' | 'photo';
export type PlanId = 'free' | 'pro';

export type Hero = {
  id: number;
  slug: string;
  name: string;
  attribute: HeroAttribute;
  positions: Position[];
  imageUrl: string;
  iconUrl?: string;
  picks?: number;
  wins?: number;
  winRate?: number;
};

export type Draft = {
  allies: number[];
  enemies: number[];
  position: Position | null;
  rank: number | null;
  source: DraftSource;
  photoUri: string | null;
  updatedAt: string;
};

export type Recommendation = {
  hero: Hero;
  score: number;
  label: 'best' | 'reliable' | 'fallback' | 'Лучший ответ' | 'Надёжный выбор' | 'Запасной план';
  reasons: string[];
  risks: string[];
  laneFit: string;
};

export type AnalysisResult = {
  id: string;
  serverId?: string;
  ownerScope?: string;
  draft: Draft;
  recommendations: Recommendation[];
  patch: string;
  confidence: 'high' | 'medium' | 'low';
  dataUpdatedAt: string;
  createdAt: string;
  source: 'server' | 'offline';
};

export type HistoryRecord = AnalysisResult;

export type Session = {
  userId: string;
  kind: 'guest' | 'registered';
  email: string | null;
  displayName: string;
  plan: PlanId;
  revenueCatAppUserId: string;
};

export type ThemeMode = 'system' | 'light' | 'dark';
export type Language = 'ru' | 'en';
export type LanguageMode = 'system' | Language;

export type Attempts = {
  remaining: number;
  maximum: number;
  nextRefreshAt: string;
  planExpiresAt?: string | null;
};

export type NeutralRecognizedPick = {
  heroId: number | null;
  name: string;
  slot: number;
  confidence: number;
  needsReview: boolean;
};

export type RecognizedDraft = {
  allies: number[];
  enemies: number[];
  neutralPicks: NeutralRecognizedPick[];
  confidence: number;
  warnings: string[];
};

export type BillingPlan = {
  packageId: string;
  productId: string;
  title: string;
  price: string;
  period: 'monthly' | 'annual' | 'unknown';
};
