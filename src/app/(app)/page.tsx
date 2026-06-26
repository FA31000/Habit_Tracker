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

    // Seed default habits if none exist
    const { data: existingHabits } = await supabase.from('habits').select('id').eq('user_id', user.id)
    if (existingHabits && existingHabits.length === 0) {
      await supabase.from('habits').insert(
        DEFAULT_HABITS.map(h => ({ ...h, user_id: user!.id }))
      )
      await supabase.from('wishlist_items').insert({
        user_id: user.id,
        name: 'Premium smartphone',
        price: 2000.00,
      })
    }

    const { data: habitsData } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    const { data: checkinsData } = await supabase
      .from('checkins')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)

    const { data: freezeData } = await supabase
      .from('freeze_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .single()

    // Calculate balance from all checkins + streaks
    const { data: allCheckins } = await supabase
      .from('checkins')
      .select('habit_id, response')
      .eq('user_id', user.id)
      .eq('response', 'yes')

    const { data: streaksData } = await supabase
      .from('streaks')
      .select('habit_id, current_streak')
      .eq('user_id', user.id)

    // Sum up earned balance from all-time yes checkins
    const { data: redeemed } = await supabase
      .from('wishlist_items')
      .select('price')
      .eq('user_id', user.id)
      .eq('redeemed', true)

    // Simple balance: sum of (dollar_value * multiplier) for all yes checkins
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

    const allAnswered = (habitsData ?? []).every((h: Habit) => map[h.id])
    setDone(allAnswered)
    setLoading(false)
  }, [today, weekStart])

  useEffect(() => { load() }, [load])

  async function answer(habitId: string, response: 'yes' | 'no' | 'freeze') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (response === 'freeze') {
      if (freezeUsed) return
      await supabase.from('freeze_tokens').upsert({
        user_id: user.id,
        week_start: weekStart,
        used: true,
      })
      setFreezeUsed(true)
    }

    await supabase.from('checkins').upsert({
      habit_id: habitId,
      user_id: user.id,
      date: today,
      response,
    })

    setCheckins(prev => {
      const next = { ...prev, [habitId]: response }
      const allAnswered = habits.every(h => next[h.id])
      if (allAnswered) setDone(false) // reset done so save button shows
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

      const weekStartDate = new Date(weekStart)
      const weekEndDate = new Date(weekStartDate)
      weekEndDate.setDate(weekEndDate.getDate() + 6)

      const { data: weekCheckins } = await supabase
        .from('checkins')
        .select('response')
        .eq('habit_id', habit.id)
        .gte('date', weekStart)
        .lte('date', weekEndDate.toISOString().split('T')[0])

      const noDaysThisWeek = (weekCheckins ?? []).filter((c: { response: string }) => c.response === 'no').length
      const streakContinues = response === 'yes' || response === 'freeze' || noDaysThisWeek <= habit.allowed_no_days_per_week

      const { data: streakData } = await supabase
        .from('streaks')
        .select('*')
        .eq('habit_id', habit.id)
        .single()

      if (streakData) {
        const newCurrent = streakContinues ? streakData.current_streak + 1 : 0
        const newLongest = Math.max(streakData.longest_streak, newCurrent)
        await supabase.from('streaks').update({
          current_streak: newCurrent,
          longest_streak: newLongest,
          updated_at: new Date().toISOString(),
        }).eq('habit_id', habit.id)

        for (const milestone of BADGE_MILESTONES) {
          if (newCurrent >= milestone && streakData.current_streak < milestone) {
            await supabase.from('badges').upsert({
              habit_id: habit.id,
              user_id: user.id,
              milestone_days: milestone,
            })
            earned.push(`${habit.name} — ${milestone}-day badge!`)
          }
        }
      } else {
        const newCurrent = streakContinues ? 1 : 0
        await supabase.from('streaks').insert({
          habit_id: habit.id,
          user_id: user.id,
          current_streak: newCurrent,
          longest_streak: newCurrent,
        })
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
      {/* Header */}
      <div className="pt-4 mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Today&apos;s Check-In</h1>
          <span className="text-xs text-gray-400">{new Date().toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-gray-500">
            {answered}/{habits.length} answered
            {!freezeUsed && <span className="ml-3 text-amber-400">❄️ 1 freeze available</span>}
            {freezeUsed && <span className="ml-3 text-gray-600">❄️ Freeze used</span>}
          </div>
          <div className="text-sm font-bold text-green-400">S${balance.toFixed(2)}</div>
        </div>
      </div>

      {/* Habits */}
      <div className="space-y-3">
        {habits.map(habit => {
          const response = checkins[habit.id]
          return (
            <div key={habit.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">{habit.name}</p>
                <span className="text-xs text-green-600">+S${habit.dollar_value.toFixed(2)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => answer(habit.id, 'yes')}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                    response === 'yes' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 active:bg-green-700'
                  }`}
                >
                  ✅ Yes
                </button>
                <button
                  onClick={() => answer(habit.id, 'no')}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                    response === 'no' ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-300 active:bg-red-800'
                  }`}
                >
                  ❌ No
                </button>
                <button
                  onClick={() => answer(habit.id, 'freeze')}
                  disabled={freezeUsed && response !== 'freeze'}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                    response === 'freeze' ? 'bg-blue-700 text-white'
                    : freezeUsed ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-gray-800 text-amber-300 active:bg-blue-800'
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
          className="w-full mt-6 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base disabled:opacity-50"
        >
          {saving ? 'Saving...' : '🎯 Save Check-In'}
        </button>
      )}

      {done && (
        <div className="mt-6 space-y-3">
          <div className="bg-green-900/30 border border-green-800 rounded-2xl p-4 text-center">
            <div className="text-2xl mb-1">🎉</div>
            <p className="text-green-400 font-semibold">Check-in complete!</p>
            <p className="text-gray-400 text-sm mt-1">Balance: <span className="text-green-400 font-bold">S${balance.toFixed(2)}</span></p>
          </div>
          {newBadges.map((b, i) => (
            <div key={i} className="bg-yellow-900/30 border border-yellow-700 rounded-2xl p-3 text-center text-sm text-yellow-300">
              🏅 New badge: {b}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
