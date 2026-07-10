'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BADGE_CONFIG, BADGE_MILESTONES } from '@/lib/types'
import type { Habit, MultiQuestion, NumberQuestion, HabitPopupConfig, PopupAnswers } from '@/lib/types'
import { applyStoredOrder } from '@/lib/habitOrder'
import { computeHabitStreak, todayDate } from '@/lib/streak'
import { defaultConfigForName } from '@/lib/popupDefaults'
import { migrateLocalDataToSupabase } from '@/lib/migrate'
import { XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Dot } from 'recharts'

type HabitStats = {
  habit: Habit
  currentStreak: number
  longestStreak: number
  totalKept: number
  totalDays: number
  successRate: number
  earnedBadges: number[]
}

type TimeRange = '7d' | '30d' | 'all'

function getCutoffDate(range: TimeRange): string | null {
  if (range === 'all') return null
  const d = new Date()
  d.setDate(d.getDate() - (range === '7d' ? 7 : 30))
  return d.toISOString().split('T')[0]
}

export default function StatsPage() {
  const [stats, setStats] = useState<HabitStats[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')
  const [expandedHabits, setExpandedHabits] = useState<Record<string, boolean>>({})

  // Popup answers from Supabase, keyed habitId_date
  const [habitPopupAnswers, setHabitPopupAnswers] = useState<Record<string, PopupAnswers>>({})

  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: habits } = await supabase.from('habits').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
    const { data: allCheckins } = await supabase.from('checkins').select('*').eq('user_id', user.id)
    const { data: badges } = await supabase.from('badges').select('*').eq('user_id', user.id)

    const ansMap: Record<string, PopupAnswers> = {}
    ;(allCheckins ?? []).forEach(c => { if (c.answers) ansMap[c.habit_id + '_' + c.date] = c.answers })
    setHabitPopupAnswers(ansMap)

    const badgeMap = new Map<string, number[]>()
    ;(badges ?? []).forEach(b => {
      if (!badgeMap.has(b.habit_id)) badgeMap.set(b.habit_id, [])
      badgeMap.get(b.habit_id)!.push(b.milestone_days)
    })

    const today = todayDate()

    const habitStats: HabitStats[] = applyStoredOrder(habits ?? []).map(habit => {
      const hc = (allCheckins ?? []).filter(c => c.habit_id === habit.id)
      const kept = hc.filter(c => c.response === 'yes').length
      const total = hc.length
      const list = hc.map(c => ({ date: c.date, response: c.response as 'yes' | 'no' | 'freeze' }))
      const { current, longest } = computeHabitStreak(list, habit.allowed_no_days_per_week, today)
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

    setStats(habitStats)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // One-time migration of old localStorage popup data into Supabase, then reload.
  useEffect(() => {
    migrateLocalDataToSupabase(supabase).then(() => load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getPopupConfig(habit: Habit): HabitPopupConfig | null {
    return habit.question_config ?? defaultConfigForName(habit.name)
  }

  function getNumberData(habitId: string, q: NumberQuestion): { date: string; label: string; value: number }[] {
    const cutoff = getCutoffDate(timeRange)
    const byDate = new Map<string, number>()

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

    return Object.entries(counts)
      .map(([option, count]) => ({ option, count }))
      .sort((a, b) => b.count - a.count)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  const RANGE_LABELS: Record<TimeRange, string> = { '7d': '7 days', '30d': '30 days', 'all': 'All time' }

  return (
    <div className="p-4">
      {/* Badge legend */}
      <div className="bg-white rounded-2xl p-3 shadow-sm ring-1 ring-black/5 mb-4 mt-2">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Badges</p>
        <div className="grid grid-cols-6 gap-1">
          {BADGE_MILESTONES.map(m => (
            <div key={m} className="text-center">
              <p className="text-base">{BADGE_CONFIG[m].emoji}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{m} days</p>
            </div>
          ))}
        </div>
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
          const hasExtraStats = (popupConfig?.questions ?? []).some(q => {
            if (q.type === 'number') return getNumberData(s.habit.id, q).length > 0
            if (q.type === 'multi') return getMultiData(s.habit.id, q).length > 0
            return false
          })
          const isExpanded = expandedHabits[s.habit.id] ?? false

          return (
            <div key={s.habit.id}>
              {/* Streak card */}
              <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900 flex-1 pr-2">{s.habit.name}</p>
                  {topBadge && <span className="text-lg" title={`${topBadge.label} badge`}>{topBadge.emoji}</span>}
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
                      <div key={m} title={`${m}-day badge`}
                        className={`flex-1 text-center text-base rounded-lg py-1 ${earned ? 'opacity-100' : 'opacity-20 grayscale'}`}>
                        {cfg.emoji}
                      </div>
                    )
                  })}
                </div>
                {/* Popup data visualizations (inside the same card, hidden until expanded) */}
                {isExpanded && popupConfig && popupConfig.questions.map((q, qi) => {
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
                      <div key={qi} className="mt-4">
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
                      <div key={qi} className="mt-4">
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
                {hasExtraStats && (
                  <button
                    onClick={() => setExpandedHabits(prev => ({ ...prev, [s.habit.id]: !isExpanded }))}
                    className="w-full flex justify-center pt-2 -mb-1 text-gray-400"
                    aria-label={isExpanded ? 'Hide extra stats' : 'Show extra stats'}
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
