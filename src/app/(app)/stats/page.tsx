'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BADGE_CONFIG, BADGE_MILESTONES } from '@/lib/types'
import type { Habit } from '@/lib/types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type HabitStats = {
  habit: Habit
  currentStreak: number
  longestStreak: number
  totalKept: number
  totalDays: number
  successRate: number
  earnedBadges: number[]
}

type DayBar = { day: string; count: number }

export default function StatsPage() {
  const [stats, setStats] = useState<HabitStats[]>([])
  const [weekData, setWeekData] = useState<DayBar[]>([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [totalDaysCheckedIn, setTotalDaysCheckedIn] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: habits } = await supabase.from('habits').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
    const { data: allCheckins } = await supabase.from('checkins').select('*').eq('user_id', user.id)
    const { data: streaks } = await supabase.from('streaks').select('*').eq('user_id', user.id)
    const { data: badges } = await supabase.from('badges').select('*').eq('user_id', user.id)
    const { data: redeemed } = await supabase.from('wishlist_items').select('price').eq('user_id', user.id).eq('redeemed', true)

    const streakMap = new Map((streaks ?? []).map(s => [s.habit_id, s]))
    const badgeMap = new Map<string, number[]>()
    ;(badges ?? []).forEach(b => {
      if (!badgeMap.has(b.habit_id)) badgeMap.set(b.habit_id, [])
      badgeMap.get(b.habit_id)!.push(b.milestone_days)
    })

    const habitStats: HabitStats[] = (habits ?? []).map(habit => {
      const habitCheckins = (allCheckins ?? []).filter(c => c.habit_id === habit.id)
      const kept = habitCheckins.filter(c => c.response === 'yes').length
      const total = habitCheckins.length
      const streak = streakMap.get(habit.id)
      return {
        habit,
        currentStreak: streak?.current_streak ?? 0,
        longestStreak: streak?.longest_streak ?? 0,
        totalKept: kept,
        totalDays: total,
        successRate: total > 0 ? Math.round((kept / total) * 100) : 0,
        earnedBadges: (badgeMap.get(habit.id) ?? []).sort((a, b) => a - b),
      }
    })

    const yesCheckins = (allCheckins ?? []).filter(c => c.response === 'yes')
    const habitMap = new Map((habits ?? []).map(h => [h.id, h.dollar_value]))
    const streakMapSimple = new Map((streaks ?? []).map(s => [s.habit_id, s.current_streak]))
    let earned = 0
    yesCheckins.forEach(c => {
      const dv = habitMap.get(c.habit_id) ?? 0
      const s = streakMapSimple.get(c.habit_id) ?? 0
      const mult = s >= 365 ? 3 : s >= 30 ? 2 : s >= 7 ? 1.5 : 1
      earned += dv * mult
    })
    const spent = (redeemed ?? []).reduce((s, r) => s + r.price, 0)
    const uniqueDays = new Set((allCheckins ?? []).map(c => c.date)).size
    const best = Math.max(0, ...(streaks ?? []).map(s => s.longest_streak))

    const days: DayBar[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayLabel = d.toLocaleDateString('en-SG', { weekday: 'short' })
      const count = (allCheckins ?? []).filter(c => c.date === dateStr && c.response === 'yes').length
      days.push({ day: dayLabel, count })
    }

    setStats(habitStats)
    setTotalBalance(Math.max(0, earned - spent))
    setTotalDaysCheckedIn(uniqueDays)
    setBestStreak(best)
    setWeekData(days)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  return (
    <div className="p-4">
      <div className="grid grid-cols-3 gap-3 mb-4 mt-2">
        <div className="bg-white rounded-2xl p-3 shadow-sm ring-1 ring-black/5 text-center">
          <p className="text-emerald-700 font-extrabold text-lg">S${totalBalance.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Balance</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm ring-1 ring-black/5 text-center">
          <p className="text-emerald-700 font-extrabold text-lg">{totalDaysCheckedIn}</p>
          <p className="text-xs text-gray-500 mt-0.5">Days done</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm ring-1 ring-black/5 text-center">
          <p className="text-emerald-700 font-extrabold text-lg">{bestStreak}</p>
          <p className="text-xs text-gray-500 mt-0.5">Best streak</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5 mb-4">
        <p className="text-sm font-semibold text-gray-700 mb-4">Habits kept — last 7 days</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={weekData} barSize={28}>
            <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#6b7280' }}
              itemStyle={{ color: '#047857' }}
              formatter={(v) => [`${v} habits`, '']}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {weekData.map((entry, i) => (
                <Cell key={i} fill={entry.count > 0 ? '#047857' : '#e5e7eb'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-gray-400 uppercase tracking-wide mb-3 font-medium">Per habit</p>
      <div className="space-y-3">
        {stats.map(s => {
          const topBadge = s.earnedBadges.length > 0 ? BADGE_CONFIG[s.earnedBadges[s.earnedBadges.length - 1]] : null
          return (
            <div key={s.habit.id} className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900 flex-1 pr-2">{s.habit.name}</p>
                {topBadge && <span className="text-lg" title={topBadge.label}>{topBadge.emoji}</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center">
                  <p className="text-gray-900 font-bold">{s.currentStreak}</p>
                  <p className="text-xs text-gray-400">Streak</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-900 font-bold">{s.longestStreak}</p>
                  <p className="text-xs text-gray-400">Best</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-900 font-bold">{s.successRate}%</p>
                  <p className="text-xs text-gray-400">Rate</p>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                {BADGE_MILESTONES.map(m => {
                  const cfg = BADGE_CONFIG[m]
                  const earned = s.earnedBadges.includes(m)
                  return (
                    <div key={m} title={`${cfg.label} — ${m} days`}
                      className={`flex-1 text-center text-base rounded-lg py-1 ${earned ? 'opacity-100' : 'opacity-20 grayscale'}`}>
                      {cfg.emoji}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
