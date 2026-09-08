import { redisConnection } from "./redis";

/**
 * Per-sender, per-hour-window counter stored in Redis.
 *
 * Key shape: ratelimit:<senderId>:<hourBucket>
 * hourBucket = current hour truncated, e.g. "2026-09-07T14"
 *
 * Why this is safe across multiple worker processes:
 * Redis INCR is atomic - even if 10 worker instances call this at the exact
 * same millisecond for the same sender, each INCR is serialized by Redis
 * itself, so the count is always correct. No in-memory counter could give
 * that guarantee across processes.
 */
function currentHourBucket(date = new Date()): string {
  return date.toISOString().slice(0, 13); // "2026-09-07T14"
}

export function nextHourBoundary(date = new Date()): Date {
  const next = new Date(date);
  next.setMinutes(60, 0, 0); // rolls over to the top of the next hour
  return next;
}

/**
 * Atomically increments the sender's counter for the CURRENT hour and
 * returns whether this send is still allowed under the configured limit.
 *
 * We increment first, then check - if we're over, the caller is responsible
 * for NOT sending and instead rescheduling (see worker.ts). We don't
 * decrement on "not allowed" because the slot for that hour is still
 * conceptually claimed/contended; simplest correct behavior for this
 * assignment's scope.
 */
export async function tryConsumeRateLimitSlot(
  senderId: string,
  maxPerHour: number
): Promise<{ allowed: boolean; countThisHour: number }> {
  const bucket = currentHourBucket();
  const key = `ratelimit:${senderId}:${bucket}`;

  const count = await redisConnection.incr(key);
  if (count === 1) {
    // first write to this bucket - set expiry so old buckets don't pile up
    await redisConnection.expire(key, 60 * 60 * 2); // 2h safety margin
  }

  return { allowed: count <= maxPerHour, countThisHour: count };
}
