'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchUserConfig } from '@/lib/appConfig'
import { totalEarned, creditsTotal, availableBalance, type CheckinsByHabit } from '@/lib/balance'

export default function BalanceBadge() {
  const [balance, setBalance] = useState<number | null>(null)
  const [symbol, setSymbol] = useState('S$')

  useEffect(() => {
    async function fetchBalance() {
      const supabase = createClient()
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [
        cfg,
        { data: habitsData },
        { data: allCheckins },
        { data: redeemed },
        { data: credits },
      ] = await Promise.all([
        fetchUserConfig(),
        supabase.from('habits').select('id, dollar_value, allowed_no_days_per_week').eq('user_id', user.id).eq('is_active', true),
        supabase.from('checkins').select('habit_id, response, date').eq('user_id', user.id),
        supabase.from('wishlist_items').select('price').eq('user_id', user.id).eq('redeemed', true),
        supabase.from('credits').select('amount, date').eq('user_id', user.id),
      ])
      setSymbol(cfg.currencySymbol ?? 'S$')

      const checkinsByHabit: CheckinsByHabit = {}
      ;(allCheckins ?? []).forEach((c: { habit_id: string; date: string; response: string }) => {
        if (!checkinsByHabit[c.habit_id]) checkinsByHabit[c.habit_id] = []
        checkinsByHabit[c.habit_id].push({ date: c.date, response: c.response as 'yes' | 'no' | 'freeze' })
      })

      const earned = totalEarned(habitsData ?? [], checkinsByHabit, cfg)
      const spent = (redeemed ?? []).reduce((sum: number, r: { price: number }) => sum + r.price, 0)
      const credit = creditsTotal(credits ?? [])
      setBalance(availableBalance(earned, credit, spent))
    }

    fetchBalance()

    // The badge sits in the layout, so it never remounts while moving between
    // tabs. The Rewards page fires this after a redemption or a credit change
    // so the amount stays right without a full page reload.
    const onBalanceChange = (e: StorageEvent) => { if (e.key === 'balance') fetchBalance() }
    window.addEventListener('storage', onBalanceChange)
    return () => window.removeEventListener('storage', onBalanceChange)
  }, [])

  if (balance === null) return null

  return (
    <div className="bg-white/20 rounded-full px-3 py-1">
      <span className="text-white font-bold text-sm">{symbol}{balance.toFixed(2)}</span>
    </div>
  )
}
