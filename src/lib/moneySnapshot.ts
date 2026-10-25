import { createClient } from '@/lib/supabase/client'
import { fetchUserConfig } from './appConfig'
import { totalEarned, creditsTotal, availableBalance, ratePerDay, type CheckinsByHabit } from './balance'
import type { AppConfig } from './types'

export type RewardTarget = { id: string; name: string; price: number }

export type MoneySnapshot = {
  cfg: AppConfig
  balance: number
  ratePerDay: number
  // Rewards not yet redeemed, cheapest first.
  rewards: RewardTarget[]
}

// Everything needed to show the spendable balance: earnings + credits −
// redeemed, plus the open rewards and run rate for "how far to the next one".
// Shared by the top badge and the check-in celebration so they always agree.
export async function fetchMoneySnapshot(): Promise<MoneySnapshot | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const [
    cfg,
    { data: habitsData },
    { data: allCheckins },
    { data: wishlist },
    { data: credits },
  ] = await Promise.all([
    fetchUserConfig(),
    supabase.from('habits').select('id, dollar_value, allowed_no_days_per_week, start_date').eq('user_id', user.id).eq('is_active', true),
    supabase.from('checkins').select('habit_id, response, date').eq('user_id', user.id),
    supabase.from('wishlist_items').select('id, name, price, redeemed').eq('user_id', user.id),
    supabase.from('credits').select('amount, date').eq('user_id', user.id),
  ])

  const checkinsByHabit: CheckinsByHabit = {}
  ;(allCheckins ?? []).forEach((c: { habit_id: string; date: string; response: string }) => {
    if (!checkinsByHabit[c.habit_id]) checkinsByHabit[c.habit_id] = []
    checkinsByHabit[c.habit_id].push({ date: c.date, response: c.response as 'yes' | 'no' | 'freeze' | 'na' })
  })

  const items = (wishlist ?? []) as (RewardTarget & { redeemed: boolean })[]
  const earned = totalEarned(habitsData ?? [], checkinsByHabit, cfg)
  const spent = items.filter(i => i.redeemed).reduce((sum, i) => sum + i.price, 0)
  return {
    cfg,
    balance: availableBalance(earned, creditsTotal(credits ?? []), spent),
    ratePerDay: ratePerDay(habitsData ?? [], checkinsByHabit, cfg),
    rewards: items.filter(i => !i.redeemed).map(({ id, name, price }) => ({ id, name, price })).sort((a, b) => a.price - b.price),
  }
}
