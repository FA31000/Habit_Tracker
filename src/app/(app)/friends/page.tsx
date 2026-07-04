'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BADGE_CONFIG } from '@/lib/types'

type BadgeItem = {
  kind: 'badge'
  badgeId: string
  ownerId: string
  ownerName: string
  habitName: string
  milestone: number
  sortTs: string
  earnedAt: string
  thumbs: { userId: string; name: string }[]
  comments: { id: string; userId: string; name: string; body: string; createdAt: string }[]
}

type PerfectItem = {
  kind: 'perfect'
  ownerId: string
  ownerName: string
  sortTs: string
  date: string
}

type FeedItem = BadgeItem | PerfectItem

export default function FriendsPage() {
  const supabase = createClient()
  const [me, setMe] = useState<string | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [directory, setDirectory] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setMe(user?.id ?? null)

    const [{ data: profiles }, { data: badges }, { data: habits }, { data: thumbs }, { data: comments }, { data: perfectDays }] =
      await Promise.all([
        supabase.from('profiles').select('id, display_name'),
        supabase.from('badges').select('id, habit_id, user_id, milestone_days, earned_at').order('earned_at', { ascending: false }),
        supabase.from('public_habits').select('id, name'),
        supabase.from('badge_thumbs').select('badge_id, user_id'),
        supabase.from('badge_comments').select('id, badge_id, user_id, body, created_at').order('created_at', { ascending: true }),
        supabase.from('perfect_days').select('user_id, date, created_at'),
      ])

    const nameOf = new Map((profiles ?? []).filter(p => p.display_name).map(p => [p.id, p.display_name as string]))
    const habitName = new Map((habits ?? []).map(h => [h.id, h.name]))

    setDirectory(
      (profiles ?? [])
        .filter(p => p.display_name)
        .map(p => ({ id: p.id, name: p.display_name as string }))
        .sort((a, b) => a.name.localeCompare(b.name))
    )

    const badgeItems: BadgeItem[] = (badges ?? [])
      .filter(b => nameOf.has(b.user_id))
      .map(b => ({
        kind: 'badge',
        badgeId: b.id,
        ownerId: b.user_id,
        ownerName: nameOf.get(b.user_id)!,
        habitName: habitName.get(b.habit_id) ?? 'a habit',
        milestone: b.milestone_days,
        sortTs: b.earned_at,
        earnedAt: b.earned_at,
        thumbs: (thumbs ?? [])
          .filter(t => t.badge_id === b.id)
          .map(t => ({ userId: t.user_id, name: nameOf.get(t.user_id) ?? 'Someone' })),
        comments: (comments ?? [])
          .filter(c => c.badge_id === b.id)
          .map(c => ({ id: c.id, userId: c.user_id, name: nameOf.get(c.user_id) ?? 'Someone', body: c.body, createdAt: c.created_at })),
      }))

    const perfectItems: PerfectItem[] = (perfectDays ?? [])
      .filter(p => nameOf.has(p.user_id))
      .map(p => ({
        kind: 'perfect',
        ownerId: p.user_id,
        ownerName: nameOf.get(p.user_id)!,
        sortTs: p.created_at,
        date: p.date,
      }))

    const items: FeedItem[] = [...badgeItems, ...perfectItems].sort((a, b) => b.sortTs.localeCompare(a.sortTs))

    setFeed(items)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleThumb(item: BadgeItem) {
    if (!me || item.ownerId === me) return
    const mine = item.thumbs.some(t => t.userId === me)
    if (mine) {
      await supabase.from('badge_thumbs').delete().eq('badge_id', item.badgeId).eq('user_id', me)
    } else {
      await supabase.from('badge_thumbs').insert({ badge_id: item.badgeId, user_id: me })
    }
    load()
  }

  async function addComment(item: BadgeItem) {
    const body = (draft[item.badgeId] ?? '').trim()
    if (!me || item.ownerId === me || !body) return
    await supabase.from('badge_comments').insert({ badge_id: item.badgeId, user_id: me, body })
    setDraft(d => ({ ...d, [item.badgeId]: '' }))
    load()
  }

  async function deleteComment(commentId: string) {
    if (!me) return
    await supabase.from('badge_comments').delete().eq('id', commentId)
    load()
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  return (
    <div className="p-4 space-y-4">
      {/* Directory */}
      <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold text-gray-900 mb-3">Friends</h2>
        <div className="flex flex-wrap gap-2">
          {directory.map(f => (
            <Link
              key={f.id}
              href={`/friends/${f.id}`}
              className="px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700"
            >
              {f.name}{f.id === me ? ' (you)' : ''}
            </Link>
          ))}
          {directory.length === 0 && <p className="text-sm text-gray-400">No friends yet.</p>}
        </div>
      </div>

      {/* Feed */}
      {feed.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-black/5 text-center">
          <p className="text-gray-400 text-sm">Nothing here yet. Keep your streaks going!</p>
        </div>
      ) : (
        feed.map(item => {
          if (item.kind === 'perfect') {
            return (
              <div key={`perfect-${item.ownerId}-${item.date}`} className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🌟</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">
                      <Link href={`/friends/${item.ownerId}`} className="font-semibold text-emerald-700">
                        {item.ownerName}
                      </Link>{' '}
                      had a <span className="font-semibold">perfect day</span> — every habit done!
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(item.date + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
            )
          }

          const cfg = BADGE_CONFIG[item.milestone]
          const isMine = item.ownerId === me
          const iThumbed = me ? item.thumbs.some(t => t.userId === me) : false
          return (
            <div key={item.badgeId} className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{cfg?.emoji ?? '🏅'}</span>
                <div className="flex-1">
                  <p className="text-sm text-gray-900">
                    <Link href={`/friends/${item.ownerId}`} className="font-semibold text-emerald-700">
                      {item.ownerName}
                    </Link>{' '}
                    earned the <span className="font-semibold">{cfg?.label ?? `${item.milestone}-day`} badge</span> on{' '}
                    <span className="font-medium">&ldquo;{item.habitName}&rdquo;</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(item.earnedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Thumbs-up */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => toggleThumb(item)}
                  disabled={isMine}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                    isMine
                      ? 'bg-gray-50 text-gray-300 cursor-default'
                      : iThumbed
                        ? 'bg-emerald-700 text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  👍 {item.thumbs.length > 0 ? item.thumbs.length : ''}
                </button>
                {item.thumbs.length > 0 && (
                  <span className="text-xs text-gray-400">
                    {item.thumbs.map(t => t.name).join(', ')}
                  </span>
                )}
              </div>

              {/* Comments */}
              {item.comments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {item.comments.map(c => (
                    <div key={c.id} className="flex items-start gap-2 text-sm">
                      <span className="font-semibold text-gray-700">{c.name}</span>
                      <span className="text-gray-600 flex-1">{c.body}</span>
                      {c.userId === me && (
                        <button onClick={() => deleteComment(c.id)} className="text-xs text-gray-300 hover:text-red-500">
                          delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment (not on your own badge) */}
              {!isMine && (
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    maxLength={280}
                    value={draft[item.badgeId] ?? ''}
                    onChange={e => setDraft(d => ({ ...d, [item.badgeId]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addComment(item) }}
                    placeholder="Leave a comment..."
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => addComment(item)}
                    disabled={!(draft[item.badgeId] ?? '').trim()}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm shadow-sm disabled:opacity-50"
                  >
                    Post
                  </button>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
