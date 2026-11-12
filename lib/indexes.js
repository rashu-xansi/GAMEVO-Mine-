// lib/indexes.js — ONE list of every database index + TTL (auto-delete) rule of this project (9 Nov 2026).
// Used by BOTH `node models/schema.js` and the /api/admin/setup-indexes endpoint, so the two can never disagree again
// (before: promos.expiresAt was 0s in one and 86400s in the other, so whichever ran second failed with IndexOptionsConflict).
//
// ensureIndexes() is safe to run again and again:
//   • index missing                       -> created
//   • index exists with a different TTL   -> TTL changed in place (collMod), no downtime, no data loss
//   • index exists with other differences -> dropped and re-created
const D = 86400;
export const INDEX_SPECS = [
    // ── users ──
    { c: 'users', k: { referredBy: 1 } },
    { c: 'users', k: { isBanned: 1 } },
    { c: 'users', k: { weeklyReferralCount: -1 } },
    { c: 'users', k: { completedReferralCount: 1 } },
    // TTL: a BANNED user's whole document is deleted 60 days after bannedAt (the permanent bannedTelegramIds / bannedDevices registries keep the ban)
    { c: 'users', k: { bannedAt: 1 }, o: { expireAfterSeconds: 60 * D, partialFilterExpression: { isBanned: true } } },
    // TTL: 90 days without opening the app -> the whole user document is deleted (rolling: api/user.js init and withdrawCreate refresh lastActiveAt)
    { c: 'users', k: { lastActiveAt: 1 }, o: { expireAfterSeconds: 90 * D } },
    // ── tasks ──
    { c: 'tasks', k: { isApproved: 1, category: 1, createdAt: -1 } },
    { c: 'tasks', k: { createdBy: 1, isUserCreated: 1, createdAt: -1 } },
    { c: 'tasks', k: { isUserCreated: 1, reviewStatus: 1, createdAt: 1 } },
    // TTL: a user-created task is deleted 5 days after it reached its completion limit
    { c: 'tasks', k: { completedAt: 1 }, o: { expireAfterSeconds: 5 * D, partialFilterExpression: { isUserCreated: true } } },
    // ── withdrawals (paid / pending are financial records and never expire) ──
    { c: 'withdrawals', k: { userId: 1, createdAt: -1 } },
    { c: 'withdrawals', k: { details: 1 } },
    { c: 'withdrawals', k: { status: 1, createdAt: 1 } },
    { c: 'withdrawals', k: { processedAt: 1 }, o: { expireAfterSeconds: 90 * D, partialFilterExpression: { status: 'rejected' } } },
    // ── promos ──
    { c: 'promos', k: { code: 1 }, o: { unique: true } },
    { c: 'promos', k: { expiresAt: 1 }, o: { expireAfterSeconds: 1 * D } },            // usable 24h, document kept 24h more for the admin stats
    // ── device / abuse registries ──
    { c: 'fingerprints', k: { lastSeenAt: 1 }, o: { expireAfterSeconds: 180 * D } },
    { c: 'ipRegistry', k: { lastSeenAt: 1 }, o: { expireAfterSeconds: 120 * D } },
    { c: 'ipRegistry', k: { userId: 1 } },
    { c: 'ipSignups', k: { lastSeenAt: 1 }, o: { expireAfterSeconds: 7 * D } },       // NEW: was never cleaned (one document per IP, forever)
    // ── gifts ──
    { c: 'gifts', k: { claimedAt: 1 }, o: { expireAfterSeconds: 30 * D, partialFilterExpression: { status: 'claimed' } } },
    { c: 'gifts', k: { createdAt: 1 }, o: { expireAfterSeconds: 180 * D, partialFilterExpression: { status: 'pending' } } },
    // ── admin helpers ──
    { c: 'weeklyReferralReports', k: { weekEndedAt: -1 } },
    { c: 'adminState', k: { updatedAt: 1 }, o: { expireAfterSeconds: 3600 } },
    { c: 'adminClusters', k: { createdAt: 1 }, o: { expireAfterSeconds: 7 * D } },
    { c: 'broadcastJobs', k: { finishedAt: 1 }, o: { expireAfterSeconds: 30 * D, partialFilterExpression: { status: 'done' } } },
    { c: 'unmatchedTonDeposits', k: { createdAt: 1 }, o: { expireAfterSeconds: 180 * D } },   // NEW: audit rows, 6 months
    // ── Create Task orders ──
    { c: 'taskCreateOrders', k: { memo: 1 }, o: { unique: true } },
    { c: 'taskCreateOrders', k: { userId: 1, status: 1 } },
    { c: 'taskCreateOrders', k: { expiresAt: 1 }, o: { expireAfterSeconds: 3600, partialFilterExpression: { status: 'pending' } } },
    { c: 'taskCreateOrders', k: { expiredAt: 1 }, o: { expireAfterSeconds: 30 * D, partialFilterExpression: { status: 'expired' } } },
];

const same = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

export async function ensureIndexes(db, specs = INDEX_SPECS) {
    const results = [];
    for (const { c, k, o = {} } of specs) {
        const name = `${c}.${Object.keys(k).join('+')}${o.expireAfterSeconds !== undefined ? ` (TTL ${o.expireAfterSeconds}s)` : ''}`;
        const col = db.collection(c);
        try {
            await col.createIndex(k, o);
            results.push({ index: name, ok: true });
        } catch (e) {
            if (e && (e.code === 85 || e.code === 86)) {   // same key, different options
                try {
                    const ex = (await col.indexes()).find((i) => same(i.key, k));
                    if (ex && o.expireAfterSeconds !== undefined && ex.expireAfterSeconds !== undefined && same(ex.partialFilterExpression, o.partialFilterExpression) && !!ex.unique === !!o.unique) {
                        await db.command({ collMod: c, index: { keyPattern: k, expireAfterSeconds: o.expireAfterSeconds } });
                        results.push({ index: name, ok: true, changed: 'ttl updated in place' });
                    } else if (ex) {
                        await col.dropIndex(ex.name);
                        await col.createIndex(k, o);
                        results.push({ index: name, ok: true, changed: 're-created' });
                    } else throw e;
                } catch (e2) { results.push({ index: name, ok: false, error: String(e2.message || e2).slice(0, 200) }); }
            } else {
                results.push({ index: name, ok: false, error: String((e && e.message) || e).slice(0, 200) });
            }
        }
    }
    return results;
}
