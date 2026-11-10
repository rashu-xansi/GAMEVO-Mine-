// lib/cronAuth.js — a cron / admin call is allowed only if it carries CRON_SECRET.
//   Preferred:  header  Authorization: Bearer <CRON_SECRET>   (or  x-cron-secret: <CRON_SECRET>)
//   Legacy:     ?secret=<CRON_SECRET> in the URL. URLs end up in logs/history, so set CRON_ALLOW_QUERY_SECRET=0 as soon as your
//               cron service sends the header. (Default stays ON so existing cron-job.org setups keep working.)
import crypto from 'node:crypto';

function safeEq(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function isCronAuthorized(req) {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 16) return false;          // missing / too short secret = nobody is authorized
    const auth = String(req.headers?.authorization || '');
    if (auth.startsWith('Bearer ') && safeEq(auth.slice(7), secret)) return true;
    if (req.headers?.['x-cron-secret'] && safeEq(req.headers['x-cron-secret'], secret)) return true;
    if (process.env.CRON_ALLOW_QUERY_SECRET !== '0' && req.query?.secret && safeEq(req.query.secret, secret)) return true;
    return false;
}
