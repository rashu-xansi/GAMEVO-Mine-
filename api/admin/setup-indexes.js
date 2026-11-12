// api/admin/setup-indexes.js — creates / repairs every database index + TTL rule (list lives in lib/indexes.js).
// Open once after the first deploy (and after any change to lib/indexes.js):
//   curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-server>/api/admin/setup-indexes
import { connectToDatabase } from '../../lib/mongodb.js';
import { isCronAuthorized } from '../../lib/cronAuth.js';
import { ensureIndexes } from '../../lib/indexes.js';

export default async function handler(req, res) {
    if (!isCronAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    try {
        const { db } = await connectToDatabase();
        const results = await ensureIndexes(db);
        const failed = results.filter((r) => !r.ok);
        return res.status(200).json({ ok: failed.length === 0, total: results.length, failed, results });
    } catch (e) {
        console.error('setup-indexes error:', e);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
}
