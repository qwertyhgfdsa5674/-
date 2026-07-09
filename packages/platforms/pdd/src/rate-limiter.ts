export class PddRateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private tokens: number;
  private lastRefillAt: number;

  public constructor(requestsPerSecond = 5) {
    this.capacity = requestsPerSecond;
    this.refillPerMs = requestsPerSecond / 1000;
    this.tokens = requestsPerSecond;
    this.lastRefillAt = Date.now();
  }

  public async acquire(): Promise<void> {
    while (true) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillAt;

    if (elapsedMs <= 0) {
      return;
    }

    this.tokens = Math.min(this.capacity, this.tokens + elapsedMs * this.refillPerMs);
    this.lastRefillAt = now;
  }
}
