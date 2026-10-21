// lib/referral.js — referral milestone rewards (GameVo Mine)
//
// A referrer is paid GM coin in 4 steps, each time the referred user (the friend)
// reaches a milestone for the FIRST time (real amounts live in REFERRAL_REWARDS, lib/constants.js):
//   step 1: friend joins the channel + community and verifies
//   step 2: friend completes 5 tasks
//   step 3: friend completes 20 ads
//   step 4: friend collects Mining 2 times
//
// Each step is paid exactly once. The referred user's document keeps
// referralStep1Done … referralStep4Done flags, and every flag check+set is ATOMIC
// (findOneAndUpdate), so two near-simultaneous triggers (double tap, two devices)
// can never award the same milestone twice.
//
// The reward goes straight into wtcBalance and is also added to `referralWtcEarned`,
// so the Refer tab can show the real amount earned from referrals.
// (Field names keep the old `wtc` prefix on purpose — the stored currency is shown to users as "GM coin".)
//
// Anti-abuse: a locked/banned referrer is never paid. Referral-signup velocity is
// monitored in api/user.js (alerts the admin, nothing is auto-blocked).

import {
    REFERRAL_REWARDS,
    REFERRAL_STEP2_TASK_COUNT,
    REFERRAL_STEP3_AD_COUNT,
    REFERRAL_STEP5_MINING_COUNT,
} from './constants.js';


// stats = { channelVerified?, completedTasksCount?, lifetimeAdsWatched?, lifetimeMined? }
// — pass whichever one(s) just changed.
export async function maybeAwardReferralMilestones(db, referredUserId, stats = {}) {
    const users = db.collection('users');
    const referredUser = await users.findOne(
        { _id: referredUserId },
        { projection: { referredBy: 1, referralStep1Done: 1, referralStep2Done: 1, referralStep3Done: 1, referralStep4Done: 1 } }
    );
    if (!referredUser || !referredUser.referredBy) return; // nobody referred this user
    if (referredUser.referredBy === referredUserId) return; // self-referral guard — defense in depth

    const referrerId = referredUser.referredBy;

    // The 4 milestones fire independently of each other — each one only pays bonus coins.
    const steps = [
        { key: 'referralStep1Done', met: !!stats.channelVerified, reward: REFERRAL_REWARDS.step1_verified },
        { key: 'referralStep2Done', met: stats.completedTasksCount !== undefined && stats.completedTasksCount >= REFERRAL_STEP2_TASK_COUNT, reward: REFERRAL_REWARDS.step2_tenTasks },
        { key: 'referralStep3Done', met: stats.lifetimeAdsWatched !== undefined && stats.lifetimeAdsWatched >= REFERRAL_STEP3_AD_COUNT, reward: REFERRAL_REWARDS.step3_twentyAds },
        // the friend has collected Mining 2 times (handleMineClaim in api/earn.js passes lifetimeMined)
        { key: 'referralStep4Done', met: stats.lifetimeMined !== undefined && stats.lifetimeMined >= REFERRAL_STEP5_MINING_COUNT, reward: REFERRAL_REWARDS.step4_twoMinings },
    ];

    for (const step of steps) {
        if (!step.met || referredUser[step.key]) continue;

        // ATOMIC — flag check and flag set in one operation. Of two concurrent calls only one
        // passes the $ne:true filter; the other gets null and skips the credit below.
        const claimed = await users.findOneAndUpdate(
            { _id: referredUserId, [step.key]: { $ne: true } },
            { $set: { [step.key]: true } },
            { returnDocument: 'after' }
        );
        if (!claimed) continue; // another concurrent call claimed it a few ms earlier

        await users.findOneAndUpdate(
            // locked/banned referrer skipped — the one anti-abuse gate kept.
            { _id: referrerId, isBanned: { $ne: true }, accountLocked: { $ne: true } },
            {
                
                $inc: {
                    
                    wtcBalance: step.reward, lifetimeWtcEarned: step.reward, referralWtcEarned: step.reward,
                },
            }
        );
    }
}
