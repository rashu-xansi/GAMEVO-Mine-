// lib/tonPay.js — TON payments for "Create Task" (11 Nov 2026).
// Only plain HTTPS to TonCenter is used (no extra npm package).
//
// Set these in the server environment (Render):
//   TON_RECEIVE_ADDRESS = the TON wallet address that receives the payments (e.g. your Tonkeeper address)
//   TONCENTER_API_KEY   = (optional but recommended) free key from @tonapibot / toncenter.com, avoids rate limits
//
// The cron service (cron-job.org) calls   POST /api/payments?cron=checkDeposits   every minute with the CRON_SECRET;
// that call reads the latest incoming transfers of the wallet and matches them with the order memo (api/payments.js).

export const TON_RECEIVE_ADDRESS = String(process.env.TON_RECEIVE_ADDRESS || '').trim();

// ton://transfer link: opens Tonkeeper / any TON wallet with the amount and the memo already filled in
export function buildTonDeepLink(amountNanoTon, memo) {
    if (!TON_RECEIVE_ADDRESS) return null;
    return `ton://transfer/${encodeURIComponent(TON_RECEIVE_ADDRESS)}?amount=${Number(amountNanoTon)}&text=${encodeURIComponent(String(memo))}`;
}

// latest transactions of the receiving wallet, in TonCenter v2 format:
//   { transaction_id: { hash }, in_msg: { source, value, message } , ... }
export async function fetchRecentTonTransactions(limit = 50) {
    if (!TON_RECEIVE_ADDRESS) return [];
    const url = `https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(TON_RECEIVE_ADDRESS)}&limit=${Math.max(1, Math.min(100, limit))}&archival=false`;
    const headers = process.env.TONCENTER_API_KEY ? { 'X-API-Key': process.env.TONCENTER_API_KEY } : {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
        const r = await fetch(url, { headers, signal: ctrl.signal });
        if (!r.ok) throw new Error(`TonCenter HTTP ${r.status}`);
        const body = await r.json();
        if (!body || body.ok !== true || !Array.isArray(body.result)) throw new Error('TonCenter bad answer: ' + String((body && body.error) || 'unknown').slice(0, 150));
        return body.result;
    } finally {
        clearTimeout(timer);
    }
}
