// api/data.js — public read-only data for the mini app.
//   GET /api/data?type=videos
//   GET /api/data?type=tasks
//   GET /api/data?type=leaderboard        (top 20 by referralCount)
//   GET /api/data?type=weeklyContest      (top 10 by weeklyReferralCount)

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../lib/mongodb.js';
import { tgApi } from '../lib/telegram.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    try {
        const { type } = req.query;
        const { db } = await connectToDatabase();

        // v1.2 (saves Vercel usage): these lists are the same for everybody, so Vercel's edge cache answers them
        // (no function run, no database read) for a few minutes instead of every single request.
        if (type === 'videos') {
            res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
            const videos = await db.collection('videos')
                .find({ isActive: true })
                .sort({ createdAt: -1 })
                .limit(50)
                .toArray();
            return res.status(200).json({ ok: true, videos });
        }

        // 24 Oct 2026: PAGINATED (page, limit<=30) + only the fields the phone needs (smaller answer, no internal ids).
        // Full tasks and stale pages are skipped. Each page URL is cached at Vercel's edge, so many users share one database read.
        if (type === 'tasks') {
            res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
            const page = Math.max(1, Math.min(200, parseInt(req.query.page) || 1));
            const limit = Math.max(1, Math.min(30, parseInt(req.query.limit) || 15));
            const rows = await db.collection('tasks')
                .find({ isApproved: true, $or: [{ limit: { $in: [0, null] } }, { limit: { $exists: false } }, { $expr: { $lt: ['$completionCount', '$limit'] } }] })
                .project({ title: 1, url: 1, category: 1, verifyType: 1, rewardWtc: 1, rewardCurrency: 1, rewardUsdt: 1, logoUrl: 1, logoFileId: 1 })
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit + 1)
                .toArray();
            const hasMore = rows.length > limit;
            const tasks = rows.slice(0, limit).map(({ logoFileId, ...t }) => ({ ...t, hasLogo: !!logoFileId }));
            return res.status(200).json({ ok: true, tasks, page, hasMore });
        }

        // Task logo (24 Oct 2026): the admin sends a photo to the bot, we keep only its Telegram file_id. This turns it into a normal image
        // WITHOUT ever exposing the bot token. The answer is cached for a week at the edge, so the function runs about once per logo.
        if (type === 'taskLogo') {
            let oid;
            try { oid = new ObjectId(String(req.query.id)); } catch { return res.status(404).end(); }
            const t = await db.collection('tasks').findOne({ _id: oid, isApproved: true }, { projection: { logoFileId: 1 } });
            if (!t || !t.logoFileId) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(404).end(); }
            const f = await tgApi('getFile', { file_id: t.logoFileId });
            const path = f && f.ok && f.result && f.result.file_path;
            if (!path || !/^[\w\/.-]+$/.test(path)) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(404).end(); }
            const img = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${path}`);
            if (!img.ok) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(404).end(); }
            const buf = Buffer.from(await img.arrayBuffer());
            if (buf.length > 1024 * 1024) return res.status(404).end();
            res.setHeader('Content-Type', path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
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
            const top = await db.collection('users')
                .find({ isBanned: { $ne: true }, weeklyReferralCount: { $gt: 0 } })
                .project({ telegramUsername: 1, firstName: 1, weeklyReferralCount: 1 })
                .sort({ weeklyReferralCount: -1 })
                .limit(10)
                .toArray();
            return res.status(200).json({ ok: true, top });
        }

        return res.status(400).json({ ok: false, error: 'unknown_type' });
    } catch (err) {
        console.error('data error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
            }
