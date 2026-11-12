// lib/referral.js — referral rewards (GameVo Mine) — RESET 8 Nov 2026 (admin)
//
// The numbers live in lib/constants.js (REFERRAL_REWARDS). Every step is paid ONCE per friend, to the REFERRER:
//   step 1  50 $GM    the friend completes a PINNED task (e.g. joins the channel) -> stats.teamJoined
//   step 2  100 $GM   the friend has completed 10 tasks                           -> stats.completedTasksCount
//   step 3  200 $GM   the friend has claimed Mining 3 times                       -> stats.lifetimeMined (flag refStep4Paid, old name kept)
// A friend with ALL THREE steps paid is a COMPLETED referral: referrer.completedReferralCount +1. Then, for the referrer:
//   step 5  500 $GM   10 completed referrals  (once)
//   step 6  1,000 $GM 20 completed referrals  (once)
//   step 7  15% of every withdrawal of a friend (paid in api/bot.js "wdpay_") — unchanged.
//
// Safety:
//  • each step has its own flag on the FRIEND's document (refStep1Paid..refStep4Paid), checked+set in ONE atomic findOneAndUpdate,
//    so a double tap / two devices / two requests at once can never pay the same step twice;
//  • each referrer milestone flag (refMile10 / refMile20) is checked+set in the same atomic update that pays it;
//  • a banned or locked FRIEND earns the referrer nothing (fake / suspended accounts), and a banned or locked REFERRER is never paid.
// The old flags (referralJoinPaid / referralTasksPaid / referralMinePaid / referralAdsPaid) are not read any more — that is the "reset".
// The friend's first Mining collect still makes the referral "valid" (validReferralCount +1, used by botGuard / trustReport) — no GM.

import { REFERRAL_REWARDS } from './constants.js';

const REFERRER_OK = { isBanned: { $ne: true }, accountLocked: { $ne: true } };
const FRIEND_OK = { isBanned: { $ne: true }, accountLocked: { $ne: true } };
const unwrap = (r) => (r && r.value !== undefined ? r.value : r);

async function payReferrer(users, referrerId, reward, extraInc = {}) {
    if (!(reward > 0) && !Object.keys(extraInc).length) return;
    const inc = { ...extraInc };
    if (reward > 0) { inc.wtcBalance = reward; inc.lifetimeWtcEarned = reward; inc.referralWtcEarned = reward; }
    await users.updateOne({ _id: referrerId, ...REFERRER_OK }, { $inc: inc });
}

// Pays one step once. `flag` = the friend-document field that marks the step as paid. Returns true when THIS call paid it.
async function payStep(users, friendId, referrerId, flag, reward, extraInc) {
    const claimed = unwrap(await users.findOneAndUpdate(
        { _id: friendId, [flag]: { $ne: true }, ...FRIEND_OK },
        { $set: { [flag]: true, [flag + 'At']: new Date() } }
    ));
    if (!claimed) return false;                    // already paid by a parallel call, or the friend is banned / locked
    await payReferrer(users, referrerId, reward, extraInc);
    return true;
}

// Referrer's own milestones (10 / 20 completed referrals). One atomic update per milestone: flag not set yet + enough completed referrals.
async function payMilestones(users, referrerId) {
    for (const m of REFERRAL_REWARDS.milestones) {
        const got = unwrap(await users.findOneAndUpdate(
            { _id: referrerId, ...REFERRER_OK, [m.key]: { $ne: true }, completedReferralCount: { $gte: m.need } },
            { $set: { [m.key]: true, [m.key + 'At']: new Date() }, $inc: { wtcBalance: m.reward, lifetimeWtcEarned: m.reward, referralWtcEarned: m.reward } }
        ));
        void got;
    }
}

// stats = { teamJoined?, lifetimeMined?, completedTasksCount?, gameStagesWon? } - callers pass only what they know. Everything else is a free no-op.
export async function maybeAwardReferralMilestones(db, referredUserId, stats = {}) {
    const wantJoin  = stats.teamJoined === true;
    const wantMine  = stats.lifetimeMined >= 1;
    const wantTasks = stats.completedTasksCount >= REFERRAL_REWARDS.tasks.count;
    if (!wantJoin && !wantMine && !wantTasks) return;

    const users = db.collection('users');
    const friend = await users.findOne({ _id: referredUserId }, { projection: { referredBy: 1, referralPaid: 1, refStep1Paid: 1, refStep2Paid: 1, refStep3Paid: 1, refStep4Paid: 1, refCompletedCounted: 1, isBanned: 1, accountLocked: 1 } });
    if (!friend || !friend.referredBy) return;
    const referrerId = friend.referredBy;
    if (referrerId === referredUserId) return;     // self-referral guard
    if (friend.isBanned || friend.accountLocked) return;

    // first Mining collect = "valid referral" (no GM, old flag kept on purpose: it only feeds validReferralCount)
    if (wantMine && !friend.referralPaid) {
        await payStep(users, referredUserId, referrerId, 'referralPaid', 0, { validReferralCount: 1 });
    }
    if (wantJoin && !friend.refStep1Paid)  await payStep(users, referredUserId, referrerId, 'refStep1Paid', REFERRAL_REWARDS.join);
    if (wantTasks && !friend.refStep2Paid) await payStep(users, referredUserId, referrerId, 'refStep2Paid', REFERRAL_REWARDS.tasks.reward);
    if (stats.lifetimeMined >= REFERRAL_REWARDS.mining.count && !friend.refStep4Paid) {
        await payStep(users, referredUserId, referrerId, 'refStep4Paid', REFERRAL_REWARDS.mining.reward);
    }

    // all three steps paid (join, tasks, mining; the old games step was removed 9 Nov 2026) -> this friend is a COMPLETED referral (counted exactly once), then check the referrer's 10 / 20 milestones
    if (!friend.refCompletedCounted) {
        const done = unwrap(await users.findOneAndUpdate(
            { _id: referredUserId, refCompletedCounted: { $ne: true }, refStep1Paid: true, refStep2Paid: true, refStep4Paid: true },
            { $set: { refCompletedCounted: true, refCompletedAt: new Date() } }
        ));
        if (done) {
            await users.updateOne({ _id: referrerId }, { $inc: { completedReferralCount: 1 } });
            await payMilestones(users, referrerId);
        }
    }
}
