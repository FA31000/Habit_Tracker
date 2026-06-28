'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getStreakMultiplier, loadAppConfig } from '@/lib/types'

export default function BalanceBadge() {
  const [balance, setBalance] = useState<number | null>(null)
  const [symbol, setSymbol] = useState('S$')

  useEffect(() => {
    const cfg = loadAppConfig()
    setSymbol(cfg.currencySymbol ?? 'S$')

    async function fetchBalance() {
      const supabase = createClient()
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: habitsData } = await supabase.from('habits').select('id, dollar_value').eq('user_id', user.id).eq('is_active', true)
      const { data: allCheckins } = await supabase.from('checkins').select('habit_id, response, date').eq('user_id', user.id)
      const { data: redeemed } = await supabase.from('wishlist_items').select('price').eq('user_id', user.id).eq('redeemed', true)

      const habitMap = new Map((habitsData ?? []).map((h: { id: string; dollar_value: number }) => [h.id, h]))

      // compute streaks per habit
      const checkinsByHabit: Record<string, Record<string, string>> = {}
      ;(allCheckins ?? []).forEach((c: { habit_id: string; date: string; response: string }) => {
        if (!checkinsByHabit[c.habit_id]) checkinsByHabit[c.habit_id] = {}
        checkinsByHabit[c.habit_id][c.date] = c.response
      })

      function computeStreak(habitId: string): number {
        const byDate = checkinsByHabit[habitId] ?? {}
        let streak = 0
        const d = new Date()
        d.setDate(d.getDate() - 1)
        while (true) {
          const dateStr = d.toISOString().split('T')[0]
          const r = byDate[dateStr]
          if (r === 'yes' || r === 'freeze') { streak++; d.setDate(d.getDate() - 1) } else break
        }
        return streak
      }

      let earned = 0
      ;(allCheckins ?? []).filter((c: { response: string }) => c.response === 'yes').forEach((c: { habit_id: string }) => {
        const habit = habitMap.get(c.habit_id) as { id: string; dollar_value: number } | undefined
        const streak = computeStreak(c.habit_id)
        if (habit) earned += habit.dollar_value * getStreakMultiplier(streak, cfg)
      })
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
