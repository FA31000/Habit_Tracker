'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BADGE_CONFIG, BADGE_MILESTONES, getStreakBadge } from '@/lib/types'

type HabitView = {
  id: string
  name: string
  currentStreak: number
  longestStreak: number
  earnedBadges: number[]
}

export default function FriendProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = createClient()
  const [id, setId] = useState<string>('')
  const [name, setName] = useState<string | null>(null)
  const [habits, setHabits] = useState<HabitView[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { params.then(p => setId(p.id)) }, [params])

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', id).single()
      setName(profile?.display_name ?? null)

      const [{ data: habitsData }, { data: streaks }, { data: badges }] = await Promise.all([
        supabase.from('public_habits').select('id, name').eq('user_id', id).eq('is_active', true).order('created_at', { ascending: true }),
        supabase.from('streaks').select('habit_id, current_streak, longest_streak').eq('user_id', id),
        supabase.from('badges').select('habit_id, milestone_days').eq('user_id', id),
      ])

      const streakMap = new Map((streaks ?? []).map(s => [s.habit_id, s]))
      const badgeMap = new Map<string, number[]>()
      ;(badges ?? []).forEach(b => {
        if (!badgeMap.has(b.habit_id)) badgeMap.set(b.habit_id, [])
        badgeMap.get(b.habit_id)!.push(b.milestone_days)
      })

      setHabits((habitsData ?? []).map(h => ({
        id: h.id,
        name: h.name,
        currentStreak: streakMap.get(h.id)?.current_streak ?? 0,
        longestStreak: streakMap.get(h.id)?.longest_streak ?? 0,
        earnedBadges: (badgeMap.get(h.id) ?? []).sort((a, b) => a - b),
      })))
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  if (!name) return (
    <div className="p-6 text-center">
      <p className="text-gray-500">This person was not found.</p>
      <Link href="/friends" className="text-emerald-700 text-sm font-medium mt-2 inline-block">← Back to Friends</Link>
    </div>
  )

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">{name}</h1>
        <Link href="/friends" className="text-emerald-700 text-sm font-medium">← Friends</Link>
      </div>

      {habits.length === 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-black/5 text-center">
          <p className="text-gray-400 text-sm">No active habits yet.</p>
        </div>
      )}

      {habits.map(h => {
        const topBadge = getStreakBadge(h.currentStreak)
        return (
          <div key={h.id} className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900 flex-1 pr-2">{h.name}</p>
              {topBadge && <span className="text-xl">{topBadge.emoji}</span>}
            </div>
            <div className="flex gap-4 mb-3">
              <div className="text-center">
                <p className="text-gray-900 font-bold text-lg">{h.currentStreak}</p>
                <p className="text-xs text-gray-400">Streak</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 font-bold text-lg">{h.longestStreak}</p>
                <p className="text-xs text-gray-400">Best</p>
              </div>
            </div>
            <div className="flex gap-2">
              {BADGE_MILESTONES.map(m => {
                const cfg = BADGE_CONFIG[m]
                const earned = h.earnedBadges.includes(m)
                return (
                  <div key={m} title={`${m}-day badge`}
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
  )
}
