// server.js — GameVo Mine backend for Render (7 Nov 2026)
//
// This one file runs ALL the files inside the "api" folder (api/user.js, api/earn.js, api/bot.js, ...)
// exactly the way Vercel used to, but on a normal always-on server. No extra packages are needed (only Node's own http).
//
//   /api/user            -> api/user.js
//   /api/earn            -> api/earn.js
//   /api/cron/weeklyReferral -> api/cron/weeklyReferral.js     (and so on for every file in api/)
//   /health              -> "ok" (use it for Render's health check and for an uptime pinger)
//
// The mini app page itself (index.html) stays on the ORIGINAL Vercel domain (the one the ad network approved).
// The page talks to this server, so this server must ALLOW that domain (CORS). Set it with the env variable
// ALLOWED_ORIGINS (see the setup guide). If it is empty, the domain of APP_URL is allowed.

import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 10000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;   // 2 MB is far more than any request of this app needs

// ── Which web pages may call this server from a browser ──────────────────────────────────────────
function originOf(u) { try { return new URL(u).origin; } catch { return ''; } }
const ALLOWED_ORIGINS = new Set(
    String(process.env.ALLOWED_ORIGINS || process.env.APP_URL || 'https://gamevo-mine.vercel.app')
        .split(',').map(s => originOf(s.trim())).filter(Boolean)
);

function applyCors(req, res) {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '86400');
    }
}

// ── The user's real IP ───────────────────────────────────────────────────────────────────────────
// api code reads req.headers['x-forwarded-for'] (first value). Behind Render a browser can add its own fake
// X-Forwarded-For, so we first take the IP from a header the CDN in front of Render sets itself, and write that
// single IP back into x-forwarded-for. Open /whoami on your phone after deploying to see which header was used.
function detectIp(req) {
    const pick = (h) => { const v = req.headers[h]; return v ? String(v).split(',')[0].trim() : ''; };
    const forced = (process.env.TRUST_IP_HEADER || '').toLowerCase();
    if (forced && pick(forced)) return { ip: pick(forced), from: forced };
    // true-client-ip is NOT trusted by default: unless Cloudflare Enterprise sets it, a visitor can send it himself and fake his IP (set TRUST_IP_HEADER to use it)
    if (pick('cf-connecting-ip')) return { ip: pick('cf-connecting-ip'), from: 'cf-connecting-ip' };
    if (pick('x-forwarded-for')) return { ip: pick('x-forwarded-for'), from: 'x-forwarded-for' };
    return { ip: req.socket?.remoteAddress || 'unknown', from: 'socket' };
}

// ── Read the request body (JSON / form / text) like Vercel does ──────────────────────────────────
function readBody(req) {
    return new Promise((resolve, reject) => {
        if (req.method === 'GET' || req.method === 'HEAD') return resolve({});
        const chunks = []; let size = 0, dead = false;
        req.on('data', (c) => {
            if (dead) return;
            size += c.length;
            if (size > MAX_BODY_BYTES) { dead = true; reject(Object.assign(new Error('too_large'), { code: 413 })); return; }
            chunks.push(c);
        });
        req.on('end', () => {
            if (dead) return;
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) return resolve({});
            const type = String(req.headers['content-type'] || '').toLowerCase();
            try {
                if (type.includes('application/json')) return resolve(JSON.parse(raw));
                if (type.includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(raw)));
                return resolve(raw);
            } catch { reject(Object.assign(new Error('bad_json'), { code: 400 })); }
        });
        req.on('error', reject);
    });
}

// ── Small helpers so the handlers can use res.status(200).json(...) just like on Vercel ──────────
function decorate(res) {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => {
        if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(obj));
        return res;
    };
    res.send = (data) => {
        if (data !== null && typeof data === 'object' && !Buffer.isBuffer(data)) return res.json(data);
        if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', Buffer.isBuffer(data) ? 'application/octet-stream' : 'text/html; charset=utf-8');
        res.end(data);
        return res;
    };
    res.redirect = (a, b) => { const [code, url] = typeof a === 'number' ? [a, b] : [307, a]; res.statusCode = code; res.setHeader('Location', url); res.end(); return res; };
}
function sendJson(res, code, obj) {
    if (res.headersSent) return;
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
}

// ── api file lookup (only real files inside /api, only letters/numbers/-/_ in the name) ──────────
const NAME_RE = /^\/api\/((?:[A-Za-z0-9_-]+\/)?[A-Za-z0-9_-]+)\/?$/;
const handlerCache = new Map();
async function loadHandler(name) {
    if (handlerCache.has(name)) return handlerCache.get(name);
    const file = path.join(ROOT, 'api', name + '.js');
    if (!existsSync(file)) return null;
    const mod = await import(pathToFileURL(file).href);
    const fn = typeof mod.default === 'function' ? mod.default : null;
    if (fn) handlerCache.set(name, fn);
    return fn;
}

const server = http.createServer(async (req, res) => {
    try {
        applyCors(req, res);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        const url = new URL(req.url, 'http://localhost');

        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

        if (url.pathname === '/' || url.pathname === '/health') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.end('ok');
        }
        if (url.pathname === '/whoami') {
            const d = detectIp(req);
            return sendJson(res, 200, { ip: d.ip, headerUsed: d.from });
        }

        const m = NAME_RE.exec(url.pathname);
        if (!m) return sendJson(res, 404, { ok: false, error: 'not_found' });

        const handler = await loadHandler(m[1]);
        if (!handler) return sendJson(res, 404, { ok: false, error: 'not_found' });

        // build req.query / req.body like Vercel
        const query = {};
        for (const [k, v] of url.searchParams) {
            if (k in query) query[k] = [].concat(query[k], v); else query[k] = v;
        }
        req.query = query;
        req.headers['x-forwarded-for'] = detectIp(req).ip;
        try { req.body = await readBody(req); }
        catch (e) { return sendJson(res, e.code || 400, { ok: false, error: e.message || 'bad_request' }); }

        decorate(res);
        await handler(req, res);
        if (!res.writableEnded && !res.headersSent) sendJson(res, 204, {});   // handler forgot to answer
    } catch (err) {
        console.error('request error:', req.method, req.url, err);
        sendJson(res, 500, { ok: false, error: 'server_error' });
    }
});

// keep-alive a bit longer than Render's proxy so it never reuses a connection we already closed
server.keepAliveTimeout = 65 * 1000;
server.headersTimeout = 66 * 1000;

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));
for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => { console.log(sig + ' received, closing…'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 8000).unref(); });
}

// startup security checklist (warnings only - the server still starts)
for (const [name, min] of [['BOT_TOKEN', 20], ['MONGODB_URI', 10], ['TELEGRAM_WEBHOOK_SECRET', 16], ['SIGNING_SECRET', 24], ['ADSGRAM_S2S_SECRET', 16], ['CRON_SECRET', 16], ['ADMIN_TELEGRAM_ID', 5]]) {
    const v = process.env[name];
    if (!v) console.warn(`SECURITY WARNING: env ${name} is NOT set`);
    else if (v.length < min) console.warn(`SECURITY WARNING: env ${name} looks too short (use a long random value)`);
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`GameVo Mine server listening on ${PORT}; allowed origins: ${[...ALLOWED_ORIGINS].join(', ') || '(none)'}`);
});
