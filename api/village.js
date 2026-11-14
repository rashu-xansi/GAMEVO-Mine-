// api/village.js — cloud save for the Blocky Village game (14 Nov 2026).
//
//   POST /api/village   { action: 'load' }                          -> { ok, data, t }   (data = the saved game as text, or null)
//   POST /api/village   { action: 'save', data: '<json text>', t }  -> { ok }
//
// What this file is for: the game keeps playing on the phone (NPCs, buildings, gold) and the app copies the save here about once a minute,
// so a new phone / cleared Telegram cache does not lose the village. Nothing here gives $GM — the ONLY $GM source in the game is the mine,
// and that is paid by api/earn.js (mineStart / mineClaim: 2-hour gate + one ad + server-picked amount).
// Gold (the in-game coin) is game-only: it never touches wtcBalance, so editing a save can never create withdrawable money.
import { connectToDatabase } from '../lib/mongodb.js';
import { verifyTelegramInitData } from '../lib/telegramAuth.js';
import { rateLimited } from '../lib/rateLimit.js';

const MAX_SAVE_CHARS = 150000;   // a normal village is ~10-40 KB; this only stops abuse
const MAX_BUILDINGS = 3000;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

    const { action } = req.body || {};
    const verified = verifyTelegramInitData(req.body?.initData);
    if (!verified.ok) return res.status(401).json({ ok: false, error: 'unauthorized', reason: verified.error });
    const userId = String(verified.user.id);

    // loads: 10 per minute, saves: 8 per minute (the app saves about once a minute)
    if (action !== 'load' && action !== 'save') return res.status(400).json({ ok: false, error: 'unknown_action' });
    if (rateLimited('village-' + action + ':' + userId, action === 'save' ? 8 : 10, 60000)) {
        return res.status(429).json({ ok: false, error: 'too_fast' });
    }

    const { db } = await connectToDatabase();
    const users = db.collection('users');
    const villages = db.collection('villages');

    const u = await users.findOne({ _id: userId }, { projection: { isBanned: 1 } });
    if (!u) return res.status(404).json({ ok: false, error: 'user_not_found' });
    if (u.isBanned) return res.status(403).json({ ok: false, error: 'banned' });

    if (action === 'load') {
        const doc = await villages.findOne({ _id: userId });
        if (!doc) return res.status(200).json({ ok: true, data: null, t: 0 });
        return res.status(200).json({ ok: true, data: doc.data, t: doc.t || 0 });
    }

    if (action === 'save') {
        const data = req.body?.data;
        if (typeof data !== 'string' || data.length < 2 || data.length > MAX_SAVE_CHARS) {
            return res.status(400).json({ ok: false, error: 'bad_save' });
        }
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { return res.status(400).json({ ok: false, error: 'bad_save' }); }
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.bl) || parsed.bl.length > MAX_BUILDINGS) {
            return res.status(400).json({ ok: false, error: 'bad_save' });
        }
        const t = Number.isFinite(Number(parsed.t)) ? Math.min(Number(parsed.t), Date.now() + 60000) : Date.now();
        // never let an OLDER save overwrite a newer one (two phones / a stale tab)
        await villages.updateOne(
            { _id: userId, $or: [{ t: { $exists: false } }, { t: { $lte: t } }] },
            { $set: { data, t, updatedAt: new Date() } },
            { upsert: false }
        );
        const exists = await villages.findOne({ _id: userId }, { projection: { _id: 1 } });
        if (!exists) {
            try { await villages.insertOne({ _id: userId, data, t, updatedAt: new Date() }); }
            catch (e) { /* two saves raced: the other one already created it - fine */ }
        }
        return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'unknown_action' });
}
