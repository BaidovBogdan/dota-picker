import type {
  Account,
  Analysis,
  HistoryPage,
  NativeBridge,
  Quota,
  Review,
  ReviewsPage,
  SessionState,
} from './types';

const native = () => {
  const bridge = (window as unknown as { counterpick?: NativeBridge }).counterpick;
  if (!bridge) throw new Error('Desktop bridge is unavailable');
  return bridge;
};

const normalizeAccount = (
  value: Account | { account: Account } | SessionState,
): Account => {
  if ('authenticated' in value) {
    if (!value.account) throw new Error('Session does not contain an account');
    return value.account;
  }
  return 'account' in value ? value.account : value;
};

export const desktop = {
  session: {
    async bootstrap(): Promise<SessionState> {
      const value = await native().session.bootstrap();
      if (!value) return { authenticated: false, account: null };
      if ('authenticated' in value) return value;
      return { authenticated: true, account: normalizeAccount(value) };
    },
    requestOtp: (input: Parameters<NativeBridge['session']['requestOtp']>[0]) =>
      native().session.requestOtp(input),
    async login(input: Parameters<NativeBridge['session']['login']>[0]) {
      return normalizeAccount(await native().session.login(input));
    },
    async register(input: Parameters<NativeBridge['session']['register']>[0]) {
      return normalizeAccount(await native().session.register(input));
    },
    async reset(input: Parameters<NativeBridge['session']['reset']>[0]) {
      return normalizeAccount(await native().session.reset(input));
    },
    async change(input: Parameters<NativeBridge['session']['change']>[0]) {
      return normalizeAccount(await native().session.change(input));
    },
    logout: () => native().session.logout(),
    async me(): Promise<Account> {
      return normalizeAccount(await native().session.getMe());
    },
    async quota(): Promise<Quota> {
      const value = await native().session.getQuota();
      return 'quota' in value ? value.quota : value;
    },
    deleteAccount: () => native().session.deleteAccount(),
  },
  data: {
    async history(input?: Parameters<NativeBridge['data']['history']>[0]): Promise<HistoryPage> {
      const value = await native().data.history(input);
      return {
        items: value.items,
        nextCursor: value.nextCursor ?? null,
      };
    },
    async analysis(id: string): Promise<Analysis> {
      const value = await native().data.analysis(id);
      return 'analysis' in value ? value.analysis : value;
    },
    async heroes() {
      const value = await native().data.heroes();
      return Array.isArray(value) ? value : value.heroes;
    },
    meta: (input: Parameters<NativeBridge['data']['meta']>[0]) =>
      native().data.meta(input),
    hero: (id: number) => native().data.hero(id),
    async reviews(
      input?: Parameters<NativeBridge['data']['reviews']>[0],
    ): Promise<ReviewsPage> {
      const value = await native().data.reviews(input);
      if ('reviews' in value) {
        return {
          items: value.reviews,
          nextCursor: null,
          total: value.reviews.length,
        };
      }
      return value;
    },
    async upsertReview(
      analysisId: string,
      input: Parameters<NativeBridge['data']['upsertReview']>[1],
    ): Promise<Review> {
      const value = await native().data.upsertReview(analysisId, input);
      return 'review' in value ? value.review : value;
    },
    deleteReview: (id: string) => native().data.deleteReview(id),
  },
  billing: {
    status: () => native().billing.status(),
  },
  engine: {
    getState: () => native().engine.getState(),
    setEnabled: (enabled: boolean) => native().engine.setEnabled(enabled),
    retry: () => native().engine.retry(),
    subscribe(listener: Parameters<NativeBridge['engine']['onState']>[0]) {
      return native().engine.onState(listener) ?? (() => undefined);
    },
  },
  preferences: {
    get: () => native().preferences.get(),
    update: (input: Parameters<NativeBridge['preferences']['update']>[0]) =>
      native().preferences.update(input),
  },
  window: {
    minimize: () => native().window.minimize(),
    maximize: () => native().window.maximize(),
    close: () => native().window.close(),
    isMaximized: () => native().window.isMaximized(),
    subscribe(listener: Parameters<NativeBridge['window']['onMaximized']>[0]) {
      return native().window.onMaximized(listener) ?? (() => undefined);
    },
  },
  app: {
    openExternal: (url: string) => native().app.openExternal(url),
    getInfo: () => native().app.getInfo(),
  },
};
