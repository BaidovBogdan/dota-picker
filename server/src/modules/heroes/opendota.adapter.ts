import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { ExternalServiceError } from '../../lib/errors.js';
import { TtlCache } from './cache.js';
import type { HeroMeta, MatchupStat, MetaSnapshot, RankBracket } from './heroes.types.js';

const heroStatsSchema = z.array(z.object({
  id: z.number().int().positive(),
  name: z.string(),
  localized_name: z.string(),
  primary_attr: z.enum(['str', 'agi', 'int', 'all']),
  attack_type: z.enum(['Melee', 'Ranged']),
  roles: z.array(z.string()),
  img: z.string(),
  icon: z.string(),
  pub_pick: z.number().nonnegative().optional().default(0),
  pub_win: z.number().nonnegative().optional().default(0),
}).loose());

const matchupSchema = z.array(z.object({
  hero_id: z.number().int().positive(),
  games_played: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
}));

const patchesSchema = z.array(z.object({
  name: z.string(),
  date: z.string().nullable().optional(),
  id: z.number().int(),
}));

type RawHero = z.infer<typeof heroStatsSchema>[number];

export class OpenDotaAdapter {
  private readonly heroesCache: TtlCache<RawHero[]>;
  private readonly patchCache: TtlCache<string>;
  private readonly matchupCache: TtlCache<MatchupStat[]>;

  public constructor(private readonly config: AppConfig['openDota']) {
    this.heroesCache = new TtlCache(config.cacheTtlMs, config.cacheStaleMs);
    this.patchCache = new TtlCache(config.cacheTtlMs, config.cacheStaleMs);
    this.matchupCache = new TtlCache(config.cacheTtlMs, config.cacheStaleMs);
  }

  public async getHeroes(rank?: RankBracket): Promise<HeroMeta[]> {
    const raw = await this.heroesCache.get('hero-stats', async () =>
      heroStatsSchema.parse(await this.request('/heroStats')),
    );
    return raw.map((hero) => this.toHeroMeta(hero, rank));
  }

  public async getPatch(): Promise<string> {
    return this.patchCache.get('patch', async () => {
      const patches = patchesSchema.parse(await this.request('/constants/patch'));
      return patches.at(-1)?.name ?? 'unknown';
    });
  }

  public async getMatchups(heroId: number): Promise<MatchupStat[]> {
    return this.matchupCache.get(String(heroId), async () => {
      const result = matchupSchema.parse(await this.request(`/heroes/${heroId}/matchups`));
      return result.map((matchup) => ({
        heroId: matchup.hero_id,
        gamesPlayed: matchup.games_played,
        wins: matchup.wins,
      }));
    });
  }

  public async getSnapshot(rank: RankBracket | undefined, enemyIds: number[]): Promise<MetaSnapshot> {
    const fetchedAt = new Date().toISOString();
    const [heroes, patch, matchupResults] = await Promise.all([
      this.getHeroes(rank),
      this.getPatch().catch(() => 'unknown'),
      Promise.allSettled(enemyIds.map(async (enemyId) => [enemyId, await this.getMatchups(enemyId)] as const)),
    ]);
    const matchups = matchupResults.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);

    return {
      heroes,
      patch: patch === 'unknown' ? 'rolling meta' : `${patch} · rolling matchups`,
      fetchedAt,
      matchupByEnemy: new Map(matchups.map(([enemyId, stats]) => [
        enemyId,
        new Map(stats.map((stat) => [stat.heroId, stat])),
      ])),
    };
  }

  private toHeroMeta(hero: RawHero, rank?: RankBracket): HeroMeta {
    const rankedPicks = rank ? this.numberField(hero, `${rank}_pick`) : 0;
    const rankedWins = rank ? this.numberField(hero, `${rank}_win`) : 0;
    const picks = rankedPicks > 0 ? rankedPicks : hero.pub_pick;
    const wins = rankedPicks > 0 ? rankedWins : hero.pub_win;

    return {
      id: hero.id,
      name: hero.name.replace('npc_dota_hero_', ''),
      localizedName: hero.localized_name,
      primaryAttribute: hero.primary_attr,
      attackType: hero.attack_type,
      roles: hero.roles,
      imageUrl: `https://cdn.cloudflare.steamstatic.com${hero.img}`,
      iconUrl: `https://cdn.cloudflare.steamstatic.com${hero.icon}`,
      picks,
      wins,
      winRate: picks > 0 ? wins / picks : 0.5,
    };
  }

  private numberField(hero: RawHero, key: string) {
    const value = hero[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private async request(path: string): Promise<unknown> {
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`OpenDota responded with ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new ExternalServiceError('Dota meta data is temporarily unavailable', {
        provider: 'OpenDota',
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
