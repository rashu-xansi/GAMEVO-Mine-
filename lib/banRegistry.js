// lib/banRegistry.js — permanent ban registry + DEVICE-LEVEL suspension (8 Nov 2026, admin request)
//
// Collections:
//   bannedTelegramIds  { _id: telegramId, bannedAt, reason?, deviceKey? }   — a banned Telegram ID can never re-create an account (api/user.js init)
//   bannedDevices      { _id: deviceKey, userId, bannedAt, reason }          — a banned DEVICE (fingerprint). NO TTL: it must outlive the 60-day
//                                                                              deletion of the banned user's own document.
//   deviceExempt       { _id: telegramId, at }                               — set when the admin UNBANS someone: that account is skipped by the
//                                                                              one-account-per-device rule (family / shared phone resolved by hand).
//
// THE RULES (admin):
//  1. A banned user is FULLY suspended: the device they own is banned too, so a 2nd account (or a "switch account") on that phone gets no second chance.
//  2. Suspension follows the user's PHONE. Only the MAIN account of a phone (the first account that claimed it, ipRegistry.userId) owns it.
//     Banning a NON-main account bans that one account only — the main account on the same phone is never touched (2 people on one phone are not both suspended).
//  3. Two accounts on one phone: the MAIN account stays, every other account is suspended (api/user.js init does this at the door).
// Only real fingerprints are device keys. `ip:` fallback keys are shared by thousands of people behind one carrier/VPN IP and are NEVER banned.
// The admin / task moderator accounts are never auto-suspended.

// Set to false to make EVERY manual ban final (the banned user then gets no "Request Review" at all).
export const MANUAL_BAN_ALLOWS_APPEAL = true;

const NOT_IP_KEY = { $not: { $regex: '^ip:' } };

export function isProtectedId(id) {
    const s = String(id);
    return [process.env.ADMIN_TELEGRAM_ID, process.env.TASK_MODERATOR_ID].filter(Boolean).map(String).includes(s);
}

export async function markBanned(db, ids, meta = {}) {
    const list = (ids || []).map(String);
    if (!list.length) return;
    const extra = {};
    if (meta.reason) extra.reason = meta.reason;
    if (meta.deviceKey) extra.deviceKey = meta.deviceKey;
    await db.collection('bannedTelegramIds').bulkWrite(
        list.map((id) => ({ updateOne: { filter: { _id: id }, update: { $setOnInsert: { bannedAt: new Date(), ...extra } }, upsert: true } })),
        { ordered: false }
    );
}
export async function markUnbanned(db, ids) {
    const list = (ids || []).map(String);
    if (!list.length) return;
    await db.collection('bannedTelegramIds').deleteMany({ _id: { $in: list } });
}

// ── device bans ─────────────────────────────────────────────────────────────────────────────────────
export async function getBannedDevice(db, key) {
    if (typeof key !== 'string' || key.startsWith('ip:')) return null;
    return db.collection('bannedDevices').findOne({ _id: key });
}
export async function isDeviceBanned(db, key) { return !!(await getBannedDevice(db, key)); }

// Bans every device these users OWN (main account) and suspends the other accounts that were recorded on those devices.
// Never touches a device where the user is only a secondary account. Returns { devices, suspended }.
export async function banDevicesOfUsers(db, userIds, reason = 'banned_user_device') {
    const ids = [...new Set((userIds || []).map(String))];
    if (!ids.length) return { devices: 0, suspended: 0 };
    const owned = await db.collection('ipRegistry').find({ userId: { $in: ids }, _id: NOT_IP_KEY }, { projection: { _id: 1, userId: 1 } }).toArray();
    const keys = owned.map((d) => d._id);
    if (!keys.length) return { devices: 0, suspended: 0 };

    const now = new Date();
    for (let i = 0; i < owned.length; i += 500) {
        const chunk = owned.slice(i, i + 500);
        await db.collection('bannedDevices').bulkWrite(
            chunk.map((d) => ({ updateOne: { filter: { _id: d._id }, update: { $setOnInsert: { userId: String(d.userId), bannedAt: now, reason } }, upsert: true } })),
            { ordered: false }
        );
    }

    // other accounts that were recorded on those devices (old multi-account data) are suspended too — except admins / admin-cleared accounts
    const fps = await db.collection('fingerprints').find({ _id: { $in: keys } }, { projection: { userIds: 1 } }).toArray();
    const sib = new Set();
    for (const f of fps) for (const u of (f.userIds || [])) if (!ids.includes(String(u)) && !isProtectedId(u)) sib.add(String(u));
    let suspended = 0;
    if (sib.size) {
        const exempt = new Set((await db.collection('deviceExempt').find({ _id: { $in: [...sib] } }, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
        const targets = [...sib].filter((u) => !exempt.has(u));
        if (targets.length) {
            const r = await db.collection('users').updateMany(
                { _id: { $in: targets }, isBanned: { $ne: true } },
                { $set: { isBanned: true, bannedAt: now, bannedReason: 'device_ban', bannedViaUser: ids[0], appealBlocked: true } }
            );
            suspended = r.modifiedCount || 0;
            for (let i = 0; i < targets.length; i += 1000) await markBanned(db, targets.slice(i, i + 1000), { reason: 'device_ban' });
        }
    }
    return { devices: keys.length, suspended };
}

// Admin unban: the devices that this user's ban had locked are opened again, and the account is cleared from the one-account-per-device rule.
export async function unbanDevicesOf(db, userId) {
    const id = String(userId);
    const r = await db.collection('bannedDevices').deleteMany({ userId: id });
    await db.collection('deviceExempt').updateOne({ _id: id }, { $set: { at: new Date() } }, { upsert: true });
    return r.deletedCount || 0;
}
export async function isDeviceExempt(db, userId) {
    return !!(await db.collection('deviceExempt').findOne({ _id: String(userId) }, { projection: { _id: 1 } }));
}

// Suspends ONE account because of the device rules (2nd account on a phone / phone of a banned user). Works with or without a users document.
// Returns true when this call newly suspended it (so the admin is told once).
export async function suspendForDevice(db, userId, reason, deviceKey) {
    const id = String(userId);
    const now = new Date();
    const r = await db.collection('users').updateOne(
        { _id: id, isBanned: { $ne: true } },
        { $set: { isBanned: true, bannedAt: now, bannedReason: reason, appealBlocked: true } }
    );
    const was = await db.collection('bannedTelegramIds').findOne({ _id: id }, { projection: { _id: 1 } });
    await markBanned(db, [id], { reason, deviceKey });
    return (r.modifiedCount || 0) > 0 || !was;
                }
