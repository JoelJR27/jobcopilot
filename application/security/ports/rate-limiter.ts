export interface RateLimitRule { key: string; limit: number; windowMs: number }
export interface RateLimiter { consume(rule: RateLimitRule): Promise<number> }
