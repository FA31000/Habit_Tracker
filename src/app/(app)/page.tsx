'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Habit, Checkin } from '@/lib/types'
import { DEFAULT_HABITS } from '@/lib/defaultHabits'
import { getStreakMultiplier, BADGE_MILESTONES, loadAppConfig, type AppConfig } from '@/lib/types'
import { applyStoredOrder } from '@/lib/habitOrder'

type CheckinMap = Record<string, 'yes' | 'no' | 'freeze'>

const MIN_DATE = '2026-06-27'

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

function getWeekStart(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday.toISOString().split('T')[0]
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
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
  const [weeklyNoCounts, setWeeklyNoCounts] = useState<Record<string, number>>({})
  const [selectedDate, setSelectedDate] = useState(todayDate)
  const [readingPopup, setReadingPopup] = useState(false)
  const [readingMinutesInput, setReadingMinutesInput] = useState('')
  const [readingMinutes, setReadingMinutes] = useState<Record<string, number>>({})
  const [pendingReadingHabitId, setPendingReadingHabitId] = useState<string | null>(null)
  const [exercisePopup, setExercisePopup] = useState(false)
  const [exerciseWeightInput, setExerciseWeightInput] = useState('')
  const [exerciseTypeInput, setExerciseTypeInput] = useState('')
  const [exerciseData, setExerciseData] = useState<Record<string, { weight?: number; type?: string }>>({})
  const [pendingExerciseHabitId, setPendingExerciseHabitId] = useState<string | null>(null)
  const [streaks, setStreaks] = useState<Record<string, number>>({})
  const [appConfig, setAppConfig] = useState<AppConfig>(loadAppConfig())
  const supabase = createClient()
  const today = todayDate()
  const weekStart = getWeekStart(selectedDate)

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
    const { data: checkinsData } = await supabase.from('checkins').select('*').eq('user_id', user.id).eq('date', selectedDate)
    const { data: freezeData } = await supabase.from('freeze_tokens').select('*').eq('user_id', user.id).eq('week_start', weekStart).single()
    const { data: allCheckins } = await supabase.from('checkins').select('habit_id, response').eq('user_id', user.id).eq('response', 'yes')
    const { data: streaksData } = await supabase.from('streaks').select('habit_id, current_streak').eq('user_id', user.id)
    const { data: redeemed } = await supabase.from('wishlist_items').select('price').eq('user_id', user.id).eq('redeemed', true)

    const weekEndDate = new Date(weekStart)
    weekEndDate.setDate(weekEndDate.getDate() + 6)
    const { data: weekNoData } = await supabase.from('checkins').select('habit_id').eq('user_id', user.id).eq('response', 'no').gte('date', weekStart).lte('date', weekEndDate.toISOString().split('T')[0])
    const noCounts: Record<string, number> = {}
    ;(weekNoData ?? []).forEach((c: { habit_id: string }) => { noCounts[c.habit_id] = (noCounts[c.habit_id] ?? 0) + 1 })
    setWeeklyNoCounts(noCounts)

    const habitMap = new Map((habitsData ?? []).map((h: Habit) => [h.id, h]))
    const streakMap = new Map((streaksData ?? []).map((s: { habit_id: string; current_streak: number }) => [s.habit_id, s.current_streak]))
    const cfg = loadAppConfig()
    let earned = 0
    ;(allCheckins ?? []).forEach((c: { habit_id: string }) => {
      const habit = habitMap.get(c.habit_id)
      const streak = streakMap.get(c.habit_id) ?? 0
      if (habit) earned += habit.dollar_value * getStreakMultiplier(streak, cfg)
    })
    const spent = (redeemed ?? []).reduce((sum: number, r: { price: number }) => sum + r.price, 0)

    setStreaks(Object.fromEntries(streakMap))
    setHabits(applyStoredOrder(habitsData ?? []))
    setBalance(Math.max(0, earned - spent))
    const map: CheckinMap = {}
    ;(checkinsData ?? []).forEach((c: Checkin) => { map[c.habit_id] = c.response })
    setCheckins(map)
    setFreezeUsed(freezeData?.used ?? false)
    setDone((habitsData ?? []).every((h: Habit) => map[h.id]))
    setLoading(false)
  }, [selectedDate, weekStart])

  useEffect(() => { setLoading(true); setCheckins({}); load() }, [load])

  useEffect(() => {
    const stored = localStorage.getItem('reading_minutes')
    if (stored) setReadingMinutes(JSON.parse(stored))
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('exercise_data')
    if (stored) setExerciseData(JSON.parse(stored))
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'app_config') setAppConfig(loadAppConfig())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const readingHabit = habits.find(h => h.name.toLowerCase().includes('read'))
  const exerciseHabit = habits.find(h => h.name.toLowerCase().includes('exercise') || h.name.toLowerCase().includes('workout') || h.name.toLowerCase().includes('gym'))

  function saveReadingMinutes(habitId: string, minutes: number) {
    const updated = { ...readingMinutes, [habitId + '_' + selectedDate]: minutes }
    setReadingMinutes(updated)
    localStorage.setItem('reading_minutes', JSON.stringify(updated))
  }

  function saveExerciseData(habitId: string, weight?: number, type?: string) {
    const entry: { weight?: number; type?: string } = {}
    if (weight !== undefined) entry.weight = weight
    if (type) entry.type = type
    const updated = { ...exerciseData, [habitId + '_' + selectedDate]: entry }
    setExerciseData(updated)
    localStorage.setItem('exercise_data', JSON.stringify(updated))
  }

  function confirmExercise() {
    const weightVal = exerciseWeightInput.trim() !== '' ? parseFloat(exerciseWeightInput) : undefined
    if (pendingExerciseHabitId) {
      saveExerciseData(
        pendingExerciseHabitId,
        weightVal !== undefined && !isNaN(weightVal) ? weightVal : undefined,
        exerciseTypeInput || undefined
      )
      doAnswer(pendingExerciseHabitId, 'yes')
    }
    setExercisePopup(false)
    setExerciseWeightInput('')
    setExerciseTypeInput('')
    setPendingExerciseHabitId(null)
  }

  function confirmReadingMinutes() {
    const mins = parseInt(readingMinutesInput)
    if (!isNaN(mins) && mins > 0 && pendingReadingHabitId) {
      saveReadingMinutes(pendingReadingHabitId, mins)
    }
    setReadingPopup(false)
    setReadingMinutesInput('')
    if (pendingReadingHabitId) doAnswer(pendingReadingHabitId, 'yes')
    setPendingReadingHabitId(null)
  }

  async function answer(habitId: string, response: 'yes' | 'no' | 'freeze') {
    if (response === 'yes' && readingHabit && habitId === readingHabit.id && checkins[habitId] !== 'yes') {
      setPendingReadingHabitId(habitId)
      setReadingMinutesInput('')
      setReadingPopup(true)
      return
    }
    if (response === 'yes' && exerciseHabit && habitId === exerciseHabit.id && checkins[habitId] !== 'yes') {
      setPendingExerciseHabitId(habitId)
      setExerciseWeightInput('')
      setExerciseTypeInput('')
      setExercisePopup(true)
      return
    }
    await doAnswer(habitId, response)
  }

  async function doAnswer(habitId: string, response: 'yes' | 'no' | 'freeze') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // If clicking the already-selected option, cancel it
    if (checkins[habitId] === response) {
      await supabase.from('checkins').delete().eq('habit_id', habitId).eq('user_id', user.id).eq('date', selectedDate)
      if (response === 'freeze') {
        await supabase.from('freeze_tokens').upsert({ user_id: user.id, week_start: weekStart, used: false })
        setFreezeUsed(false)
      }
      setCheckins(prev => {
        const next = { ...prev }
        delete next[habitId]
        return next
      })
      setDone(false)
      return
    }

    if (response === 'freeze') {
      if (freezeUsed) return
      await supabase.from('freeze_tokens').upsert({ user_id: user.id, week_start: weekStart, used: true })
      setFreezeUsed(true)
    }
    await supabase.from('checkins').upsert({ habit_id: habitId, user_id: user.id, date: selectedDate, response })
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
        const alreadyUpdatedToday = streakData.updated_at && streakData.updated_at.startsWith(selectedDate)
        if (alreadyUpdatedToday) continue
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
    <div className="p-3">
      {/* Date navigation */}
      <div className="flex items-center justify-between mb-2 mt-1">
        <button
          onClick={() => { setSelectedDate(prev => addDays(prev, -1)); setDone(false) }}
          disabled={selectedDate <= MIN_DATE}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 text-gray-600 disabled:opacity-30 active:bg-gray-100"
        >
          ‹
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-800">{formatDate(selectedDate)}</p>
          {selectedDate !== today && (
            <button onClick={() => { setSelectedDate(today); setDone(false) }} className="text-xs text-emerald-600 underline mt-0.5">Back to today</button>
          )}
        </div>
        <button
          onClick={() => { setSelectedDate(prev => addDays(prev, 1)); setDone(false) }}
          disabled={selectedDate >= today}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 text-gray-600 disabled:opacity-30 active:bg-gray-100"
        >
          ›
        </button>
      </div>

      <div className="flex items-center justify-between mb-2 mt-1">
        <p className="text-sm text-gray-500">{answered}/{habits.length} answered</p>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-emerald-700">{appConfig.currencySymbol}{balance.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-2">
        {habits.map(habit => {
          const response = checkins[habit.id]
          return (
            <div key={habit.id} className="bg-white rounded-xl p-3 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-900">{habit.name}</p>
                <span className="text-xs text-emerald-700 font-medium">+{appConfig.currencySymbol}{habit.dollar_value.toFixed(2)}</span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 flex flex-col items-center gap-0.5">
                  <button
                    onClick={() => answer(habit.id, 'yes')}
                    className={`w-full py-1.5 rounded-lg text-sm font-semibold transition ${
                      response === 'yes' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 active:bg-emerald-100'
                    }`}
                  >
                    {(() => {
                      if (response === 'yes') {
                        if (exerciseHabit && habit.id === exerciseHabit.id) {
                          const d = exerciseData[habit.id + '_' + selectedDate]
                          if (d) {
                            const parts = [d.type, d.weight !== undefined ? `${d.weight} kg` : null].filter(Boolean).join(', ')
                            if (parts) return `✅ Yes (${parts})`
                          }
                        }
                        if (readingHabit && habit.id === readingHabit.id) {
                          const mins = readingMinutes[habit.id + '_' + selectedDate]
                          if (mins) return `✅ Yes (${mins} min)`
                        }
                      }
                      return '✅ Yes'
                    })()}
                  </button>
                  {(() => {
                    const streak = streaks[habit.id] ?? 0
                    return <span className="text-xs text-gray-400">🔥 {streak} day streak</span>
                  })()}
                </div>
                <div className="flex-1 flex flex-col items-center gap-0.5">
                  <button
                    onClick={() => answer(habit.id, 'no')}
                    className={`w-full py-1.5 rounded-lg text-sm font-semibold transition ${
                      response === 'no' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 active:bg-red-100'
                    }`}
                  >
                    ❌ No
                  </button>
                  {(() => {
                    const used = weeklyNoCounts[habit.id] ?? 0
                    const left = habit.allowed_no_days_per_week - used
                    return (
                      <span className="text-xs text-gray-400">{left} no{left === 1 ? '' : 's'} left this week</span>
                    )
                  })()}
                </div>
                <div className="flex-1 flex flex-col items-center gap-0.5">
                <button
                  onClick={() => answer(habit.id, 'freeze')}
                  disabled={freezeUsed && response !== 'freeze'}
                  className={`w-full py-1.5 rounded-lg text-sm font-semibold transition ${
                    response === 'freeze' ? 'bg-blue-500 text-white'
                    : freezeUsed ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-gray-100 text-amber-600 active:bg-blue-100'
                  }`}
                >
                  ❄️ Freeze
                </button>
                <span className="text-xs text-gray-400">{freezeUsed ? '0 freezes left' : '1 freeze left'}</span>
                </div>
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
            <p className="text-gray-500 text-sm mt-1">Balance: <span className="text-emerald-700 font-bold">{appConfig.currencySymbol}{balance.toFixed(2)}</span></p>
          </div>
          {newBadges.map((b, i) => (
            <div key={i} className="bg-amber-50 ring-1 ring-amber-200 rounded-2xl p-3 text-center text-sm text-amber-700 font-medium">
              🏅 New badge: {b}
            </div>
          ))}
        </div>
      )}

      {/* Exercise popup */}
      {exercisePopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <p className="text-base font-bold text-gray-900 mb-4">🏃 Log your exercise</p>
            <p className="text-sm font-medium text-gray-700 mb-2">What did you do?</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['Running', 'Swimming', 'Biking', 'Resistance', 'Yoga', 'Other'].map(type => (
                <button
                  key={type}
                  onClick={() => setExerciseTypeInput(exerciseTypeInput === type ? '' : type)}
                  className={`py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    exerciseTypeInput === type
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Weight <span className="text-gray-400 font-normal">(kg, optional)</span></p>
            <input
              type="number"
              min="0"
              step="0.1"
              value={exerciseWeightInput}
              onChange={e => setExerciseWeightInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmExercise()}
              placeholder="e.g. 72.5"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setExercisePopup(false); setExerciseWeightInput(''); setExerciseTypeInput(''); setPendingExerciseHabitId(null) }}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmExercise}
                className="flex-1 py-3 rounded-xl bg-emerald-700 text-white font-semibold text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reading minutes popup */}
      {readingPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <p className="text-base font-bold text-gray-900 mb-1">📚 How many minutes did you read?</p>
            <p className="text-sm text-gray-500 mb-4">Enter 0 to skip tracking.</p>
            <input
              type="number"
              min="0"
              value={readingMinutesInput}
              onChange={e => setReadingMinutesInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmReadingMinutes()}
              placeholder="e.g. 30"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setReadingPopup(false); setReadingMinutesInput(''); setPendingReadingHabitId(null) }}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmReadingMinutes}
                className="flex-1 py-3 rounded-xl bg-emerald-700 text-white font-semibold text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
