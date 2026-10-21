// lib/dailyReset.js — TEMP replacement (original file was missing from the zip).
// Resets the per-day counters once per Bangladesh day. Safe to overwrite with your original later.
import { todayBD, dailyResetFields } from './constants.js';

export async function ensureDailyReset(users, userId) {
    await users.updateOne(
        { _id: userId, lastResetDate: { $ne: todayBD() } },
        { $set: dailyResetFields() }
    );
}
