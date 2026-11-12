// api/data.js — public read-only data for the mini app.
//   GET /api/data?type=tasks
//   GET /api/data?type=leaderboard        (top 20 by referralCount)
//   GET /api/data?type=weeklyContest      (top 10 by weeklyReferralCount)

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../lib/mongodb.js';
import { tgApi } from '../lib/telegram.js';
import { rateLimited } from '../lib/rateLimit.js';
import { getClientIp } from '../lib/ipRegistry.js';

// Small in-memory cache for logo images: this server has no CDN in front, so without it every logo request = 1 Telegram getFile + a 1 MB download.
const LOGO_CACHE = new Map();               // key -> { at, buf, type }
const LOGO_TTL_MS = 10 * 60 * 1000, LOGO_MAX_ENTRIES = 100;
function logoGet(k) { const e = LOGO_CACHE.get(k); if (e && Date.now() - e.at < LOGO_TTL_MS) return e; LOGO_CACHE.delete(k); return null; }
function logoPut(k, buf, type) { if (LOGO_CACHE.size >= LOGO_MAX_ENTRIES) LOGO_CACHE.delete(LOGO_CACHE.keys().next().value); LOGO_CACHE.set(k, { at: Date.now(), buf, type }); }

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    if (rateLimited('data-ip:' + getClientIp(req), 120, 60000)) return res.status(429).json({ ok: false, error: 'too_fast' });

    try {
        const type = typeof req.query.type === 'string' ? req.query.type : '';
        const { db } = await connectToDatabase();

        // v1.2 (saves Vercel usage): these lists are the same for everybody, so Vercel's edge cache answers them
        // (no function run, no database read) for a few minutes instead of every single request.

        // 24 Oct 2026: PAGINATED (page, limit<=30) + only the fields the phone needs (smaller answer, no internal ids).
        // Full tasks and stale pages are skipped. Each page URL is cached at Vercel's edge, so many users share one database read.
        if (type === 'tasks') {
            res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
            const page = Math.max(1, Math.min(200, parseInt(req.query.page) || 1));
            const limit = Math.max(1, Math.min(30, parseInt(req.query.limit) || 15));
            const rows = await db.collection('tasks')
                .find({ isApproved: true, category: { $ne: 'pinned' }, $or: [{ limit: { $in: [0, null] } }, { limit: { $exists: false } }, { $expr: { $lt: ['$completionCount', '$limit'] } }] })
                .project({ title: 1, url: 1, category: 1, verifyType: 1, rewardWtc: 1, rewardCurrency: 1, rewardUsdt: 1, logoUrl: 1, logoFileId: 1 })
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit + 1)
                .toArray();
            const hasMore = rows.length > limit;
            const tasks = rows.slice(0, limit).map(({ logoFileId, ...t }) => ({ ...t, hasLogo: !!logoFileId }));
            return res.status(200).json({ ok: true, tasks, page, hasMore });
        }

        // 11 Nov 2026: PINNED tasks are made by the admin in the bot (📌 Pin Task): logo, reward, one-time / permanent. They are shown on top of Daily tasks.
        // The page hides a one-time pinned task once the user finished it; a permanent one stays visible (marked Done).
        if (type === 'pinnedTasks') {
            res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
            const rows = await db.collection('tasks')
                .find({ isApproved: true, category: 'pinned' })
                .project({ title: 1, url: 1, verifyType: 1, rewardWtc: 1, logoUrl: 1, logoFileId: 1, keepAfterClaim: 1 })
                .sort({ createdAt: -1, _id: -1 }).limit(10).toArray();
            const tasks = rows.map(({ logoFileId, ...t }) => ({ ...t, keepAfterClaim: !!t.keepAfterClaim, hasLogo: !!logoFileId }));
            return res.status(200).json({ ok: true, tasks });
        }
        // Ad logos (GigaPub / Adsgram) set by the admin in the bot (🖼 Ad Logos). Small answer, cached 2 minutes.
        if (type === 'adLogos') {
            res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
            const d0 = await db.collection('botSettings').findOne({ _id: 'adLogos' }) || {};
            const out = { ok: true, v: d0.updatedAt ? new Date(d0.updatedAt).getTime() : 0 };
            for (const k of ['giga', 'special', 'task']) {
                const u = d0[k + 'Url'] && /^https:\/\//i.test(d0[k + 'Url']) ? d0[k + 'Url'] : null;
                out[k] = { hasLogo: !!d0[k + 'FileId'], logoUrl: u };
            }
            return res.status(200).json(out);
        }
        if (type === 'adLogo') {
            const k = String(req.query.k || '');
            if (!['giga', 'special', 'task'].includes(k)) return res.status(404).end();
            const hit = logoGet('ad:' + k); if (hit) { res.setHeader('Content-Type', hit.type); res.setHeader('Cache-Control', 'public, max-age=3600'); res.setHeader('X-Content-Type-Options', 'nosniff'); return res.status(200).send(hit.buf); }
            const d1 = await db.collection('botSettings').findOne({ _id: 'adLogos' }, { projection: { [k + 'FileId']: 1 } });
            const fileId = d1 && d1[k + 'FileId'];
            if (!fileId) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(404).end(); }
            const f = await tgApi('getFile', { file_id: fileId });
            const path = f && f.ok && f.result && f.result.file_path;
            if (!path || !/^[\w\/.-]+$/.test(path)) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(404).end(); }
            const img = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${path}`);
            if (!img.ok) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(404).end(); }
            const buf = Buffer.from(await img.arrayBuffer());
            if (buf.length > 1024 * 1024) return res.status(404).end();
            const ctype = path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg'; logoPut('ad:' + k, buf, ctype);
            res.setHeader('Content-Type', ctype);
            res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, immutable');   // the page adds ?v=<updatedAt>, so a new logo = a new URL
            res.setHeader('X-Content-Type-Options', 'nosniff');
            return res.status(200).send(buf);
        }

        // Task logo (24 Oct 2026): the admin sends a photo to the bot, we keep only its Telegram file_id. This turns it into a normal image
        // WITHOUT ever exposing the bot token. The answer is cached for a week at the edge, so the function runs about once per logo.
        if (type === 'taskLogo') {
            let oid;
            try { oid = new ObjectId(String(req.query.id)); } catch { return res.status(404).end(); }
            const hit = logoGet('task:' + String(oid)); if (hit) { res.setHeader('Content-Type', hit.type); res.setHeader('Cache-Control', 'public, max-age=3600'); res.setHeader('X-Content-Type-Options', 'nosniff'); return res.status(200).send(hit.buf); }
            const t = await db.collection('tasks').findOne({ _id: oid, isApproved: true }, { projection: { logoFileId: 1 } });
            if (!t || !t.logoFileId) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(404).end(); }
            const f = await tgApi('getFile', { file_id: t.logoFileId });
            const path = f && f.ok && f.result && f.result.file_path;
            if (!path || !/^[\w\/.-]+$/.test(path)) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(404).end(); }
            const img = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${path}`);
            if (!img.ok) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(404).end(); }
            const buf = Buffer.from(await img.arrayBuffer());
            if (buf.length > 1024 * 1024) return res.status(404).end();
            const ctype = path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg'; logoPut('task:' + String(oid), buf, ctype);
            res.setHeader('Content-Type', ctype);
            res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, immutable');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            return res.status(200).send(buf);
        }

        // Weekly Referral Contest (mini app "Milestones" button). Reads
        // the SAME live `weeklyReferralCount` field the admin panel's a_weekly
        // screen uses, so it automatically reflects the admin's manual
        // "🔄 Reset week now" (bot.js a_weekly_reset_confirm) — no separate
        // reset needed here, it's the same field/collection.
        if (type === 'weeklyContest') {
            res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
            // 3 Nov 2026: PAGINATED (page, limit<=20, default 10, max 10 pages = top 200). `offset` = rank of the first row minus 1.
            const page = Math.max(1, Math.min(10, parseInt(req.query.page) || 1));
            const limit = Math.max(1, Math.min(20, parseInt(req.query.limit) || 10));
            const rows = await db.collection('users')
                .find({ isBanned: { $ne: true }, weeklyReferralCount: { $gt: 0 } })
                .project({ telegramUsername: 1, firstName: 1, weeklyReferralCount: 1 })
                .sort({ weeklyReferralCount: -1, _id: 1 })
                .skip((page - 1) * limit)
                .limit(limit + 1)
                .toArray();
            return res.status(200).json({ ok: true, top: rows.slice(0, limit), page, offset: (page - 1) * limit, hasMore: rows.length > limit && page < 10 });
        }

        return res.status(400).json({ ok: false, error: 'unknown_type' });
    } catch (err) {
        console.error('data error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
}
