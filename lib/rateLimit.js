// lib/rateLimit.js - tiny in-memory request limiter (22 Oct 2026).
// Why: a script/tool can fire hundreds of requests per second. This stops that burst BEFORE any database work is done,
// so it also protects the Vercel free-plan CPU. It lives in the memory of one running server instance (best effort, zero database cost):
// the real, permanent protections (2-hour mining gate, atomic balance updates, signed task tokens) are still in the database code.
const buckets = new Map();
let lastPrune = Date.now();

// returns true when `key` has made more than `max` requests inside the last `windowMs`
export function rateLimited(key, max, windowMs) {
    const now = Date.now();
    if (now - lastPrune > 60000) {            // forget old entries so memory never grows
        lastPrune = now;
        for (const [k, v] of buckets) if (now - v.start > v.win) buckets.delete(k);
    }
    let b = buckets.get(key);
    if (!b || now - b.start > windowMs) { b = { start: now, n: 0, win: windowMs }; buckets.set(key, b); }
    b.n++;
    return b.n > max;
}
