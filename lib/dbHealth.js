// lib/dbHealth.js — MongoDB health report for the admin panel (🗄 DB Health), made for the FREE Atlas plan (M0: 512 MB storage).
//
// What it shows (all read-only, cheap): how full the 512 MB is, every collection (documents + size, paginated), the biggest game villages
// (paginated), which TTL (auto-delete) rules exist, and a ping time. Nothing here changes data, except refreshTtl() which re-runs the
// idempotent index list from lib/indexes.js (same thing as /api/admin/setup-indexes).
import { INDEX_SPECS, ensureIndexes } from './indexes.js';

export const FREE_PLAN_BYTES = 512 * 1024 * 1024;   // Atlas M0 storage limit
const mb = (b) => (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB';
const kb = (b) => b >= 1048576 ? mb(b) : (b / 1024).toFixed(0) + ' KB';
const num = (n) => Number(n || 0).toLocaleString('en-US');

// Collections with their size/documents, biggest first. Works on M0 (collStats via $collStats; falls back to a plain count).
export async function collectionSizes(db) {
    const list = await db.listCollections({}, { nameOnly: true }).toArray();
    const out = [];
    for (const { name } of list) {
        if (name.startsWith('system.')) continue;
        let st = null;
        try {
            const r = await db.collection(name).aggregate([{ $collStats: { storageStats: {} } }]).toArray();
            const s = r[0] && r[0].storageStats;
            if (s) st = { docs: s.count || 0, data: s.size || 0, storage: s.storageSize || 0, index: s.totalIndexSize || 0 };
        } catch (e) { /* not allowed here: fall back below */ }
        if (!st) {
            try { st = { docs: await db.collection(name).estimatedDocumentCount(), data: 0, storage: 0, index: 0 }; }
            catch (e) { st = { docs: 0, data: 0, storage: 0, index: 0 }; }
        }
        out.push({ name, ...st, total: st.storage + st.index });
    }
    out.sort((a, b) => b.total - a.total || b.docs - a.docs);
    return out;
}

export async function dbOverview(db) {
    const t0 = Date.now();
    await db.command({ ping: 1 });
    const ping = Date.now() - t0;
    let s = null;
    try { s = await db.command({ dbStats: 1, scale: 1 }); } catch (e) { /* ignore */ }
    const cols = await collectionSizes(db);
    const storage = s ? (s.storageSize || 0) + (s.indexSize || 0) : cols.reduce((a, c) => a + c.total, 0);
    return { ping, storage, data: s ? s.dataSize || 0 : cols.reduce((a, c) => a + c.data, 0), index: s ? s.indexSize || 0 : cols.reduce((a, c) => a + c.index, 0), cols, objects: s ? s.objects || 0 : cols.reduce((a, c) => a + c.docs, 0) };
}

function bar(p) {
    const n = Math.max(0, Math.min(10, Math.round(p / 10)));
    return '█'.repeat(n) + '░'.repeat(10 - n);
}

export function renderOverview(o) {
    const pct = (o.storage / FREE_PLAN_BYTES) * 100;
    const flag = pct >= 90 ? '🔴 CRITICAL — free up space now' : pct >= 70 ? '🟠 getting full' : '🟢 healthy';
    const game = o.cols.find((c) => c.name === 'villages');
    return `🗄 <b>DB Health</b> (free plan · 512 MB)\n\n` +
        `${bar(pct)} <b>${pct.toFixed(1)}%</b> — ${mb(o.storage)} of 512 MB\n${flag}\n\n` +
        `📦 Data: <b>${mb(o.data)}</b> · 🔎 Indexes: <b>${mb(o.index)}</b>\n` +
        `📄 Documents: <b>${num(o.objects)}</b> · 📚 Collections: <b>${o.cols.length}</b>\n` +
        `⚡ Ping: <b>${o.ping} ms</b>${o.ping > 800 ? ' (slow)' : ''}\n` +
        (game ? `\n🏘 Game villages: <b>${num(game.docs)}</b> saves = ${kb(game.total)}${game.docs ? ` (avg ${kb(game.total / game.docs)} each)` : ''}\n` : '') +
        `\n<i>Auto-delete (TTL) rules: ${INDEX_SPECS.filter((s) => s.o && s.o.expireAfterSeconds !== undefined).length} active in the list. Tap “Collections” for sizes, “Villages” for the biggest saves.</i>`;
}

export const DBH_PER = 6;
export function renderCollections(o, page) {
    const max = Math.max(0, Math.ceil(o.cols.length / DBH_PER) - 1);
    const pg = Math.max(0, Math.min(max, page | 0));
    const rows = o.cols.slice(pg * DBH_PER, pg * DBH_PER + DBH_PER);
    const ttl = new Set(INDEX_SPECS.filter((s) => s.o && s.o.expireAfterSeconds !== undefined).map((s) => s.c));
    const text = `📚 <b>Collections</b> — Page ${pg + 1}/${max + 1} (${o.cols.length} total)\n\n` + (rows.map((c) =>
        `• <b>${c.name}</b>${ttl.has(c.name) ? ' ⏳' : ''}\n   ${num(c.docs)} docs · ${kb(c.storage)} data · ${kb(c.index)} idx = <b>${kb(c.total)}</b> (${((c.total / FREE_PLAN_BYTES) * 100).toFixed(1)}%)`).join('\n') || 'No collections.') +
        `\n\n⏳ = has an auto-delete (TTL) rule`;
    return { text, pg, max };
}

// biggest game villages, paginated (page of 8)
export const VIL_PER = 8;
export async function villagePage(db, page) {
    const col = db.collection('villages');
    const total = await col.estimatedDocumentCount();
    const max = Math.max(0, Math.ceil(total / VIL_PER) - 1);
    const pg = Math.max(0, Math.min(max, page | 0));
    const rows = await col.find({}, { projection: { size: 1, buildings: 1, lvl: 1, updatedAt: 1, z: 0, data: 0 } }).sort({ size: -1, _id: 1 }).skip(pg * VIL_PER).limit(VIL_PER).toArray();
    const text = `🏘 <b>Biggest villages</b> — Page ${pg + 1}/${max + 1} (${num(total)} saves)\n\n` + (rows.map((r, i) =>
        `${pg * VIL_PER + i + 1}. <code>${r._id}</code> — ${r.size ? kb(r.size) : '?'} raw · 🏗 ${r.buildings ?? '?'} · Lv ${r.lvl ?? '?'}${r.updatedAt ? ' · ' + new Date(r.updatedAt).toISOString().slice(0, 10) : ''}`).join('\n') || 'No villages yet.') +
        `\n\n<i>Saves are gzip-compressed in the DB (about 6× smaller than “raw”). Old saves become compressed the next time the player's game saves.</i>`;
    return { text, pg, max };
}

export function renderTtl() {
    const D = 86400;
    const rows = INDEX_SPECS.filter((s) => s.o && s.o.expireAfterSeconds !== undefined);
    const fmt = (s) => s >= D ? Math.round(s / D) + ' d' : s >= 3600 ? Math.round(s / 3600) + ' h' : s + ' s';
    return `⏳ <b>Auto-delete (TTL) rules</b>\n\n` + rows.map((s) => `• <b>${s.c}</b>.${Object.keys(s.k)[0]} → ${fmt(s.o.expireAfterSeconds)}${s.o.partialFilterExpression ? ' (only some docs)' : ''}`).join('\n') +
        `\n\nMongoDB's TTL cleaner runs about once a minute, so space frees up shortly after a document expires.`;
}

export async function refreshTtl(db) {
    const r = await ensureIndexes(db);
    const bad = r.filter((x) => !x.ok);
    return { total: r.length, changed: r.filter((x) => x.changed).length, bad };
}
