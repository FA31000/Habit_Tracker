'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BADGE_CONFIG, BADGE_MILESTONES, getStreakBadge } from '@/lib/types'

const EMOJIS = ['👍', '🔥', '💪', '❤️']

type HabitView = {
  id: string
  name: string
  currentStreak: number
  longestStreak: number
  earnedBadges: number[]
}

export default function PartnerPage({ params }: { params: Promise<{ token: string }> }) {
  const [habits, setHabits] = useState<HabitView[]>([])
  const [reacted, setReacted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [shareId, setShareId] = useState<string | null>(null)
  const [token, setToken] = useState<string>('')
  const supabase = createClient()

  useEffect(() => {
    params.then(p => setToken(p.token))
  }, [params])

  useEffect(() => {
    if (!token) return
    async function load() {
      const { data: link } = await supabase
        .from('share_links')
        .select('id, user_id')
        .eq('token', token)
        .single()

      if (!link) { setLoading(false); return }
      setShareId(link.id)

      const { data: habitsData } = await supabase
        .from('habits')
        .select('id, name')
        .eq('user_id', link.user_id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      const { data: streaks } = await supabase
        .from('streaks')
        .select('habit_id, current_streak, longest_streak')
        .eq('user_id', link.user_id)

      const { data: badges } = await supabase
        .from('badges')
        .select('habit_id, milestone_days')
        .eq('user_id', link.user_id)

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
  }, [token])

  async function react(emoji: string) {
    if (!shareId || reacted) return
    await supabase.from('reactions').insert({ share_link_id: shareId, emoji })
    setReacted(true)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">Loading...</div>
  )

  if (!shareId) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
      <div className="text-center">
        <div className="text-4xl mb-3">🔗</div>
        <p>This link is not valid.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-lg mx-auto">
      <div className="pt-6 mb-6 text-center">
        <div className="text-3xl mb-2">🏆</div>
        <h1 className="text-xl font-bold">Habit Progress</h1>
        <p className="text-gray-400 text-sm mt-1">Your partner&apos;s streak tracker</p>
      </div>

      <div className="space-y-3 mb-8">
        {habits.map(h => {
          const topBadge = getStreakBadge(h.currentStreak)
          return (
            <div key={h.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm font-medium flex-1 pr-2">{h.name}</p>
                {topBadge && <span className="text-xl">{topBadge.emoji}</span>}
              </div>

              <div className="flex gap-4 mb-3">
                <div className="text-center">
                  <p className="text-white font-bold text-lg">{h.currentStreak}</p>
                  <p className="text-xs text-gray-500">Streak</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 font-bold text-lg">{h.longestStreak}</p>
                  <p className="text-xs text-gray-500">Best</p>
                </div>
              </div>

              {/* Badge row */}
              <div className="flex gap-2">
                {BADGE_MILESTONES.map(m => {
                  const cfg = BADGE_CONFIG[m]
                  const earned = h.earnedBadges.includes(m)
                  return (
                    <div
                      key={m}
                      title={`${cfg.label} — ${m} days`}
                      className={`flex-1 text-center text-base rounded-lg py-1 ${earned ? 'opacity-100' : 'opacity-20 grayscale'}`}
                    >
                      {cfg.emoji}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* React section */}
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 text-center">
        {reacted ? (
          <p className="text-green-400 font-semibold">Reaction sent! 🎉</p>
        ) : (
          <>
            <p className="text-sm text-gray-300 mb-4">Send some encouragement</p>
            <div className="flex gap-4 justify-center">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => react(emoji)}
                  className="text-4xl hover:scale-125 active:scale-110 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
