'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BADGE_CONFIG, BADGE_MILESTONES } from '@/lib/types'
import type { Habit } from '@/lib/types'
import { applyStoredOrder } from '@/lib/habitOrder'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Dot } from 'recharts'

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
type MultiQuestion = { type: 'multi'; label: string; options: string[] }
type NumberQuestion = { type: 'number'; label: string; unit: string }
type PopupQuestion = MultiQuestion | NumberQuestion
type HabitPopupConfig = { trigger: 'yes' | 'no'; questions: PopupQuestion[] }
type TimeRange = '7d' | '30d' | 'all'

const DEFAULT_EXERCISE_CONFIG: HabitPopupConfig = {
  trigger: 'yes',
  questions: [
    { type: 'multi', label: 'What did you do?', options: ['Running', 'Swimming', 'Biking', 'Resistance', 'Yoga', 'Other'] },
    { type: 'number', label: 'Weight', unit: 'kg' },
  ],
}
const DEFAULT_READING_CONFIG: HabitPopupConfig = {
  trigger: 'yes',
  questions: [{ type: 'number', label: 'Minutes read', unit: 'min' }],
}
const DEFAULT_EATING_CONFIG: HabitPopupConfig = {
  trigger: 'no',
  questions: [{ type: 'multi', label: 'Why not?', options: ['Sugar', 'Alcohol', 'Carbs at dinner', 'Other'] }],
}

function getCutoffDate(range: TimeRange): string | null {
  if (range === 'all') return null
  const d = new Date()
  d.setDate(d.getDate() - (range === '7d' ? 7 : 30))
  return d.toISOString().split('T')[0]
}

export default function StatsPage() {
  const [stats, setStats] = useState<HabitStats[]>([])
  const [weekData, setWeekData] = useState<DayBar[]>([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [totalDaysCheckedIn, setTotalDaysCheckedIn] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')

  // Popup data from localStorage
  const [habitPopupConfig, setHabitPopupConfig] = useState<Record<string, HabitPopupConfig>>({})
  const [habitPopupAnswers, setHabitPopupAnswers] = useState<Record<string, Record<string, string[] | string>>>({})
  const [legacyReadingMinutes, setLegacyReadingMinutes] = useState<Record<string, number>>({})
  const [legacyExerciseData, setLegacyExerciseData] = useState<Record<string, { weight?: number; types?: string[] }>>({})

  const supabase = createClient()

  useEffect(() => {
    const s = localStorage.getItem('habit_popup_config'); if (s) setHabitPopupConfig(JSON.parse(s))
  }, [])
  useEffect(() => {
    const s = localStorage.getItem('habit_popup_answers'); if (s) setHabitPopupAnswers(JSON.parse(s))
  }, [])
  useEffect(() => {
    const s = localStorage.getItem('reading_minutes'); if (s) setLegacyReadingMinutes(JSON.parse(s))
  }, [])
  useEffect(() => {
    const s = localStorage.getItem('exercise_data'); if (s) setLegacyExerciseData(JSON.parse(s))
  }, [])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: habits } = await supabase.from('habits').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
    const { data: allCheckins } = await supabase.from('checkins').select('*').eq('user_id', user.id)
    const { data: badges } = await supabase.from('badges').select('*').eq('user_id', user.id)
    const { data: redeemed } = await supabase.from('wishlist_items').select('price').eq('user_id', user.id).eq('redeemed', true)

    const badgeMap = new Map<string, number[]>()
    ;(badges ?? []).forEach(b => {
      if (!badgeMap.has(b.habit_id)) badgeMap.set(b.habit_id, [])
      badgeMap.get(b.habit_id)!.push(b.milestone_days)
    })

    const today = new Date().toISOString().split('T')[0]

    function computeStreaks(habitId: string): { current: number; longest: number } {
      const checkins = (allCheckins ?? []).filter(c => c.habit_id === habitId)
      const byDate: Record<string, string> = {}
      checkins.forEach(c => { byDate[c.date] = c.response })

      // current streak: go backwards from yesterday
      let current = 0
      const d = new Date(today)
      d.setDate(d.getDate() - 1)
      while (true) {
        const dateStr = d.toISOString().split('T')[0]
        const r = byDate[dateStr]
        if (r === 'yes' || r === 'freeze') { current++; d.setDate(d.getDate() - 1) } else break
      }

      // longest streak: scan all dates in order
      const dates = Object.keys(byDate).sort()
      let longest = 0, run = 0
      for (const date of dates) {
        const r = byDate[date]
        if (r === 'yes' || r === 'freeze') { run++; longest = Math.max(longest, run) } else { run = 0 }
      }

      return { current, longest }
    }

    const habitStats: HabitStats[] = applyStoredOrder(habits ?? []).map(habit => {
      const hc = (allCheckins ?? []).filter(c => c.habit_id === habit.id)
      const kept = hc.filter(c => c.response === 'yes').length
      const total = hc.length
      const { current, longest } = computeStreaks(habit.id)
      return {
        habit,
        currentStreak: current,
        longestStreak: longest,
        totalKept: kept,
        totalDays: total,
        successRate: total > 0 ? Math.round((kept / total) * 100) : 0,
        earnedBadges: (badgeMap.get(habit.id) ?? []).sort((a, b) => a - b),
      }
    })

    const yesCheckins = (allCheckins ?? []).filter(c => c.response === 'yes')
    const habitMap = new Map((habits ?? []).map(h => [h.id, h.dollar_value]))
    const streaksByHabit = new Map(habitStats.map(s => [s.habit.id, s.currentStreak]))
    let earned = 0
    yesCheckins.forEach(c => {
      const dv = habitMap.get(c.habit_id) ?? 0
      const s = streaksByHabit.get(c.habit_id) ?? 0
      earned += dv * (s >= 365 ? 3 : s >= 30 ? 2 : s >= 7 ? 1.5 : 1)
    })
    const spent = (redeemed ?? []).reduce((s, r) => s + r.price, 0)
    const uniqueDays = new Set((allCheckins ?? []).map(c => c.date)).size
    const best = Math.max(0, ...habitStats.map(s => s.longestStreak))

    const days: DayBar[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayLabel = d.toLocaleDateString('en-SG', { weekday: 'short' })
      days.push({ day: dayLabel, count: (allCheckins ?? []).filter(c => c.date === dateStr && c.response === 'yes').length })
    }

    setStats(habitStats)
    setTotalBalance(Math.max(0, earned - spent))
    setTotalDaysCheckedIn(uniqueDays)
    setBestStreak(best)
    setWeekData(days)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function getPopupConfig(habit: Habit): HabitPopupConfig | null {
    if (habitPopupConfig[habit.id]) return habitPopupConfig[habit.id]
    const n = habit.name.toLowerCase()
    if (n.includes('exercise') || n.includes('workout') || n.includes('gym')) return DEFAULT_EXERCISE_CONFIG
    if (n.includes('read')) return DEFAULT_READING_CONFIG
    if (n.includes('eat') || n.includes('healthy')) return DEFAULT_EATING_CONFIG
    return null
  }

  function getNumberData(habitId: string, q: NumberQuestion): { date: string; label: string; value: number }[] {
    const cutoff = getCutoffDate(timeRange)
    const byDate = new Map<string, number>()

    // Primary: habit_popup_answers
    Object.entries(habitPopupAnswers).forEach(([key, ans]) => {
      const idx = key.lastIndexOf('_')
      if (key.substring(0, idx) !== habitId) return
      const date = key.substring(idx + 1)
      if (cutoff && date < cutoff) return
      const val = ans[q.label]
      if (val !== undefined && val !== '') {
        const n = parseFloat(val as string)
        if (!isNaN(n)) byDate.set(date, n)
      }
    })

    // Legacy fallback
    const labelLower = q.label.toLowerCase()
    if (labelLower.includes('weight')) {
      Object.entries(legacyExerciseData).forEach(([key, data]) => {
        const idx = key.lastIndexOf('_')
        if (key.substring(0, idx) !== habitId || data.weight === undefined) return
        const date = key.substring(idx + 1)
        if (cutoff && date < cutoff) return
        if (!byDate.has(date)) byDate.set(date, data.weight!)
      })
    }
    if (labelLower.includes('minute') || labelLower.includes('min')) {
      Object.entries(legacyReadingMinutes).forEach(([key, mins]) => {
        const idx = key.lastIndexOf('_')
        if (key.substring(0, idx) !== habitId) return
        const date = key.substring(idx + 1)
        if (cutoff && date < cutoff) return
        if (!byDate.has(date)) byDate.set(date, mins)
      })
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date,
        label: new Date(date + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }),
        value,
      }))
  }

  function getMultiData(habitId: string, q: MultiQuestion): { option: string; count: number }[] {
    const cutoff = getCutoffDate(timeRange)
    const counts: Record<string, number> = {}

    Object.entries(habitPopupAnswers).forEach(([key, ans]) => {
      const idx = key.lastIndexOf('_')
      if (key.substring(0, idx) !== habitId) return
      const date = key.substring(idx + 1)
      if (cutoff && date < cutoff) return
      const val = ans[q.label]
      if (Array.isArray(val)) val.forEach(opt => { counts[opt] = (counts[opt] ?? 0) + 1 })
    })

    // Legacy fallback for exercise types
    if (q.label.toLowerCase().includes('do') || q.label.toLowerCase().includes('exercise')) {
      Object.entries(legacyExerciseData).forEach(([key, data]) => {
        const idx = key.lastIndexOf('_')
        if (key.substring(0, idx) !== habitId || !data.types) return
        const date = key.substring(idx + 1)
        if (cutoff && date < cutoff) return
        if (!habitPopupAnswers[key]) {
          data.types.forEach(t => { counts[t] = (counts[t] ?? 0) + 1 })
        }
      })
    }

    return Object.entries(counts)
      .map(([option, count]) => ({ option, count }))
      .sort((a, b) => b.count - a.count)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  const RANGE_LABELS: Record<TimeRange, string> = { '7d': '7 days', '30d': '30 days', 'all': 'All time' }

  return (
    <div className="p-4">
      {/* Overall stats */}
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

      {/* Weekly bar chart */}
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
              {weekData.map((entry, i) => <Cell key={i} fill={entry.count > 0 ? '#047857' : '#e5e7eb'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-habit section header + time range switcher */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Per habit</p>
        <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
          {(['7d', '30d', 'all'] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${timeRange === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {stats.map(s => {
          const topBadge = s.earnedBadges.length > 0 ? BADGE_CONFIG[s.earnedBadges[s.earnedBadges.length - 1]] : null
          const popupConfig = getPopupConfig(s.habit)

          return (
            <div key={s.habit.id}>
              {/* Streak card */}
              <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
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

              {/* Popup data visualizations */}
              {popupConfig && popupConfig.questions.map((q, qi) => {
                if (q.type === 'number') {
                  const data = getNumberData(s.habit.id, q)
                  if (data.length === 0) return null
                  const values = data.map(d => d.value)
                  const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
                  const total = Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10
                  const vMin = Math.floor(Math.min(...values) * 0.95)
                  const vMax = Math.ceil(Math.max(...values) * 1.05)
                  const showLine = data.length > 1
                  return (
                    <div key={qi} className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5 mt-2">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-3 font-medium">
                        {q.label}{q.unit ? ` (${q.unit})` : ''}
                      </p>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="text-center">
                          <p className="text-gray-900 font-bold">{avg}{q.unit ? ` ${q.unit}` : ''}</p>
                          <p className="text-xs text-gray-400">Avg</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-900 font-bold">{total}{q.unit ? ` ${q.unit}` : ''}</p>
                          <p className="text-xs text-gray-400">Total</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-900 font-bold">{data.length}</p>
                          <p className="text-xs text-gray-400">Entries</p>
                        </div>
                      </div>
                      {showLine && (
                        <ResponsiveContainer width="100%" height={110}>
                          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} domain={[vMin, vMax]} allowDecimals />
                            <Tooltip
                              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                              labelStyle={{ color: '#6b7280' }}
                              itemStyle={{ color: '#047857' }}
                              formatter={(v) => [`${v}${q.unit ? ' ' + q.unit : ''}`, '']}
                            />
                            <Line type="monotone" dataKey="value" stroke="#047857" strokeWidth={2} dot={<Dot r={3} fill="#047857" />} activeDot={{ r: 5 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  )
                }

                if (q.type === 'multi') {
                  const data = getMultiData(s.habit.id, q)
                  if (data.length === 0) return null
                  const maxCount = Math.max(...data.map(d => d.count))
                  return (
                    <div key={qi} className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5 mt-2">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-3 font-medium">{q.label}</p>
                      <div className="space-y-2">
                        {data.map(({ option, count }) => (
                          <div key={option} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-28 flex-shrink-0 text-right truncate">{option}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                              <div
                                className="bg-emerald-600 h-5 rounded-full transition-all"
                                style={{ width: `${(count / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-gray-700 w-4 text-right">{count}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2 text-right">{RANGE_LABELS[timeRange]}</p>
                    </div>
                  )
                }

                return null
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
