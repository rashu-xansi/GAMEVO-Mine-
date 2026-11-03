// lib/referral.js — referral rewards (GameVo Mine)
//
// 2 Nov 2026 (admin): STAGED rewards, each paid ONCE to the referrer (see REFERRAL_REWARDS in lib/constants.js):
//   join   50 GM   - the friend signs up through the referral link (awardReferralJoin, called from api/user.js)
//   tasks  200 GM  - the friend has completed 10 tasks
//   mining 200 GM  - the friend has claimed Mining 5 times
//   ads    (off)   - ready, switched on after the ads network is approved
// (Plus a 15% commission on every withdrawal the friend makes - see api/bot.js "wdpay_".)
//
// Every stage has its own paid flag on the friend's document, checked+set in ONE atomic findOneAndUpdate,
// so a double tap / two devices can never pay the same stage twice. A locked or banned referrer is never paid.
// The friend's first Mining collect also makes the referral "valid" (validReferralCount +1, used by the withdraw gate) - no GM.

import { REFERRAL_REWARDS } from './constants.js';

const REFERRER_OK = { isBanned: { $ne: true }, accountLocked: { $ne: true } };

async function payReferrer(users, referrerId, reward, extraInc = {}) {
    if (!(reward > 0)) return;
    await users.findOneAndUpdate(
        { _id: referrerId, ...REFERRER_OK },
        { $inc: { wtcBalance: reward, lifetimeWtcEarned: reward, referralWtcEarned: reward, ...extraInc } }
    );
}

// Pays one stage once. `flag` = the friend-document field that marks the stage as paid.
async function payStage(users, friendId, referrerId, flag, reward, extraInc) {
    const claimed = await users.findOneAndUpdate(
        { _id: friendId, [flag]: { $ne: true } },
        { $set: { [flag]: true } }
    );
    if (!claimed) return;                          // a parallel call already paid it
    await payReferrer(users, referrerId, reward, extraInc);
}

// New friend just signed up through a referral link -> referrer gets the join reward.
export async function awardReferralJoin(db, friendId, referrerId) {
    if (!referrerId || referrerId === friendId) return;
    await payStage(db.collection('users'), friendId, referrerId, 'referralJoinPaid', REFERRAL_REWARDS.join);
}

// stats = { lifetimeMined?, completedTasksCount?, lifetimeAdsWatched? } - callers pass only what they know. Everything else is a free no-op.
export async function maybeAwardReferralMilestones(db, referredUserId, stats = {}) {
    const wantMine  = stats.lifetimeMined >= 1;
    const wantTasks = stats.completedTasksCount >= REFERRAL_REWARDS.tasks.count;
    const wantAds   = REFERRAL_REWARDS.ads.enabled && stats.lifetimeAdsWatched >= REFERRAL_REWARDS.ads.count;
    if (!wantMine && !wantTasks && !wantAds) return;

    const users = db.collection('users');
    const friend = await users.findOne({ _id: referredUserId }, { projection: { referredBy: 1, referralPaid: 1, referralTasksPaid: 1, referralMinePaid: 1, referralAdsPaid: 1 } });
    if (!friend || !friend.referredBy) return;
    const referrerId = friend.referredBy;
    if (referrerId === referredUserId) return;     // self-referral guard

    // first Mining collect = "valid referral" (no GM)
    if (wantMine && !friend.referralPaid) {
        await payStage(users, referredUserId, referrerId, 'referralPaid', 0, { validReferralCount: 1 });
    }
    // 5 Mining claims
    if (stats.lifetimeMined >= REFERRAL_REWARDS.mining.count && !friend.referralMinePaid) {
        await payStage(users, referredUserId, referrerId, 'referralMinePaid', REFERRAL_REWARDS.mining.reward);
    }
    // 10 tasks
    if (wantTasks && !friend.referralTasksPaid) {
        await payStage(users, referredUserId, referrerId, 'referralTasksPaid', REFERRAL_REWARDS.tasks.reward);
    }
    // ads (off until the ads network is approved)
    if (wantAds && !friend.referralAdsPaid) {
        await payStage(users, referredUserId, referrerId, 'referralAdsPaid', REFERRAL_REWARDS.ads.reward);
    }
}
