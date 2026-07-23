// Small in-memory fixed-window rate limiter. Keyed by client IP + bucket. It is per-process,
// which is fine for a single Railway instance; a multi-instance deployment would need a
// shared store (e.g. Redis). This is a coarse abuse/brute-force guard, not a precise quota.
export function clientIp(req) {
    const forwarded = req?.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }
    return req?.socket?.remoteAddress || req?.connection?.remoteAddress || "unknown";
}
export function createRateLimiter() {
    const hits = new Map();
    function check(key, rule, now = Date.now()) {
        const limit = Math.max(1, Math.floor(rule.limit));
        const windowMs = Math.max(1, Math.floor(rule.windowMs));
        const existing = hits.get(key);
        if (!existing || now >= existing.resetAt) {
            hits.set(key, { count: 1, resetAt: now + windowMs });
            return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
        }
        if (existing.count >= limit) {
            return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, existing.resetAt - now) };
        }
        existing.count += 1;
        return { allowed: true, remaining: Math.max(0, limit - existing.count), retryAfterMs: 0 };
    }
    // Drop expired entries so the map does not grow without bound. Cheap to call periodically.
    function sweep(now = Date.now()) {
        for (const [key, entry] of hits) {
            if (now >= entry.resetAt) hits.delete(key);
        }
    }
    return { check, sweep };
}
