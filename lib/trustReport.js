// lib/trustReport.js
//
// 17 Oct 2026 — "FAKE vs REAL" REPORT for the admin panel.
//
// Kaj: ekta user-er current earning-cycle (last withdraw-er por theke, ba 30 din) ghete dekhe ekta SCORE ar karon-er list dey,
// jate admin ek nojore bujhte pare user ta real manush na script. Eta PROOF na — eta indicator. Tai kokhono auto-ban kore na,
// shudhu admin-ke dekhay (lookup panel, withdraw request, "🔍 Fake/Real Report" button).
//
// Data kothay thake:
//   • users.recentAdClaims — shesh kichu ad claim-er sample (shomoy + tap→claim sec).
//   • users.botSuspectCount / multiAccountFlag / lifetime counters.
//   • withdrawals  — same wallet onno account-e use hoyeche kina.
//
// Score = point-er jog. 6+ = 🔴 Likely script, 3-5 = 🟡 Suspicious, 0-2 = 🟢 No strong script signs.
// Data khub kom hole (event < 10) ⚪ "Not enough data" dekhay — tokhon guess kore kichu bola hoy na.

import { fmtBDDateTime } from './constants.js';

const BD_OFFSET_MS = 6 * 3600 * 1000;                  // Bangladesh = UTC+6
const bdHour = (t) => new Date(t + BD_OFFSET_MS).getUTCHours();

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

// ── main: collect data + score ──
export async function buildTrustReport(db, user) {
    const userId = String(user._id);
    const now = Date.now();

    const dupWallet = await findDuplicateWallet(db, userId);

    const adTimes = (user.recentAdClaims || []).map(s => Number(s.c)).filter(Boolean);

    // ── "kokhon jege thake": last 7 din-e koyta alada ghonta-e kono activity ──
    const weekAgo = now - 7 * 86400000;
    const allEvents = adTimes.filter(t => t >= weekAgo);
    const hoursSet = new Set(allEvents.map(bdHour));
    const activeHours = hoursSet.size;

    // ── account facts ──
    const ageDays = Math.max(1, (now - new Date(user.createdAt).getTime()) / 86400000);
    const lifetimeEarned = user.lifetimeWtcEarned || 0;
    const lifetimeAds = user.lifetimeAdsWatched || 0;
    const eventCount = adTimes.length;

    // ── scoring ──
    let score = 0;
    const bad = [];   // red-flag reasons
    const good = [];  // reassuring signs

    // 1) never sleeps
    if (allEvents.length >= 24 && activeHours >= 21) { score += 3; bad.push(`Last 7 din-e ${activeHours}/24 ghonta-i active — ghumay na`); }
    else if (allEvents.length >= 24 && activeHours <= 17) good.push(`Last 7 din-e ${activeHours}/24 ghonta active — ghumanor gap ache`);
    // 2) botGuard hits
    if ((user.botSuspectCount || 0) > 0) { const p = Math.min(4, user.botSuspectCount * 2); score += p; bad.push(`botGuard ${user.botSuspectCount}bar script-pattern dhorechhe`); }
    // 3) multi-account / shared wallet
    if (user.multiAccountFlag) { score += 2; bad.push(`Multi-account flag (${(user.multiAccountSiblings || []).length} onno account ek device-e)`); }
    if (dupWallet) { score += 3; bad.push(`Ei wallet onno account (${dupWallet}) o use korechhe`); }
    // 4) brand-new account, huge balance
    if (ageDays <= 3 && lifetimeEarned >= 3000) { score += 2; bad.push(`${Math.floor(ageDays)} din-er account-e ${lifetimeEarned.toLocaleString()} WTC earn`); }
    // 5) every ad cap maxed daily
    if (ageDays >= 5 && lifetimeAds / ageDays >= 22) { score += 1; bad.push(`Din-e gor-e ${(lifetimeAds / ageDays).toFixed(0)} ad (cap 25-er kache)`); }
    // reassuring
    if ((user.validReferralCount || 0) >= 2) good.push(`${user.validReferralCount} ta valid referral`);
    if ((user.completedTasks || []).length >= 10) good.push(`${(user.completedTasks || []).length} ta task complete`);
    if (ageDays >= 14 && score <= 2) good.push(`${Math.floor(ageDays)} din-er purano account`);

    let verdict, emoji;
    if (eventCount < 10 && score < 3) { verdict = 'Not enough data yet'; emoji = '⚪'; }
    else if (score >= 6) { verdict = 'Likely script'; emoji = '🔴'; }
    else if (score >= 3) { verdict = 'Suspicious — check manually'; emoji = '🟡'; }
    else { verdict = 'No strong script signs'; emoji = '🟢'; }

    return {
        score, verdict, emoji, bad, good, eventCount,
        stats: {
            activeHours,
            ageDays: Math.floor(ageDays),
        },
    };
}

async function findDuplicateWallet(db, userId) {
    try {
        const w = await db.collection('withdrawals').find({ userId }).sort({ createdAt: -1 }).limit(1).toArray();
        const details = w[0]?.details;
        if (!details) return null;
        const other = await db.collection('withdrawals').findOne({ userId: { $ne: userId }, details }, { projection: { userId: 1 } });
        return other?.userId || null;
    } catch { return null; }
}

// ── 1-line version (lookup panel + withdraw request message) ──
export function renderTrustShort(r) {
    return `${r.emoji} <b>${r.verdict}</b> (score ${r.score})`;
}

// ── full report (button "🔍 Fake/Real Report") ──
export function renderTrustFull(user, r) {
    const s = r.stats;
    let t = `🔍 <b>Fake / Real Report</b>\nUser: <code>${user._id}</code>\n\n` +
        `${r.emoji} <b>${r.verdict}</b> — score <b>${r.score}</b>  <i>(6+ = likely script, 3–5 = check, 0–2 = ok)</i>\n\n`;
    t += r.bad.length ? `<b>🚩 Red flags</b>\n${r.bad.map(x => `• ${x}`).join('\n')}\n\n` : `<b>🚩 Red flags:</b> none found\n\n`;
    t += r.good.length ? `<b>✅ Real-user signs</b>\n${r.good.map(x => `• ${x}`).join('\n')}\n\n` : '';
    t += `<b>📊 Numbers (last 30d / this cycle)</b>\n` +
        `• Account age: ${s.ageDays} din\n` +
        `• Active hours (7d): ${s.activeHours}/24\n\n` +
        `<i>⚠️ Eta indicator, proof na. Ekhane 🔴 dekhleo kono ban auto hoy na — tumi decide koro. Withdraw-er por ei cycle-er raw data muche jay (summary withdraw history-te thake).</i>`;
    return t;
}

export { fmtBDDateTime };
