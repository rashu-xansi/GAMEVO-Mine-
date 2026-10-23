// lib/referral.js — referral reward (GameVo Mine)
//
// 23 Oct 2026 (admin): ONE flat reward. The referrer gets REFERRAL_REWARDS.perReferral (100 GM) once,
// when the referred friend completes their FIRST Mining collect (a real person, not only a signup).
// (Plus a 15% commission on every withdrawal the friend makes - see api/bot.js "wdpay_".)
//
// The paid flag lives on the friend's document (`referralPaid`) and is checked+set in ONE atomic
// findOneAndUpdate, so a double tap / two devices can never pay the same referral twice.
// A locked or banned referrer is never paid.

import { REFERRAL_REWARDS } from './constants.js';

// stats = { lifetimeMined? } — only the Mining collect passes this; every other caller is a free no-op (no DB read).
export async function maybeAwardReferralMilestones(db, referredUserId, stats = {}) {
    if (!(stats.lifetimeMined >= 1)) return;
    const users = db.collection('users');

    const friend = await users.findOne({ _id: referredUserId }, { projection: { referredBy: 1, referralPaid: 1 } });
    if (!friend || !friend.referredBy || friend.referralPaid) return;
    const referrerId = friend.referredBy;
    if (referrerId === referredUserId) return;     // self-referral guard

    const claimed = await users.findOneAndUpdate(
        { _id: referredUserId, referralPaid: { $ne: true } },
        { $set: { referralPaid: true } }
    );
    if (!claimed) return;                          // a parallel call already paid it

    const reward = REFERRAL_REWARDS.perReferral;
    await users.findOneAndUpdate(
        { _id: referrerId, isBanned: { $ne: true }, accountLocked: { $ne: true } },
        { $inc: { wtcBalance: reward, lifetimeWtcEarned: reward, referralWtcEarned: reward, validReferralCount: 1 } }
    );
}
