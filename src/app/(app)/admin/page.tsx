'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'
import { BADGE_CONFIG, BADGE_MILESTONES, DEFAULT_APP_CONFIG, type AppConfig, type Feedback } from '@/lib/types'
import { fetchAppConfig, saveAppConfig } from '@/lib/appConfig'

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [items, setItems] = useState<Feedback[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [configStatus, setConfigStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!isAdmin(user?.email)) { setAllowed(false); return }
    setAllowed(true)
    const [{ data }, cfg] = await Promise.all([
      supabase.from('feedback').select('*').order('created_at', { ascending: false }),
      fetchAppConfig(),
    ])
    setItems(data ?? [])
    setConfig(cfg)
  }, [])

  async function persistConfig(updated: AppConfig) {
    setConfig(updated)
    setConfigStatus('saving')
    const error = await saveAppConfig(updated)
    if (error) { setConfigStatus('error'); alert('Could not save: ' + error); return }
    setConfigStatus('saved')
    setTimeout(() => setConfigStatus('idle'), 2000)
  }

  function setMultiplier(milestone: number, raw: string) {
    if (!config) return
    const val = parseFloat(raw)
    if (isNaN(val)) return
    persistConfig({ ...config, badgeMultipliers: { ...config.badgeMultipliers, [milestone]: val } })
  }

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
      {/* Streak Bonuses */}
      <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 mb-4 mt-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Streak Bonuses</h2>
          {configStatus === 'saving' && <span className="text-xs text-gray-400">Saving...</span>}
          {configStatus === 'saved' && <span className="text-xs text-emerald-600">Saved ✓</span>}
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Points multiplier for each badge. Applies to everyone.
        </p>
        {config === null ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <>
            <div className="space-y-3">
              {BADGE_MILESTONES.map(m => (
                <div key={m} className="flex items-center gap-2">
                  <span className="text-base shrink-0">{BADGE_CONFIG[m].emoji}</span>
                  <span className="text-sm text-gray-600 shrink-0">After {m} days</span>
                  <input
                    type="number"
                    min="1"
                    step="0.25"
                    value={config.badgeMultipliers[m] ?? 1}
                    onChange={e => setMultiplier(m, e.target.value)}
                    className="w-16 ml-auto border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-600 shrink-0">×</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => persistConfig({ ...config, badgeMultipliers: { ...DEFAULT_APP_CONFIG.badgeMultipliers } })}
              className="mt-4 text-xs text-gray-400 underline"
            >
              Reset to defaults
            </button>
          </>
        )}
      </div>

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
