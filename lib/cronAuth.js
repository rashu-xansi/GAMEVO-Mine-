// lib/cronAuth.js — TEMP replacement (original file was missing from the zip).
// A cron / admin call is allowed only if it carries CRON_SECRET (Vercel cron sends it as "Authorization: Bearer <CRON_SECRET>").
export function isCronAuthorized(req) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const auth = req.headers?.authorization || '';
    return auth === `Bearer ${secret}` || req.headers?.['x-cron-secret'] === secret || req.query?.secret === secret;
}
