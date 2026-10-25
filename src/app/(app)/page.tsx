'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Habit, Checkin, HabitPopupConfig, PopupAnswers } from '@/lib/types'
import { BADGE_MILESTONES, getStreakBadge, getStreakMultiplier, habitStarted, loadAppConfig, type AppConfig } from '@/lib/types'
import { fetchUserConfig } from '@/lib/appConfig'
import { applyStoredOrder } from '@/lib/habitOrder'
import { computeHabitStreak, getWeekStart, type StreakCheckin } from '@/lib/streak'
import { dayEarnings, isPerfectDay } from '@/lib/balance'
import { migrateLocalDataToSupabase } from '@/lib/migrate'
import { fillMissedDays } from '@/lib/autoNo'
import CelebrationOverlay from '@/components/CelebrationOverlay'
import { buildCelebration, type Celebration, type NewBadge } from '@/lib/celebration'
import { fetchMoneySnapshot } from '@/lib/moneySnapshot'
import { buzz, CELEBRATION_BUZZ } from '@/lib/haptics'

type CheckinMap = Record<string, 'yes' | 'no' | 'freeze' | 'na'>

const MIN_DATE = '2026-06-27'

// Auto-No runs once per app open, not on every date change.
let missedDaysFilled = false

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
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  // Balance after the last Save Check-In, for the summary card under the list.
  const [savedBalance, setSavedBalance] = useState<number | null>(null)
  // "+S$X" and the new streak floating up from a card right after tapping Yes.
  const [floats, setFloats] = useState<Record<string, { key: number; money: string; streak: number }>>({})
  const [showFreezeBonus, setShowFreezeBonus] = useState(false)
  const [newBadges, setNewBadges] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState(todayDate)
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

    if (!missedDaysFilled) {
      await fillMissedDays(supabase, user.id)
      missedDaysFilled = true
    }

    const [
      { data: habitsData },
      { data: checkinsData },
      { data: freezeData },
      { data: allCheckins },
      cfg,
    ] = await Promise.all([
      supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true }),
      supabase.from('checkins').select('*').eq('user_id', user.id).eq('date', selectedDate),
      supabase.from('freeze_tokens').select('*').eq('user_id', user.id).eq('week_start', weekStart).single(),
      supabase.from('checkins').select('habit_id, response, date').eq('user_id', user.id),
      fetchUserConfig(),
    ])

    const checkinsByHabit: Record<string, Record<string, string>> = {}
    ;(allCheckins ?? []).forEach((c: { habit_id: string; date: string; response: string }) => {
      if (!checkinsByHabit[c.habit_id]) checkinsByHabit[c.habit_id] = {}
      checkinsByHabit[c.habit_id][c.date] = c.response
    })

    const lists: Record<string, StreakCheckin[]> = {}
    ;(habitsData ?? []).forEach((h: Habit) => {
      const byDate = checkinsByHabit[h.id] ?? {}
      const list = Object.entries(byDate).map(([date, response]) => ({ date, response: response as 'yes' | 'no' | 'freeze' | 'na' }))
      lists[h.id] = list
    })
    setHabitCheckinLists(lists)

    setAppConfig(cfg)
    const activeHabits = habitsData ?? []
    const startedHabits = activeHabits.filter((h: Habit) => habitStarted(h, selectedDate))

    setHabits(applyStoredOrder(startedHabits))
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
    setDone(startedHabits.every((h: Habit) => map[h.id]))
    setLoading(false)
  }, [selectedDate, weekStart])

  useEffect(() => { setLoading(true); setCheckins({}); setSavedBalance(null); load() }, [load])

  // One-time migration of old localStorage popup data into Supabase, then reload.
  useEffect(() => {
    migrateLocalDataToSupabase(supabase).then(changed => { if (changed) load() })
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
    return habit.question_config
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
  function projectStreak(habit: Habit, response: 'yes' | 'no' | 'freeze' | 'na' | null): number {
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
    const habit = habits.find(h => h.id === pendingPopupHabitId)
    const newYes = !!habit && finalResponse === 'yes' && checkins[habit.id] !== 'yes'
    const newStreak = newYes ? projectStreak(habit, 'yes') : 0
    const pay = newYes ? habit.dollar_value * getStreakMultiplier(newStreak, appConfig) : 0
    await saveCheckin(pendingPopupHabitId, finalResponse, showQuestions ? popupCurrentAnswers : {})
    closePopup()
    if (newYes) showFloat(habit.id, `+${appConfig.currencySymbol}${pay.toFixed(2)}`, newStreak)
  }

  function showFloat(habitId: string, money: string, streak: number) {
    const key = Date.now()
    buzz(25)
    setFloats(p => ({ ...p, [habitId]: { key, money, streak } }))
    setTimeout(() => setFloats(p => {
      if (p[habitId]?.key !== key) return p
      const next = { ...p }
      delete next[habitId]
      return next
    }), 2900)
  }

  async function saveCheckin(habitId: string, response: 'yes' | 'no' | 'freeze' | 'na', answers: PopupAnswers) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const key = habitId + '_' + selectedDate
    const prev = checkins[habitId]

    if (response === 'freeze' && prev !== 'freeze') {
      if (freezeUsed) return
      await supabase.from('freeze_tokens').upsert({ user_id: user.id, week_start: weekStart, used: true }, { onConflict: 'user_id,week_start' })
      setFreezeUsed(true)
    } else if (response !== 'freeze' && prev === 'freeze') {
      await supabase.from('freeze_tokens').upsert({ user_id: user.id, week_start: weekStart, used: false }, { onConflict: 'user_id,week_start' })
      setFreezeUsed(false)
    }

    await supabase.from('checkins').upsert({ habit_id: habitId, user_id: user.id, date: selectedDate, response, answers }, { onConflict: 'habit_id,date' })
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
      await supabase.from('freeze_tokens').upsert({ user_id: user.id, week_start: weekStart, used: false }, { onConflict: 'user_id,week_start' })
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
    const earnedBadges: NewBadge[] = []
    const streakAfter: Record<string, number> = {}
    const listsAfter: Record<string, StreakCheckin[]> = { ...habitCheckinLists }
    const answered = habits.filter(h => checkins[h.id])
    const ids = answered.map(h => h.id)
    // Fetch everything at once instead of one habit at a time.
    const [checkinResults, { data: streakRows }, { data: badgeRows }] = await Promise.all([
      Promise.all(answered.map(h => supabase.from('checkins').select('date, response').eq('habit_id', h.id).eq('user_id', user.id))),
      supabase.from('streaks').select('habit_id, longest_streak').in('habit_id', ids),
      supabase.from('badges').select('habit_id, milestone_days').in('habit_id', ids),
    ])
    const streakUpdates = []
    const newStreakRows = []
    const newBadgeRows = []
    for (const [i, habit] of answered.entries()) {
      const list = (checkinResults[i].data ?? []).map((c: { date: string; response: string }) => ({ date: c.date, response: c.response as 'yes' | 'no' | 'freeze' | 'na' }))
      const { current, longest } = computeHabitStreak(list, habit.allowed_no_days_per_week, selectedDate)
      listsAfter[habit.id] = list
      streakAfter[habit.id] = current
      const streakData = (streakRows ?? []).find((s: { habit_id: string }) => s.habit_id === habit.id)
      const newLongest = Math.max(longest, streakData?.longest_streak ?? 0)
      if (streakData) {
        streakUpdates.push(supabase.from('streaks').update({ current_streak: current, longest_streak: newLongest, updated_at: new Date().toISOString() }).eq('habit_id', habit.id))
      } else {
        newStreakRows.push({ habit_id: habit.id, user_id: user.id, current_streak: current, longest_streak: newLongest })
      }
      const have = new Set((badgeRows ?? []).filter((b: { habit_id: string }) => b.habit_id === habit.id).map((b: { milestone_days: number }) => b.milestone_days))
      for (const milestone of BADGE_MILESTONES) {
        if (newLongest >= milestone && !have.has(milestone)) {
          newBadgeRows.push({ habit_id: habit.id, user_id: user.id, milestone_days: milestone })
          earned.push(`${habit.name} — ${milestone}-day badge!`)
          earnedBadges.push({ habitId: habit.id, habitName: habit.name, milestone })
        }
      }
    }
    const perfectDay = isPerfectDay(habits.map(h => checkins[h.id]))
    // Save streaks, badges and perfect day all at once, and read the new
    // balance alongside (check-ins are already saved, so it is up to date).
    const [snapshot] = await Promise.all([
      fetchMoneySnapshot(),
      ...streakUpdates,
      newStreakRows.length > 0 && supabase.from('streaks').insert(newStreakRows),
      newBadgeRows.length > 0 && supabase.from('badges').upsert(newBadgeRows),
      perfectDay
        ? supabase.from('perfect_days').upsert({ user_id: user.id, date: selectedDate }, { onConflict: 'user_id,date', ignoreDuplicates: true })
        : supabase.from('perfect_days').delete().eq('user_id', user.id).eq('date', selectedDate),
    ])
    const isSunday = new Date(selectedDate + 'T00:00:00').getDay() === 0
    setShowFreezeBonus(isSunday && !freezeUsed)
    setNewBadges(earned)
    setSaving(false)
    setDone(true)
    if (snapshot) {
      // The header badge refetches on this, so it matches the celebration.
      window.dispatchEvent(new StorageEvent('storage', { key: 'balance' }))
      setSavedBalance(snapshot.balance)
      // Only today gets the full celebration; a backfilled day just gets the
      // summary card below.
      if (selectedDate === today) {
        const cel = buildCelebration({
          date: selectedDate,
          habits: habits.map(h => ({ id: h.id, name: h.name, description: h.description, response: checkins[h.id], streak: streakAfter[h.id] ?? 0 })),
          newBadges: earnedBadges,
          perfect: perfectDay,
          earned: dayEarnings(selectedDate, habits, listsAfter, snapshot.cfg),
          balanceAfter: snapshot.balance,
          rewards: snapshot.rewards,
          ratePerDay: snapshot.ratePerDay,
          cfg: snapshot.cfg,
        })
        setCelebration(cel)
        buzz(CELEBRATION_BUZZ[cel.level])
      }
    }
    await load()
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  const answered = habits.filter(h => checkins[h.id]).length
  const allAnswered = answered === habits.length

  return (
    <div className="p-3">
      {celebration && <CelebrationOverlay data={celebration} symbol={appConfig.currencySymbol} onClose={() => setCelebration(null)} />}
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
          // Live: follows the answer as it's tapped, not just the last load.
          const streak = projectStreak(habit, response ?? null)
          const badge = getStreakBadge(streak)
          // What a Yes on this day pays (the Yes itself can reach a new badge).
          const yesPay = habit.dollar_value * getStreakMultiplier(projectStreak(habit, 'yes'), appConfig)
          return (
            <div
              key={habit.id}
              className={`relative rounded-xl px-3 py-2 shadow-sm ${badge ? '' : 'bg-white ring-1 ring-black/5'}`}
              style={badge ? { backgroundColor: badge.color + '22' } : undefined}
            >
              {floats[habit.id] && (
                <span
                  key={floats[habit.id].key}
                  className="pointer-events-none absolute left-1/2 top-1 z-10 flex flex-col items-center whitespace-nowrap drop-shadow-sm"
                  style={{ animation: 'float-up 2.8s ease-out forwards' }}
                >
                  <span className="text-lg font-extrabold text-emerald-600 leading-tight">{floats[habit.id].money}</span>
                  <span className="text-sm font-bold text-orange-500 leading-tight">🔥 {floats[habit.id].streak}-day streak</span>
                </span>
              )}
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-semibold text-gray-900">{habit.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">{streak} {streak === 1 ? 'day' : 'days'}</span>
                  <span className={`text-xs font-medium ${response === 'yes' ? 'text-emerald-700' : response && response !== 'na' ? 'text-red-500' : 'text-gray-400'}`}>+{appConfig.currencySymbol}{yesPay.toFixed(2)}</span>
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
                  {response === 'freeze' ? '❄️ Frozen' : response === 'no' ? getCheckinLabel(habit.id, 'no') : response === 'yes' || response === 'na' ? '❌ No' : (
                    <>❌ No <span className="ml-1 inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-gray-300 text-gray-700 text-[11px] font-bold align-middle">{nosLeftThisWeek(habit)}</span></>
                  )}
                </button>
                <button
                  onClick={() => { if (response !== 'na') saveCheckin(habit.id, 'na', {}) }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${response === 'na' ? 'bg-gray-500 text-white' : 'bg-gray-100 text-gray-400 active:bg-gray-200'}`}
                >
                  NA
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
            {savedBalance !== null && (
              <p className="text-gray-500 text-sm mt-0.5">Balance now: <span className={`font-bold ${savedBalance < 0 ? 'text-red-500' : 'text-gray-800'}`}>{savedBalance < 0 ? '−' : ''}{appConfig.currencySymbol}{Math.abs(savedBalance).toFixed(2)}</span></p>
            )}
          </div>
          {showFreezeBonus && (
            <div className="bg-sky-50 ring-1 ring-sky-200 rounded-2xl p-4 text-center text-sm text-sky-700 font-medium">
              ❄️ No freeze used this week — you earned a <span className="font-bold">{appConfig.currencySymbol}{appConfig.weeklyNoFreezeBonus.toFixed(2)}</span> bonus!
            </div>
          )}
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
        const finalResponse: 'yes' | 'no' | 'freeze' | 'na' = isNo && popupFreeze ? 'freeze' : pendingResponse
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
