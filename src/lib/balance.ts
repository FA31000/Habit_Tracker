import { computeHabitStreak, type StreakCheckin } from './streak'
import { getStreakMultiplier, type AppConfig } from './types'

export type EarnHabit = { id: string; dollar_value: number; allowed_no_days_per_week: number }
export type CheckinsByHabit = Record<string, StreakCheckin[]>

// Money earned on a single date: each "yes" pays its dollar value times the
// habit's streak multiplier (streak measured as of that date). A perfect day —
// every habit answered "yes" — doubles the day's total.
export function dayEarnings(
  date: string,
  habits: EarnHabit[],
  checkinsByHabit: CheckinsByHabit,
  cfg: AppConfig,
): number {
  let earned = 0
  for (const h of habits) {
    const list = checkinsByHabit[h.id] ?? []
    const response = list.find(c => c.date === date)?.response
    if (response === 'yes') {
      const streak = computeHabitStreak(list, h.allowed_no_days_per_week, date).current
      earned += h.dollar_value * getStreakMultiplier(streak, cfg)
    }
  }
  const perfectDay =
    habits.length > 0 &&
    habits.every(h => (checkinsByHabit[h.id] ?? []).find(c => c.date === date)?.response === 'yes')
  return perfectDay ? earned * 2 : earned
}

// Total earned across every day that has any check-in — the sum of dayEarnings
// over all dates, so a single day's earnings are always part of this total.
export function totalEarned(
  habits: EarnHabit[],
  checkinsByHabit: CheckinsByHabit,
  cfg: AppConfig,
): number {
  const dates = new Set<string>()
  for (const list of Object.values(checkinsByHabit)) {
    for (const c of list) dates.add(c.date)
  }
  let total = 0
  for (const d of dates) total += dayEarnings(d, habits, checkinsByHabit, cfg)
  return total
}
