type CacheEntry<T> = {
  value: T;
  freshUntil: number;
  staleUntil: number;
};

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly pending = new Map<string, Promise<T>>();

  public constructor(
    private readonly freshMs: number,
    private readonly staleMs: number,
    private readonly retryMs = Math.min(freshMs, 5 * 60 * 1_000),
  ) {}

  public async get(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.freshUntil > now) {
      return cached.value;
    }

    if (cached && cached.staleUntil > now) {
      void this.refresh(key, loader, cached).catch(() => undefined);
      return cached.value;
    }

    return this.refresh(key, loader, cached);
  }

  public peek(key: string): { value: T; isFresh: boolean } | undefined {
    const cached = this.entries.get(key);
    const now = Date.now();
    if (!cached || cached.staleUntil <= now) {
      return undefined;
    }
    return {
      value: cached.value,
      isFresh: cached.freshUntil > now,
    };
  }

  private async refresh(
    key: string,
    loader: () => Promise<T>,
    cached: CacheEntry<T> | undefined,
  ): Promise<T> {
    const existingRequest = this.pending.get(key);
    if (existingRequest) {
      return existingRequest;
    }

    const request = loader()
      .then((value) => {
        const loadedAt = Date.now();
        this.entries.set(key, {
          value,
          freshUntil: loadedAt + this.freshMs,
          staleUntil: loadedAt + Math.max(this.freshMs, this.staleMs),
        });
        return value;
      })
      .catch((error: unknown) => {
        const failedAt = Date.now();
        if (cached && cached.staleUntil > failedAt) {
          this.entries.set(key, {
            ...cached,
            freshUntil: Math.min(failedAt + this.retryMs, cached.staleUntil),
          });
          return cached.value;
        }
        throw error;
      })
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, request);
    return request;
  }
}
