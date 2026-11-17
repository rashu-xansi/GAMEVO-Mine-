// api/village.js — cloud save for the Blocky Village game (14 Nov 2026).
//
//   POST /api/village   { action: 'load' }                          -> { ok, data, t }   (data = the saved game as text, or null)
//   POST /api/village   { action: 'save', data: '<json text>', t }  -> { ok }
//
// What this file is for: the game keeps playing on the phone (NPCs, buildings, gold) and the app copies the save here about once a minute,
// so a new phone / cleared Telegram cache does not lose the village. Nothing here gives $GM — the ONLY $GM source in the game is the mine,
// and that is paid by api/earn.js (mineStart / mineClaim: 2-hour gate + one ad + server-picked amount).
//
//   POST /api/village   { action: 'adSkip', kind: 'skip'|'auto' }   -> { ok } | { ok:false, error:'daily_limit'|'too_soon', retryAfterMs }
//   The game's own Adsgram interstitial (int-58073) is counted HERE before it is shown: skips (night->morning, -5 min build) 12/day + 90s gap,
//   auto ads (level up / new land / every 6th build) 6/day + 4 min gap. Counters live in `gameAdLog` and auto-delete (TTL, lib/indexes.js).
//
//   Storage: a village save is gzip-compressed before it goes into MongoDB (a big village is ~100 KB of JSON -> ~15 KB),
//   so the free 512 MB Atlas plan lasts several times longer. Old uncompressed saves (field `data`) still load and are compressed on their next save.
// Gold (the in-game coin) is game-only: it never touches wtcBalance, so editing a save can never create withdrawable money.
import { connectToDatabase } from '../lib/mongodb.js';
import { verifyTelegramInitData } from '../lib/telegramAuth.js';
import { rateLimited } from '../lib/rateLimit.js';
import { gzipSync, gunzipSync } from 'node:zlib';

const MAX_SAVE_CHARS = 400000;   // a normal village is ~10-120 KB (the island grows slowly over weeks); this only stops abuse
const AD_LIMITS = { skip: { max: 12, gap: 90000 }, auto: { max: 6, gap: 240000 } };
const bdDay = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);   // Bangladesh day (UTC+6)
const MAX_BUILDINGS = 3000;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

    const { action } = req.body || {};
    const verified = verifyTelegramInitData(req.body?.initData);
    if (!verified.ok) return res.status(401).json({ ok: false, error: 'unauthorized', reason: verified.error });
    const userId = String(verified.user.id);

    // loads: 10 per minute, saves: 8 per minute (the app saves about once a minute)
    if (action !== 'load' && action !== 'save' && action !== 'adSkip') return res.status(400).json({ ok: false, error: 'unknown_action' });
    if (rateLimited('village-' + action + ':' + userId, action === 'save' ? 8 : action === 'adSkip' ? 20 : 10, 60000)) {
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
        let text = doc.data;
        if (!text && doc.z) {
            try { text = gunzipSync(Buffer.from(doc.z.buffer || doc.z)).toString('utf8'); } catch (e) { return res.status(500).json({ ok: false, error: 'bad_stored_save' }); }
        }
        return res.status(200).json({ ok: true, data: text || null, t: doc.t || 0 });
    }

    if (action === 'adSkip') {
        const kind = req.body?.kind === 'auto' ? 'auto' : 'skip', other = kind === 'auto' ? 'skip' : 'auto';
        const L = AD_LIMITS[kind], now = Date.now(), id = userId + ':' + bdDay();
        const logs = db.collection('gameAdLog');
        const cur = (await logs.findOne({ _id: id })) || {};
        if ((cur[kind + 'N'] || 0) >= L.max) return res.status(200).json({ ok: false, error: 'daily_limit' });
        const wait = Math.max(L.gap - (now - (cur[kind + 'T'] || 0)), 30000 - (now - (cur[other + 'T'] || 0)));   // own gap, and 30s after the other kind
        if (wait > 0) return res.status(200).json({ ok: false, error: 'too_soon', retryAfterMs: wait });
        await logs.updateOne({ _id: id }, { $inc: { [kind + 'N']: 1 }, $set: { [kind + 'T']: now, at: new Date() } }, { upsert: true });
        return res.status(200).json({ ok: true, left: L.max - (cur[kind + 'N'] || 0) - 1 });
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
        const z = gzipSync(Buffer.from(data, 'utf8'), { level: 6 });
        const meta = { z, size: data.length, buildings: parsed.bl.length, lvl: Math.min(99, Math.max(1, parseInt(parsed.lv) || 1)), t };
        await villages.updateOne(
            { _id: userId, $or: [{ t: { $exists: false } }, { t: { $lte: t } }] },
            { $set: { ...meta, updatedAt: new Date() }, $unset: { data: '' } },
            { upsert: false }
        );
        const exists = await villages.findOne({ _id: userId }, { projection: { _id: 1 } });
        if (!exists) {
            try { await villages.insertOne({ _id: userId, ...meta, updatedAt: new Date() }); }
            catch (e) { /* two saves raced: the other one already created it - fine */ }
        }
        return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'unknown_action' });
                                                                                    }
