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
  ) {}

  public async get(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.freshUntil > now) {
      return cached.value;
    }

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
          staleUntil: loadedAt + this.staleMs,
        });
        return value;
      })
      .catch((error: unknown) => {
        if (cached && cached.staleUntil > now) {
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

