'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Habit, Checkin, HabitPopupConfig, PopupAnswers } from '@/lib/types'
import { BADGE_MILESTONES, getStreakBadge, loadAppConfig, type AppConfig } from '@/lib/types'
import { applyStoredOrder } from '@/lib/habitOrder'
import { computeHabitStreak, getWeekStart, type StreakCheckin } from '@/lib/streak'
import { dayEarnings } from '@/lib/balance'
import { defaultConfigForName } from '@/lib/popupDefaults'
import { migrateLocalDataToSupabase } from '@/lib/migrate'
import Confetti from '@/components/Confetti'

type CheckinMap = Record<string, 'yes' | 'no' | 'freeze'>

const MIN_DATE = '2026-06-27'

function todayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export default function CheckInPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [checkins, setCheckins] = useState<CheckinMap>({})
  const [freezeUsed, setFreezeUsed] = useState(false)
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [newBadges, setNewBadges] = useState<string[]>([])
  const [weeklyNoCounts, setWeeklyNoCounts] = useState<Record<string, number>>({})
  const [selectedDate, setSelectedDate] = useState(todayDate)
  const [streaks, setStreaks] = useState<Record<string, number>>({})
  const [habitCheckinLists, setHabitCheckinLists] = useState<Record<string, StreakCheckin[]>>({})
  const [appConfig, setAppConfig] = useState<AppConfig>(loadAppConfig())

  // Unified popup state
  const [savedPopupAnswers, setSavedPopupAnswers] = useState<Record<string, PopupAnswers>>({})
  const [popupOpen, setPopupOpen] = useState(false)
  const [pendingPopupHabitId, setPendingPopupHabitId] = useState<string | null>(null)
  const [pendingResponse, setPendingResponse] = useState<'yes' | 'no'>('yes')
  const [popupCurrentAnswers, setPopupCurrentAnswers] = useState<PopupAnswers>({})
  const [popupFreeze, setPopupFreeze] = useState(false)

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

    const { data: habitsData } = await supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true })
    const { data: checkinsData } = await supabase.from('checkins').select('*').eq('user_id', user.id).eq('date', selectedDate)
    const { data: freezeData } = await supabase.from('freeze_tokens').select('*').eq('user_id', user.id).eq('week_start', weekStart).single()
    const { data: allCheckins } = await supabase.from('checkins').select('habit_id, response, date').eq('user_id', user.id)

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

    const computedStreaks: Record<string, number> = {}
    const lists: Record<string, StreakCheckin[]> = {}
    ;(habitsData ?? []).forEach((h: Habit) => {
      const byDate = checkinsByHabit[h.id] ?? {}
      const list = Object.entries(byDate).map(([date, response]) => ({ date, response: response as 'yes' | 'no' | 'freeze' }))
      lists[h.id] = list
      computedStreaks[h.id] = computeHabitStreak(list, h.allowed_no_days_per_week, selectedDate).current
    })
    setHabitCheckinLists(lists)

    const cfg = loadAppConfig()
    const activeHabits = habitsData ?? []

    setStreaks(computedStreaks)
    setHabits(applyStoredOrder(habitsData ?? []))
    setBalance(dayEarnings(selectedDate, activeHabits, lists, cfg))
    const map: CheckinMap = {}
    const ansMap: Record<string, PopupAnswers> = {}
    ;(checkinsData ?? []).forEach((c: Checkin) => {
      map[c.habit_id] = c.response
      if (c.answers) ansMap[c.habit_id + '_' + c.date] = c.answers
    })
    setCheckins(map)
    setSavedPopupAnswers(ansMap)
    setFreezeUsed(freezeData?.used ?? false)
    setDone((habitsData ?? []).every((h: Habit) => map[h.id]))
    setLoading(false)
  }, [selectedDate, weekStart])

  useEffect(() => { setLoading(true); setCheckins({}); load() }, [load])

  // One-time migration of old localStorage popup data into Supabase, then reload.
  useEffect(() => {
    migrateLocalDataToSupabase(supabase).then(() => load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'app_config') setAppConfig(loadAppConfig())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function getPopupConfig(habitId: string): HabitPopupConfig | null {
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return null
    return habit.question_config ?? defaultConfigForName(habit.name)
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

  // Streak the habit would have if selectedDate held `response` (null = day left unanswered).
  function projectStreak(habit: Habit, response: 'yes' | 'no' | 'freeze' | null): number {
    const list = (habitCheckinLists[habit.id] ?? []).filter(c => c.date !== selectedDate)
    const hypo = response ? [...list, { date: selectedDate, response }] : list
    return computeHabitStreak(hypo, habit.allowed_no_days_per_week, selectedDate).current
  }

  // "No" days remaining this week, not counting the day being edited.
  function nosLeftThisWeek(habit: Habit): number {
    const list = habitCheckinLists[habit.id] ?? []
    const count = list.filter(c => c.date !== selectedDate && c.response === 'no' && getWeekStart(c.date) === weekStart).length
    return Math.max(0, habit.allowed_no_days_per_week - count)
  }

  // Whether a "no" on selectedDate is within this habit's weekly allowance
  // (i.e. an allowed "no" that does not break the streak).
  function noWithinAllowance(habit: Habit): boolean {
    const list = habitCheckinLists[habit.id] ?? []
    const before = list.filter(c => c.date < selectedDate && c.response === 'no' && getWeekStart(c.date) === weekStart).length
    return before < habit.allowed_no_days_per_week
  }

  // The habit + day that used this week's freeze, if any.
  function freezeUsage(): { habitName: string; date: string } | null {
    for (const h of habits) {
      const hit = (habitCheckinLists[h.id] ?? []).find(c => c.response === 'freeze' && getWeekStart(c.date) === weekStart)
      if (hit) return { habitName: h.name, date: hit.date }
    }
    return null
  }

  function shortDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function openPopup(habitId: string, response: 'yes' | 'no') {
    const key = habitId + '_' + selectedDate
    setPendingPopupHabitId(habitId)
    setPendingResponse(response)
    setPopupCurrentAnswers(savedPopupAnswers[key] ? { ...savedPopupAnswers[key] } : {})
    setPopupFreeze(response === 'no' && checkins[habitId] === 'freeze')
    setPopupOpen(true)
  }

  function closePopup() {
    setPopupOpen(false)
    setPopupCurrentAnswers({})
    setPendingPopupHabitId(null)
    setPopupFreeze(false)
  }

  async function confirmPopup() {
    if (!pendingPopupHabitId) return
    const config = getPopupConfig(pendingPopupHabitId)
    const showQuestions = !!config && config.trigger === pendingResponse
    const finalResponse = pendingResponse === 'no' && popupFreeze ? 'freeze' : pendingResponse
    await saveCheckin(pendingPopupHabitId, finalResponse, showQuestions ? popupCurrentAnswers : {})
    closePopup()
  }

  async function saveCheckin(habitId: string, response: 'yes' | 'no' | 'freeze', answers: PopupAnswers) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const key = habitId + '_' + selectedDate
    const prev = checkins[habitId]

    if (response === 'freeze' && prev !== 'freeze') {
      if (freezeUsed) return
      await supabase.from('freeze_tokens').upsert({ user_id: user.id, week_start: weekStart, used: true })
      setFreezeUsed(true)
    } else if (response !== 'freeze' && prev === 'freeze') {
      await supabase.from('freeze_tokens').upsert({ user_id: user.id, week_start: weekStart, used: false })
      setFreezeUsed(false)
    }

    await supabase.from('checkins').upsert({ habit_id: habitId, user_id: user.id, date: selectedDate, response, answers })
    setCheckins(p => ({ ...p, [habitId]: response }))
    setSavedPopupAnswers(p => ({ ...p, [key]: answers }))
    setDone(false)
  }

  async function clearCheckin(habitId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const key = habitId + '_' + selectedDate
    const prev = checkins[habitId]
    await supabase.from('checkins').delete().eq('habit_id', habitId).eq('user_id', user.id).eq('date', selectedDate)
    if (prev === 'freeze') {
      await supabase.from('freeze_tokens').upsert({ user_id: user.id, week_start: weekStart, used: false })
      setFreezeUsed(false)
    }
    setCheckins(p => { const next = { ...p }; delete next[habitId]; return next })
    setSavedPopupAnswers(p => { const next = { ...p }; delete next[key]; return next })
    setDone(false)
    closePopup()
  }

  async function saveAll() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const earned: string[] = []
    for (const habit of habits) {
      if (!checkins[habit.id]) continue
      const { data: habitCheckins } = await supabase.from('checkins').select('date, response').eq('habit_id', habit.id).eq('user_id', user.id)
      const list = (habitCheckins ?? []).map((c: { date: string; response: string }) => ({ date: c.date, response: c.response as 'yes' | 'no' | 'freeze' }))
      const { current, longest } = computeHabitStreak(list, habit.allowed_no_days_per_week, selectedDate)
      const { data: streakData } = await supabase.from('streaks').select('id, longest_streak').eq('habit_id', habit.id).single()
      const newLongest = Math.max(longest, streakData?.longest_streak ?? 0)
      if (streakData) {
        await supabase.from('streaks').update({ current_streak: current, longest_streak: newLongest, updated_at: new Date().toISOString() }).eq('habit_id', habit.id)
      } else {
        await supabase.from('streaks').insert({ habit_id: habit.id, user_id: user.id, current_streak: current, longest_streak: newLongest })
      }
      const { data: habitBadges } = await supabase.from('badges').select('milestone_days').eq('habit_id', habit.id)
      const have = new Set((habitBadges ?? []).map((b: { milestone_days: number }) => b.milestone_days))
      for (const milestone of BADGE_MILESTONES) {
        if (newLongest >= milestone && !have.has(milestone)) {
          await supabase.from('badges').upsert({ habit_id: habit.id, user_id: user.id, milestone_days: milestone })
          earned.push(`${habit.name} — ${milestone}-day badge!`)
        }
      }
    }
    const perfectDay = habits.length > 0 && habits.every(h => checkins[h.id] === 'yes')
    if (perfectDay) {
      await supabase.from('perfect_days').upsert({ user_id: user.id, date: selectedDate }, { onConflict: 'user_id,date', ignoreDuplicates: true })
    } else {
      await supabase.from('perfect_days').delete().eq('user_id', user.id).eq('date', selectedDate)
    }
    setNewBadges(earned)
    setSaving(false)
    setDone(true)
    if (perfectDay) setShowConfetti(true)
    await load()
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  const answered = habits.filter(h => checkins[h.id]).length
  const allAnswered = answered === habits.length

  return (
    <div className="p-3">
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}
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

      <div className="flex items-center mb-1.5">
        <p className="text-sm text-gray-500">{answered}/{habits.length} answered</p>
      </div>

      <div className="space-y-1.5">
        {habits.map(habit => {
          const response = checkins[habit.id]
          const badge = getStreakBadge(streaks[habit.id] ?? 0)
          return (
            <div
              key={habit.id}
              className={`rounded-xl px-3 py-2 shadow-sm ${badge ? '' : 'bg-white ring-1 ring-black/5'}`}
              style={badge ? { backgroundColor: badge.color + '22' } : undefined}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-semibold text-gray-900">{habit.name}</p>
                <div className="flex items-center gap-2">
                  {badge && <span className="text-xs font-semibold text-gray-500">{badge.emoji} {badge.label}</span>}
                  <span className="text-xs text-emerald-700 font-medium">+{appConfig.currencySymbol}{habit.dollar_value.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openPopup(habit.id, 'yes')}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition ${response === 'yes' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 active:bg-emerald-100'}`}
                >
                  {response === 'yes' ? getCheckinLabel(habit.id, 'yes') : '✅ Yes'}
                </button>
                <button
                  onClick={() => openPopup(habit.id, 'no')}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition ${response === 'freeze' ? 'bg-blue-500 text-white' : response === 'no' ? (noWithinAllowance(habit) ? 'bg-orange-500 text-white' : 'bg-red-500 text-white') : 'bg-gray-100 text-gray-600 active:bg-red-100'}`}
                >
                  {response === 'freeze' ? '❄️ Frozen' : response === 'no' ? getCheckinLabel(habit.id, 'no') : '❌ No'}
                </button>
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
            <p className="text-gray-500 text-sm mt-1">{selectedDate === today ? 'Earned today' : 'Earned this day'}: <span className="text-emerald-700 font-bold">{appConfig.currencySymbol}{balance.toFixed(2)}</span></p>
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
        const habit = habits.find(h => h.id === pendingPopupHabitId)
        if (!habit) return null
        const config = getPopupConfig(pendingPopupHabitId)
        const isNo = pendingResponse === 'no'
        const showQuestions = !!config && config.trigger === pendingResponse
        const finalResponse: 'yes' | 'no' | 'freeze' = isNo && popupFreeze ? 'freeze' : pendingResponse
        const resultStreak = projectStreak(habit, finalResponse)
        const baseStreak = projectStreak(habit, null)
        const willBreak = isNo && !popupFreeze && resultStreak < baseStreak
        const nosLeft = nosLeftThisWeek(habit)
        const alreadyAnswered = !!checkins[pendingPopupHabitId]
        const freezeDisabled = freezeUsed && checkins[pendingPopupHabitId] !== 'freeze'
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-6" onClick={closePopup}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <p className="text-base font-bold text-gray-900 mb-1">{isNo ? '❌' : '✅'} {habit.name}</p>
              <p className="text-sm text-gray-400 mb-5">{isNo ? 'You didn’t do it' : 'You did it'}</p>

              {showQuestions && (
                <div className="space-y-5 mb-5">
                  {config!.questions.map((q, i) => (
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
                          placeholder="e.g. 30"
                          value={popupCurrentAnswers[q.label] ?? ''}
                          onChange={e => setPopupCurrentAnswers(prev => ({ ...prev, [q.label]: e.target.value }))}
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!isNo && (
                <p className="text-sm text-gray-600 bg-emerald-50 rounded-xl px-4 py-3 mb-5">🔥 Your streak will be <span className="font-bold text-emerald-700">{resultStreak} day{resultStreak === 1 ? '' : 's'}</span>.</p>
              )}

              {isNo && (
                <div className="space-y-3 mb-5">
                  <p className="text-sm text-gray-600">You have <span className="font-bold text-gray-900">{nosLeft}</span> &ldquo;No&rdquo;{nosLeft === 1 ? '' : 's'} left this week.</p>
                  {willBreak && (
                    <p className="text-sm bg-red-50 text-red-700 rounded-xl px-4 py-3">⚠️ This breaks your streak: <span className="font-bold">{baseStreak} day{baseStreak === 1 ? '' : 's'}</span> → <span className="font-bold">{resultStreak}</span>.</p>
                  )}
                  <button
                    onClick={() => { if (!freezeDisabled) setPopupFreeze(f => !f) }}
                    disabled={freezeDisabled}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${freezeDisabled ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed' : popupFreeze ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                  >
                    <span>❄️ Use a freeze to protect my streak</span>
                    <span>{freezeDisabled ? 'used this week' : popupFreeze ? 'ON' : 'OFF'}</span>
                  </button>
                  {freezeDisabled && (() => {
                    const usage = freezeUsage()
                    return (
                      <p className="text-xs text-gray-400">
                        {usage ? <>❄️ Freeze used on <span className="font-semibold text-gray-500">{usage.habitName}</span>, {shortDate(usage.date)}.</> : 'This week’s freeze is already marked as used.'}
                      </p>
                    )
                  })()}
                  {popupFreeze && !freezeDisabled && (
                    <p className="text-sm text-blue-700">Streak protected — stays at <span className="font-bold">{resultStreak} day{resultStreak === 1 ? '' : 's'}</span>.</p>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                {alreadyAnswered && (
                  <button
                    onClick={() => clearCheckin(pendingPopupHabitId)}
                    className="py-3 px-4 rounded-xl bg-gray-100 text-red-500 font-semibold text-sm"
                  >Clear</button>
                )}
                <button
                  onClick={closePopup}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm"
                >Cancel</button>
                <button
                  onClick={confirmPopup}
                  className={`flex-1 py-3 rounded-xl text-white font-semibold text-sm ${finalResponse === 'freeze' ? 'bg-blue-500' : isNo ? 'bg-red-500' : 'bg-emerald-700'}`}
                >Save</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
