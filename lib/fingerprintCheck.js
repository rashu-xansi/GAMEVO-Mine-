// lib/fingerprintCheck.js  (RECREATED — original file was missing from the project)
//
// Records which userIds share one device fingerprint. If a fingerprint now belongs to more than one account, the
// NEW user gets multiAccountFlag=true (+ siblings) for admin review. It never bans anyone by itself.
//
//   fingerprints doc: { _id: <hash>, userIds: [], firstSeenAt, lastSeenAt }

export async function checkAndRecordFingerprint(db, userId, fingerprint) {
    if (typeof fingerprint !== 'string' || fingerprint.length < 16) return { flagged: false };
    try {
        const uid = String(userId);
        const now = new Date();
        const res = await db.collection('fingerprints').findOneAndUpdate(
            { _id: fingerprint },
            { $addToSet: { userIds: uid }, $setOnInsert: { firstSeenAt: now }, $set: { lastSeenAt: now } },
            { upsert: true, returnDocument: 'after' }
        );
        const doc = res?.value !== undefined ? res.value : res;
        const siblings = (doc?.userIds || []).filter((id) => id !== uid);
        if (siblings.length === 0) return { flagged: false };

        await db.collection('users').updateOne(
            { _id: uid },
            { $set: { multiAccountFlag: true, multiAccountSiblings: siblings, multiAccountFingerprint: fingerprint } }
        );
        return { flagged: true, siblings };
    } catch (e) {
        console.error('checkAndRecordFingerprint error:', e.message);
        return { flagged: false }; // admin-review helper only — must never break signup
    }
}
