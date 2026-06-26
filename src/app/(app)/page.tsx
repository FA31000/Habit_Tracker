'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Habit, Checkin } from '@/lib/types'
import { DEFAULT_HABITS } from '@/lib/defaultHabits'

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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
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
        DEFAULT_HABITS.map(h => ({ ...h, user_id: user.id }))
      )
      // Seed wishlist
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

    setHabits(habitsData ?? [])

    const map: CheckinMap = {}
    ;(checkinsData ?? []).forEach((c: Checkin) => { map[c.habit_id] = c.response })
    setCheckins(map)
    setFreezeUsed(freezeData?.used ?? false)

    const allAnswered = (habitsData ?? []).every(h => map[h.id])
    setDone(allAnswered)
    setLoading(false)
  }, [today, weekStart])

  useEffect(() => { load() }, [load])

  async function answer(habitId: string, response: 'yes' | 'no' | 'freeze') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (response === 'freeze') {
      if (freezeUsed) return
      // Mark freeze token used
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
      setDone(allAnswered)
      return next
    })
  }

  async function saveAll() {
    setSaving(true)
    // Streaks and badges are calculated here after all answers saved
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    for (const habit of habits) {
      const response = checkins[habit.id]
      if (!response) continue

      // Get this week's no-day count
      const weekStartDate = new Date(weekStart)
      const weekEndDate = new Date(weekStartDate)
      weekEndDate.setDate(weekEndDate.getDate() + 6)

      const { data: weekCheckins } = await supabase
        .from('checkins')
        .select('response')
        .eq('habit_id', habit.id)
        .gte('date', weekStart)
        .lte('date', weekEndDate.toISOString().split('T')[0])

      const noDaysThisWeek = (weekCheckins ?? []).filter(c => c.response === 'no').length
      const streakContinues = response === 'yes' || response === 'freeze' || noDaysThisWeek <= habit.allowed_no_days_per_week

      // Update streak
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

        // Check for new badges
        const milestones = [5, 14, 30, 90, 180, 365]
        for (const milestone of milestones) {
          if (newCurrent >= milestone) {
            await supabase.from('badges').upsert({
              habit_id: habit.id,
              user_id: user.id,
              milestone_days: milestone,
            })
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

    setSaving(false)
    setDone(true)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  const answered = habits.filter(h => checkins[h.id]).length
  const allAnswered = answered === habits.length

  return (
    <div className="p-4">
      <div className="pt-4 mb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Today&apos;s Check-In</h1>
          <span className="text-xs text-gray-400">{new Date().toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {answered}/{habits.length} answered
          {!freezeUsed && <span className="ml-3 text-amber-400">❄️ 1 freeze available</span>}
          {freezeUsed && <span className="ml-3 text-gray-600">❄️ Freeze used this week</span>}
        </div>
      </div>

      <div className="space-y-3 mt-4">
        {habits.map(habit => {
          const response = checkins[habit.id]
          return (
            <div key={habit.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <p className="text-sm font-medium mb-3">{habit.name}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => answer(habit.id, 'yes')}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                    response === 'yes'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-800 text-gray-300 active:bg-green-700'
                  }`}
                >
                  ✅ Yes
                </button>
                <button
                  onClick={() => answer(habit.id, 'no')}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                    response === 'no'
                      ? 'bg-red-700 text-white'
                      : 'bg-gray-800 text-gray-300 active:bg-red-800'
                  }`}
                >
                  ❌ No
                </button>
                <button
                  onClick={() => answer(habit.id, 'freeze')}
                  disabled={freezeUsed && response !== 'freeze'}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                    response === 'freeze'
                      ? 'bg-blue-700 text-white'
                      : freezeUsed
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
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
        <div className="mt-6 bg-green-900/30 border border-green-800 rounded-2xl p-4 text-center">
          <div className="text-2xl mb-1">🎉</div>
          <p className="text-green-400 font-semibold">Check-in complete!</p>
          <p className="text-gray-400 text-sm mt-1">See your stats to track progress.</p>
        </div>
      )}
    </div>
  )
}
