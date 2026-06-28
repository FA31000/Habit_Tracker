'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Habit, Checkin } from '@/lib/types'
import { DEFAULT_HABITS } from '@/lib/defaultHabits'
import { getStreakMultiplier, BADGE_MILESTONES, loadAppConfig, type AppConfig } from '@/lib/types'
import { applyStoredOrder } from '@/lib/habitOrder'

type CheckinMap = Record<string, 'yes' | 'no' | 'freeze'>
type MultiQuestion = { type: 'multi'; label: string; options: string[] }
type NumberQuestion = { type: 'number'; label: string; unit: string }
type PopupQuestion = MultiQuestion | NumberQuestion
type HabitPopupConfig = { trigger: 'yes' | 'no'; questions: PopupQuestion[] }
type PopupAnswers = Record<string, string[] | string>

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
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

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
  const [streaks, setStreaks] = useState<Record<string, number>>({})
  const [appConfig, setAppConfig] = useState<AppConfig>(loadAppConfig())

  // Unified popup state
  const [habitPopupConfig, setHabitPopupConfig] = useState<Record<string, HabitPopupConfig>>({})
  const [savedPopupAnswers, setSavedPopupAnswers] = useState<Record<string, PopupAnswers>>({})
  const [popupOpen, setPopupOpen] = useState(false)
  const [pendingPopupHabitId, setPendingPopupHabitId] = useState<string | null>(null)
  const [popupCurrentAnswers, setPopupCurrentAnswers] = useState<PopupAnswers>({})

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
    const { data: allCheckins } = await supabase.from('checkins').select('habit_id, response, date').eq('user_id', user.id)
    const { data: redeemed } = await supabase.from('wishlist_items').select('price').eq('user_id', user.id).eq('redeemed', true)

    const weekEndDate = new Date(weekStart)
    weekEndDate.setDate(weekEndDate.getDate() + 6)
    const { data: weekNoData } = await supabase.from('checkins').select('habit_id').eq('user_id', user.id).eq('response', 'no').gte('date', weekStart).lte('date', weekEndDate.toISOString().split('T')[0])
    const noCounts: Record<string, number> = {}
    ;(weekNoData ?? []).forEach((c: { habit_id: string }) => { noCounts[c.habit_id] = (noCounts[c.habit_id] ?? 0) + 1 })
    setWeeklyNoCounts(noCounts)

    const checkinsByHabit: Record<string, Record<string, string>> = {}
    ;(allCheckins ?? []).forEach((c: { habit_id: string; date: string; response: string }) => {
      if (!checkinsByHabit[c.habit_id]) checkinsByHabit[c.habit_id] = {}
      checkinsByHabit[c.habit_id][c.date] = c.response
    })

    function computeStreak(habitId: string): number {
      const byDate = checkinsByHabit[habitId] ?? {}
      let streak = 0
      const d = new Date(selectedDate)
      d.setDate(d.getDate() - 1)
      while (true) {
        const dateStr = d.toISOString().split('T')[0]
        const r = byDate[dateStr]
        if (r === 'yes' || r === 'freeze') { streak++; d.setDate(d.getDate() - 1) } else break
      }
      return streak
    }

    const habitMap = new Map((habitsData ?? []).map((h: Habit) => [h.id, h]))
    const computedStreaks: Record<string, number> = {}
    ;(habitsData ?? []).forEach((h: Habit) => { computedStreaks[h.id] = computeStreak(h.id) })

    const cfg = loadAppConfig()
    let earned = 0
    ;(allCheckins ?? []).filter((c: { response: string }) => c.response === 'yes').forEach((c: { habit_id: string }) => {
      const habit = habitMap.get(c.habit_id)
      const streak = computedStreaks[c.habit_id] ?? 0
      if (habit) earned += habit.dollar_value * getStreakMultiplier(streak, cfg)
    })
    const spent = (redeemed ?? []).reduce((sum: number, r: { price: number }) => sum + r.price, 0)

    setStreaks(computedStreaks)
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
    const stored = localStorage.getItem('habit_popup_config')
    if (stored) setHabitPopupConfig(JSON.parse(stored))
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('habit_popup_answers')
    if (stored) setSavedPopupAnswers(JSON.parse(stored))
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'app_config') setAppConfig(loadAppConfig())
      if (e.key === 'habit_popup_config') {
        const s = localStorage.getItem('habit_popup_config')
        if (s) setHabitPopupConfig(JSON.parse(s))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const readingHabit = habits.find(h => h.name.toLowerCase().includes('read'))
  const exerciseHabit = habits.find(h => h.name.toLowerCase().includes('exercise') || h.name.toLowerCase().includes('workout') || h.name.toLowerCase().includes('gym'))
  const eatingHabit = habits.find(h => h.name.toLowerCase().includes('eat') || h.name.toLowerCase().includes('healthy'))

  function getPopupConfig(habitId: string): HabitPopupConfig | null {
    if (habitPopupConfig[habitId]) return habitPopupConfig[habitId]
    if (exerciseHabit?.id === habitId) return DEFAULT_EXERCISE_CONFIG
    if (readingHabit?.id === habitId) return DEFAULT_READING_CONFIG
    if (eatingHabit?.id === habitId) return DEFAULT_EATING_CONFIG
    return null
  }

  function getCheckinLabel(habitId: string, response: 'yes' | 'no'): string {
    const config = getPopupConfig(habitId)
    const icon = response === 'yes' ? '✅' : '❌'
    const word = response === 'yes' ? 'Yes' : 'No'
    if (!config || config.trigger !== response) return `${icon} ${word}`
    const answers = savedPopupAnswers[habitId + '_' + selectedDate]
    if (!answers) return `${icon} ${word}`
    const parts: string[] = []
    config.questions.forEach(q => {
      const ans = answers[q.label]
      if (q.type === 'multi' && Array.isArray(ans) && ans.length > 0) parts.push(ans.join(', '))
      else if (q.type === 'number' && ans && ans !== '') parts.push(`${ans}${q.unit ? ' ' + q.unit : ''}`)
    })
    return parts.length > 0 ? `${icon} ${word} (${parts.join(', ')})` : `${icon} ${word}`
  }

  async function answer(habitId: string, response: 'yes' | 'no' | 'freeze') {
    const config = getPopupConfig(habitId)
    if (config && response === config.trigger && checkins[habitId] !== response) {
      setPendingPopupHabitId(habitId)
      setPopupCurrentAnswers({})
      setPopupOpen(true)
      return
    }
    await doAnswer(habitId, response)
  }

  async function confirmPopup() {
    if (!pendingPopupHabitId) return
    const config = getPopupConfig(pendingPopupHabitId)
    const key = pendingPopupHabitId + '_' + selectedDate

    const updated = { ...savedPopupAnswers, [key]: popupCurrentAnswers }
    setSavedPopupAnswers(updated)
    localStorage.setItem('habit_popup_answers', JSON.stringify(updated))

    // Maintain legacy keys for stats page
    if (config) {
      if (exerciseHabit?.id === pendingPopupHabitId) {
        const multiQ = config.questions.find(q => q.type === 'multi') as MultiQuestion | undefined
        const numQ = config.questions.find(q => q.type === 'number') as NumberQuestion | undefined
        const entry: { weight?: number; types?: string[] } = {}
        if (multiQ) { const a = popupCurrentAnswers[multiQ.label]; if (Array.isArray(a)) entry.types = a }
        if (numQ) { const a = popupCurrentAnswers[numQ.label]; if (a && a !== '') entry.weight = parseFloat(a as string) }
        const stored = localStorage.getItem('exercise_data')
        const all = stored ? JSON.parse(stored) : {}
        all[key] = entry
        localStorage.setItem('exercise_data', JSON.stringify(all))
      }
      if (readingHabit?.id === pendingPopupHabitId) {
        const numQ = config.questions.find(q => q.type === 'number') as NumberQuestion | undefined
        if (numQ) {
          const a = popupCurrentAnswers[numQ.label]
          if (a && a !== '') {
            const stored = localStorage.getItem('reading_minutes')
            const all = stored ? JSON.parse(stored) : {}
            all[key] = parseFloat(a as string)
            localStorage.setItem('reading_minutes', JSON.stringify(all))
          }
        }
      }
    }

    await doAnswer(pendingPopupHabitId, config!.trigger)
    setPopupOpen(false)
    setPopupCurrentAnswers({})
    setPendingPopupHabitId(null)
  }

  async function doAnswer(habitId: string, response: 'yes' | 'no' | 'freeze') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (checkins[habitId] === response) {
      await supabase.from('checkins').delete().eq('habit_id', habitId).eq('user_id', user.id).eq('date', selectedDate)
      if (response === 'freeze') {
        await supabase.from('freeze_tokens').upsert({ user_id: user.id, week_start: weekStart, used: false })
        setFreezeUsed(false)
      }
      setCheckins(prev => { const next = { ...prev }; delete next[habitId]; return next })
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
      <div className="flex items-center justify-between mb-2 mt-1">
        <button
          onClick={() => { setSelectedDate(prev => addDays(prev, -1)); setDone(false) }}
          disabled={selectedDate <= MIN_DATE}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 text-gray-600 disabled:opacity-30 active:bg-gray-100"
        >‹</button>
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
        >›</button>
      </div>

      <div className="flex items-center mb-2 mt-1">
        <p className="text-sm text-gray-500">{answered}/{habits.length} answered</p>
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
                    className={`w-full py-1.5 rounded-lg text-sm font-semibold transition ${response === 'yes' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 active:bg-emerald-100'}`}
                  >
                    {response === 'yes' ? getCheckinLabel(habit.id, 'yes') : '✅ Yes'}
                  </button>
                  <span className="text-xs text-gray-400">🔥 {streaks[habit.id] ?? 0} day streak</span>
                </div>
                <div className="flex-1 flex flex-col items-center gap-0.5">
                  <button
                    onClick={() => answer(habit.id, 'no')}
                    className={`w-full py-1.5 rounded-lg text-sm font-semibold transition ${response === 'no' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 active:bg-red-100'}`}
                  >
                    {response === 'no' ? getCheckinLabel(habit.id, 'no') : '❌ No'}
                  </button>
                  <span className="text-xs text-gray-400">{habit.allowed_no_days_per_week - (weeklyNoCounts[habit.id] ?? 0)} no{habit.allowed_no_days_per_week - (weeklyNoCounts[habit.id] ?? 0) === 1 ? '' : 's'} left this week</span>
                </div>
                <div className="flex-1 flex flex-col items-center gap-0.5">
                  <button
                    onClick={() => answer(habit.id, 'freeze')}
                    disabled={freezeUsed && response !== 'freeze'}
                    className={`w-full py-1.5 rounded-lg text-sm font-semibold transition ${response === 'freeze' ? 'bg-blue-500 text-white' : freezeUsed ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-amber-600 active:bg-blue-100'}`}
                  >❄️ Freeze</button>
                  <span className="text-xs text-gray-400">{freezeUsed ? '0 freezes left' : '1 freeze left'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {allAnswered && !done && (
        <button onClick={saveAll} disabled={saving} className="w-full mt-6 py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-base disabled:opacity-50 shadow-sm">
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

      {/* Unified popup */}
      {popupOpen && pendingPopupHabitId && (() => {
        const config = getPopupConfig(pendingPopupHabitId)
        if (!config) return null
        const isNo = config.trigger === 'no'
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl max-h-[85vh] overflow-y-auto">
              <p className="text-base font-bold text-gray-900 mb-5">
                {isNo ? '❌ Tell us more' : '✅ Log it'}
              </p>
              <div className="space-y-5">
                {config.questions.map((q, i) => (
                  <div key={i}>
                    <p className="text-sm font-medium text-gray-700 mb-2">{q.label}{q.type === 'number' && q.unit ? ` (${q.unit})` : ''}</p>
                    {q.type === 'multi' && (
                      <div className="grid grid-cols-2 gap-2">
                        {q.options.map(opt => {
                          const sel = (popupCurrentAnswers[q.label] as string[] | undefined) ?? []
                          const active = sel.includes(opt)
                          return (
                            <button
                              key={opt}
                              onClick={() => setPopupCurrentAnswers(prev => {
                                const cur = (prev[q.label] as string[]) ?? []
                                return { ...prev, [q.label]: cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt] }
                              })}
                              className={`py-2 px-3 rounded-xl text-sm font-semibold border transition-colors text-center ${active ? (isNo ? 'bg-red-500 text-white border-red-500' : 'bg-emerald-600 text-white border-emerald-600') : 'bg-gray-50 text-gray-800 border-gray-200'}`}
                            >
                              {opt}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {q.type === 'number' && (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder={q.unit ? `e.g. 30` : 'Enter a number'}
                        value={popupCurrentAnswers[q.label] ?? ''}
                        onChange={e => setPopupCurrentAnswers(prev => ({ ...prev, [q.label]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setPopupOpen(false); setPopupCurrentAnswers({}); setPendingPopupHabitId(null) }}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm"
                >Cancel</button>
                <button
                  onClick={confirmPopup}
                  className={`flex-1 py-3 rounded-xl text-white font-semibold text-sm ${isNo ? 'bg-red-500' : 'bg-emerald-700'}`}
                >Save</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
