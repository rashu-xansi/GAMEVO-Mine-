// lib/ipRegistry.js  (RECREATED — the original file was missing from the project, which made
// api/user.js crash on import and the Mini App show "Connection Problem")
//
// One-account-per-device gate. A "device key" is the client fingerprint (if it is long enough to be real),
// otherwise `ip:<client ip>` as a fallback.
//
//   ipRegistry doc: { _id: key, userId, claimedAt, lastSeenAt, switchCount?, lastSwitchAt? }
//
// Exports used by api/user.js:
//   getClientIp, checkDevice, claimDevice, claimDeviceForUser, getOwnerPublicInfo, recordSignupAndCheckVelocity

import { IP_SIGNUP_VELOCITY_WINDOW_MS } from './constants.js';

const SWITCH_COOLDOWN_MS = 24 * 60 * 60 * 1000; // a device can be "switched" to another account at most once per 24h

export function getClientIp(req) {
    const xff = req.headers?.['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
    const real = req.headers?.['x-real-ip'];
    if (real) return String(real).trim();
    return req.socket?.remoteAddress || 'unknown';
}

export function registryKey(fingerprint, ip) {
    return (typeof fingerprint === 'string' && fingerprint.length >= 16) ? fingerprint : `ip:${ip}`;
}

// -> { key, blocked, ownerId?, unclaimed?, fallbackCollision? }
export async function checkDevice(db, fingerprint, ip, userId) {
    const key = registryKey(fingerprint, ip);
    const reg = db.collection('ipRegistry');
    const doc = await reg.findOne({ _id: key });
    if (!doc) return { key, blocked: false, unclaimed: true };

    if (String(doc.userId) === String(userId)) {
        reg.updateOne({ _id: key }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
        return { key, blocked: false };
    }

    // owner account no longer exists (auto-deleted) -> the key is free again
    const ownerExists = await db.collection('users').findOne({ _id: String(doc.userId) }, { projection: { _id: 1 } });
    if (!ownerExists) {
        await reg.deleteOne({ _id: key, userId: doc.userId }).catch(() => {});
        return { key, blocked: false, unclaimed: true };
    }

    // IP-only key (no real fingerprint): many real people share one IP (carrier NAT / VPN exit) -> never hard-block
    if (key.startsWith('ip:')) {
        return { key, blocked: false, fallbackCollision: true, ownerId: String(doc.userId) };
    }

    return { key, blocked: true, ownerId: String(doc.userId) };
}

// First claim wins; never steals an existing owner's claim.
export async function claimDevice(db, key, userId) {
    const now = new Date();
    await db.collection('ipRegistry').updateOne(
        { _id: key },
        { $setOnInsert: { userId: String(userId), claimedAt: now }, $set: { lastSeenAt: now } },
        { upsert: true }
    ).catch((e) => { if (e?.code !== 11000) throw e; });
}

// "Switch account": force-claim the device for this user, reset their balance, with a cooldown.
// -> { ok:true } | { ok:false, retryAfterMs }
export async function claimDeviceForUser(db, key, userId) {
    const reg = db.collection('ipRegistry');
    const now = new Date();
    const doc = await reg.findOne({ _id: key });

    if (doc && String(doc.userId) === String(userId)) {
        await reg.updateOne({ _id: key }, { $set: { lastSeenAt: now } });
        return { ok: true };
    }
    if (doc?.lastSwitchAt) {
        const wait = SWITCH_COOLDOWN_MS - (now.getTime() - new Date(doc.lastSwitchAt).getTime());
        if (wait > 0) return { ok: false, retryAfterMs: wait };
    }

    await reg.updateOne(
        { _id: key },
        { $set: { userId: String(userId), lastSeenAt: now, lastSwitchAt: now }, $setOnInsert: { claimedAt: now }, $inc: { switchCount: 1 } },
        { upsert: true }
    );
    // anti-abuse cost of switching (matches the warning text shown in the app)
    await db.collection('users').updateOne(
        { _id: String(userId) },
        { $set: { wtcBalance: 0, usdtBalance: 0, pendingVideoWTC: 0, miningLevel: 1 } }
    );
    return { ok: true };
}

export async function getOwnerPublicInfo(db, ownerId) {
    if (!ownerId) return null;
    const u = await db.collection('users').findOne(
        { _id: String(ownerId) },
        { projection: { firstName: 1, telegramUsername: 1 } }
    );
    if (!u) return null;
    return {
        id: String(ownerId),
        firstName: u.firstName || null,
        telegramUsername: (u.telegramUsername && u.telegramUsername !== 'N/A') ? u.telegramUsername : null,
    };
}

// Records this signup against the raw client IP and returns how many signups came from it inside the window.
export async function recordSignupAndCheckVelocity(db, ip) {
    if (!ip || ip === 'unknown') return { count: 0 };
    try {
        const now = new Date();
        const res = await db.collection('ipSignups').findOneAndUpdate(
            { _id: ip },
            { $push: { times: { $each: [now], $slice: -50 } }, $set: { lastSeenAt: now } },
            { upsert: true, returnDocument: 'after' }
        );
        const doc = res?.value !== undefined ? res.value : res;
        const since = Date.now() - IP_SIGNUP_VELOCITY_WINDOW_MS;
        const count = (doc?.times || []).filter((t) => new Date(t).getTime() >= since).length;
        return { count };
    } catch (e) {
        console.error('recordSignupAndCheckVelocity error:', e.message);
        return { count: 0 }; // never block signup because of this heuristic
    }
         }
