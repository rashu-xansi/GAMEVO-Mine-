// lib/banRegistry.js — TEMP replacement (original file was missing from the zip).
// Permanent "bannedTelegramIds" registry — a banned Telegram ID can never re-create an account (read in api/user.js init).
export async function markBanned(db, ids) {
    const list = (ids || []).map(String);
    if (!list.length) return;
    await db.collection('bannedTelegramIds').bulkWrite(
        list.map((id) => ({ updateOne: { filter: { _id: id }, update: { $setOnInsert: { bannedAt: new Date() } }, upsert: true } })),
        { ordered: false }
    );
}
export async function markUnbanned(db, ids) {
    const list = (ids || []).map(String);
    if (!list.length) return;
    await db.collection('bannedTelegramIds').deleteMany({ _id: { $in: list } });
}
