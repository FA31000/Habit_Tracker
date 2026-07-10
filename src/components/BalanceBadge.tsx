'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAppConfig } from '@/lib/appConfig'
import { totalEarned, type CheckinsByHabit } from '@/lib/balance'

export default function BalanceBadge() {
  const [balance, setBalance] = useState<number | null>(null)
  const [symbol, setSymbol] = useState('S$')

  useEffect(() => {
    async function fetchBalance() {
      const supabase = createClient()
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const cfg = await fetchAppConfig()
      setSymbol(cfg.currencySymbol ?? 'S$')

      const { data: habitsData } = await supabase.from('habits').select('id, dollar_value, allowed_no_days_per_week').eq('user_id', user.id).eq('is_active', true)
      const { data: allCheckins } = await supabase.from('checkins').select('habit_id, response, date').eq('user_id', user.id)
      const { data: redeemed } = await supabase.from('wishlist_items').select('price').eq('user_id', user.id).eq('redeemed', true)

      const checkinsByHabit: CheckinsByHabit = {}
      ;(allCheckins ?? []).forEach((c: { habit_id: string; date: string; response: string }) => {
        if (!checkinsByHabit[c.habit_id]) checkinsByHabit[c.habit_id] = []
        checkinsByHabit[c.habit_id].push({ date: c.date, response: c.response as 'yes' | 'no' | 'freeze' })
      })

      const earned = totalEarned(habitsData ?? [], checkinsByHabit, cfg)
      const spent = (redeemed ?? []).reduce((sum: number, r: { price: number }) => sum + r.price, 0)
      setBalance(Math.max(0, earned - spent))
    }

    fetchBalance()
  }, [])

  if (balance === null) return null

  return (
    <div className="bg-white/20 rounded-full px-3 py-1">
      <span className="text-white font-bold text-sm">{symbol}{balance.toFixed(2)}</span>
    </div>
  )
}
