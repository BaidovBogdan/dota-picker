export class ConcurrencyLimiter {
  private active = 0;

  public constructor(private readonly limit: number) {}

  public tryAcquire(): (() => void) | null {
    if (this.active >= this.limit) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }

  public get inFlight(): number {
    return this.active;
  }
}
