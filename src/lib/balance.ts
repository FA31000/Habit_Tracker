import { computeHabitStreak, getWeekStart, addDays, todayDate, type StreakCheckin } from './streak'
import { getStreakMultiplier, type AppConfig } from './types'

export type EarnHabit = { id: string; dollar_value: number; allowed_no_days_per_week: number }
export type CheckinsByHabit = Record<string, StreakCheckin[]>

// Money earned on a single date: each "yes" pays its dollar value times the
// habit's streak multiplier (streak measured as of that date). A perfect day
// doubles the day's total (see isPerfectDay).
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
  const responses = habits.map(h => (checkinsByHabit[h.id] ?? []).find(c => c.date === date)?.response)
  return isPerfectDay(responses) ? earned * 2 : earned
}

// A perfect day: every habit that applied that day is "yes". "na" habits are
// left out, but at least one habit must be "yes".
export function isPerfectDay(responses: (string | undefined)[]): boolean {
  const applicable = responses.filter(r => r !== 'na')
  return applicable.length > 0 && applicable.every(r => r === 'yes')
}

// Weekly no-freeze bonus: for every week (Mon–Sun) that has finished — its
// Sunday is today or earlier — since the first check-in, if no freeze was used
// that week, the user earns cfg.weeklyNoFreezeBonus. A week is judged only by
// whether a freeze was used, matching "just no freeze used", so even a week
// with no activity counts. The in-progress week (Sunday still in the future)
// is excluded so the bonus isn't awarded then clawed back.
export function freezeBonusTotal(
  checkinsByHabit: CheckinsByHabit,
  cfg: AppConfig,
  today: string = todayDate(),
): number {
  const bonus = cfg.weeklyNoFreezeBonus ?? 0
  if (bonus <= 0) return 0
  let first: string | null = null
  const freezeWeeks = new Set<string>()
  for (const list of Object.values(checkinsByHabit)) {
    for (const c of list) {
      if (first === null || c.date < first) first = c.date
      if (c.response === 'freeze') freezeWeeks.add(getWeekStart(c.date))
    }
  }
  if (first === null) return 0
  let total = 0
  for (let w = getWeekStart(first); addDays(w, 6) <= today; w = addDays(w, 7)) {
    if (!freezeWeeks.has(w)) total += bonus
  }
  return total
}

// Credits are real money added by hand (a sale, a gift, cashback). They top up
// the reward budget but are never earnings, so they stay out of dayEarnings and
// out of the run rate.
export type CreditEntry = { amount: number; date: string }

export function creditsTotal(credits: CreditEntry[], upToDate?: string): number {
  return credits
    .filter(c => upToDate === undefined || c.date <= upToDate)
    .reduce((sum, c) => sum + c.amount, 0)
}

// What is left to spend: everything that came in, minus everything redeemed.
// Earned, credits and spent are each shown gross in the UI, so there is no rule
// about which pot drains first. This can go negative — a big reward may be
// redeemed on credit and paid back by later earnings.
export function availableBalance(earned: number, credits: number, spent: number): number {
  return earned + credits - spent
}

// Total earned across every day that has any check-in — the sum of dayEarnings
// over all dates, so a single day's earnings are always part of this total,
// plus the weekly no-freeze bonus for every finished freeze-free week.
export function totalEarned(
  habits: EarnHabit[],
  checkinsByHabit: CheckinsByHabit,
  cfg: AppConfig,
  today: string = todayDate(),
): number {
  const dates = new Set<string>()
  for (const list of Object.values(checkinsByHabit)) {
    for (const c of list) dates.add(c.date)
  }
  let total = 0
  for (const d of dates) total += dayEarnings(d, habits, checkinsByHabit, cfg)
  return total + freezeBonusTotal(checkinsByHabit, cfg, today)
}
