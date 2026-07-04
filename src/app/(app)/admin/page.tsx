'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'
import type { Feedback } from '@/lib/types'

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [items, setItems] = useState<Feedback[]>([])
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!isAdmin(user?.email)) { setAllowed(false); return }
    setAllowed(true)
    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
    setItems(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleDone(item: Feedback) {
    await supabase.from('feedback').update({ done: !item.done }).eq('id', item.id)
    setItems(items.map(i => i.id === item.id ? { ...i, done: !i.done } : i))
  }

  async function remove(item: Feedback) {
    if (!confirm('Delete this feedback?')) return
    await supabase.from('feedback').delete().eq('id', item.id)
    setItems(items.filter(i => i.id !== item.id))
  }

  if (allowed === null) return <div className="p-6 text-gray-400">Loading...</div>
  if (allowed === false) return <div className="p-6 text-gray-500">You don&apos;t have access to this page.</div>

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 mt-2">
        <h2 className="font-semibold text-gray-900">Feedback</h2>
        <span className="text-xs text-gray-400">{items.length} total</span>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 text-center">
          <p className="text-gray-400 text-sm">No feedback yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div
              key={item.id}
              className={`bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5 ${item.done ? 'opacity-60' : ''}`}
            >
              <p className={`text-sm text-gray-900 whitespace-pre-wrap ${item.done ? 'line-through' : ''}`}>
                {item.message}
              </p>
              <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                <span>{item.user_email ?? 'Anonymous'}</span>
                <span>
                  {new Date(item.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => toggleDone(item)}
                  className="flex-1 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-sm transition"
                >
                  {item.done ? '↩ Mark as not done' : '✓ Mark as done'}
                </button>
                <button
                  onClick={() => remove(item)}
                  className="flex-1 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-sm transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
