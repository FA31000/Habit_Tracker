'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Habit, Checkin } from '@/lib/types'
import { DEFAULT_HABITS } from '@/lib/defaultHabits'
import { getStreakMultiplier, BADGE_MILESTONES } from '@/lib/types'

type CheckinMap = Record<string, 'yes' | 'no' | 'freeze'>

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

function getWeekStart() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return monday.toISOString().split('T')[0]
}

export default function CheckInPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [checkins, setCheckins] = useState<CheckinMap>({})
  const [freezeUsed, setFreezeUsed] = useState(false)
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [newBadges, setNewBadges] = useState<string[]>([])
  const supabase = createClient()
  const today = todayDate()
  const weekStart = getWeekStart()

  const load = useCallback(async () => {
    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data } = await supabase.auth.signInAnonymously()
      user = data.user
    }
    if (!user) return

    const { data: existingHabits } = await supabase.from('habits').select('id').eq('user_id', user.id)
    if (existingHabits && existingHabits.length === 0) {
      await supabase.from('habits').insert(DEFAULT_HABITS.map(h => ({ ...h, user_id: user!.id })))
      await supabase.from('wishlist_items').insert({ user_id: user.id, name: 'Premium smartphone', price: 2000.00 })
    }

    const { data: habitsData } = await supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true })
    const { data: checkinsData } = await supabase.from('checkins').select('*').eq('user_id', user.id).eq('date', today)
    const { data: freezeData } = await supabase.from('freeze_tokens').select('*').eq('user_id', user.id).eq('week_start', weekStart).single()
    const { data: allCheckins } = await supabase.from('checkins').select('habit_id, response').eq('user_id', user.id).eq('response', 'yes')
    const { data: streaksData } = await supabase.from('streaks').select('habit_id, current_streak').eq('user_id', user.id)
    const { data: redeemed } = await supabase.from('wishlist_items').select('price').eq('user_id', user.id).eq('redeemed', true)

    const habitMap = new Map((habitsData ?? []).map((h: Habit) => [h.id, h]))
    const streakMap = new Map((streaksData ?? []).map((s: { habit_id: string; current_streak: number }) => [s.habit_id, s.current_streak]))
    let earned = 0
    ;(allCheckins ?? []).forEach((c: { habit_id: string }) => {
      const habit = habitMap.get(c.habit_id)
      const streak = streakMap.get(c.habit_id) ?? 0
      if (habit) earned += habit.dollar_value * getStreakMultiplier(streak)
    })
    const spent = (redeemed ?? []).reduce((sum: number, r: { price: number }) => sum + r.price, 0)

    setHabits(habitsData ?? [])
    setBalance(Math.max(0, earned - spent))
    const map: CheckinMap = {}
    ;(checkinsData ?? []).forEach((c: Checkin) => { map[c.habit_id] = c.response })
    setCheckins(map)
    setFreezeUsed(freezeData?.used ?? false)
    setDone((habitsData ?? []).every((h: Habit) => map[h.id]))
    setLoading(false)
  }, [today, weekStart])

  useEffect(() => { load() }, [load])

  async function answer(habitId: string, response: 'yes' | 'no' | 'freeze') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (response === 'freeze') {
      if (freezeUsed) return
      await supabase.from('freeze_tokens').upsert({ user_id: user.id, week_start: weekStart, used: true })
      setFreezeUsed(true)
    }
    await supabase.from('checkins').upsert({ habit_id: habitId, user_id: user.id, date: today, response })
    setCheckins(prev => {
      const next = { ...prev, [habitId]: response }
      if (habits.every(h => next[h.id])) setDone(false)
      return next
    })
  }

  async function saveAll() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const earned: string[] = []
    for (const habit of habits) {
      const response = checkins[habit.id]
      if (!response) continue
      const weekEndDate = new Date(weekStart)
      weekEndDate.setDate(weekEndDate.getDate() + 6)
      const { data: weekCheckins } = await supabase.from('checkins').select('response').eq('habit_id', habit.id).gte('date', weekStart).lte('date', weekEndDate.toISOString().split('T')[0])
      const noDaysThisWeek = (weekCheckins ?? []).filter((c: { response: string }) => c.response === 'no').length
      const streakContinues = response === 'yes' || response === 'freeze' || noDaysThisWeek <= habit.allowed_no_days_per_week
      const { data: streakData } = await supabase.from('streaks').select('*').eq('habit_id', habit.id).single()
      if (streakData) {
        const newCurrent = streakContinues ? streakData.current_streak + 1 : 0
        const newLongest = Math.max(streakData.longest_streak, newCurrent)
        await supabase.from('streaks').update({ current_streak: newCurrent, longest_streak: newLongest, updated_at: new Date().toISOString() }).eq('habit_id', habit.id)
        for (const milestone of BADGE_MILESTONES) {
          if (newCurrent >= milestone && streakData.current_streak < milestone) {
            await supabase.from('badges').upsert({ habit_id: habit.id, user_id: user.id, milestone_days: milestone })
            earned.push(`${habit.name} — ${milestone}-day badge!`)
          }
        }
      } else {
        const newCurrent = streakContinues ? 1 : 0
        await supabase.from('streaks').insert({ habit_id: habit.id, user_id: user.id, current_streak: newCurrent, longest_streak: newCurrent })
      }
    }
    setNewBadges(earned)
    setSaving(false)
    setDone(true)
    await load()
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  const answered = habits.filter(h => checkins[h.id]).length
  const allAnswered = answered === habits.length

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 mt-2">
        <p className="text-sm text-gray-500">{answered}/{habits.length} answered</p>
        <div className="flex items-center gap-3">
          {!freezeUsed
            ? <span className="text-xs text-amber-600 font-medium">❄️ 1 freeze left</span>
            : <span className="text-xs text-gray-400">❄️ Freeze used</span>}
          <span className="text-sm font-bold text-emerald-700">S${balance.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-3">
        {habits.map(habit => {
          const response = checkins[habit.id]
          return (
            <div key={habit.id} className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900">{habit.name}</p>
                <span className="text-xs text-emerald-700 font-medium">+S${habit.dollar_value.toFixed(2)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => answer(habit.id, 'yes')}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                    response === 'yes' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 active:bg-emerald-100'
                  }`}
                >
                  ✅ Yes
                </button>
                <button
                  onClick={() => answer(habit.id, 'no')}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                    response === 'no' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 active:bg-red-100'
                  }`}
                >
                  ❌ No
                </button>
                <button
                  onClick={() => answer(habit.id, 'freeze')}
                  disabled={freezeUsed && response !== 'freeze'}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                    response === 'freeze' ? 'bg-blue-500 text-white'
                    : freezeUsed ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-gray-100 text-amber-600 active:bg-blue-100'
                  }`}
                >
                  ❄️ Freeze
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {allAnswered && !done && (
        <button
          onClick={saveAll}
          disabled={saving}
          className="w-full mt-6 py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-base disabled:opacity-50 shadow-sm"
        >
          {saving ? 'Saving...' : '🎯 Save Check-In'}
        </button>
      )}

      {done && (
        <div className="mt-6 space-y-3">
          <div className="bg-white ring-1 ring-black/5 rounded-2xl p-5 text-center shadow-sm">
            <div className="text-3xl mb-2">🎉</div>
            <p className="text-emerald-700 font-bold text-base">Check-in complete!</p>
            <p className="text-gray-500 text-sm mt-1">Balance: <span className="text-emerald-700 font-bold">S${balance.toFixed(2)}</span></p>
          </div>
          {newBadges.map((b, i) => (
            <div key={i} className="bg-amber-50 ring-1 ring-amber-200 rounded-2xl p-3 text-center text-sm text-amber-700 font-medium">
              🏅 New badge: {b}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
