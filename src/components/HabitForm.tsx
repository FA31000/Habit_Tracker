'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Habit } from '@/lib/types'

type Props = {
  habit: Habit | null
  onClose: () => void
  onSaved: () => void
}

export default function HabitForm({ habit, onClose, onSaved }: Props) {
  const [name, setName] = useState(habit?.name ?? '')
  const [dollarValue, setDollarValue] = useState(habit?.dollar_value?.toString() ?? '1.00')
  const [allowedNoDays, setAllowedNoDays] = useState(habit?.allowed_no_days_per_week?.toString() ?? '0')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      name: name.trim(),
      dollar_value: parseFloat(dollarValue) || 1,
      allowed_no_days_per_week: parseInt(allowedNoDays) || 0,
    }

    if (habit) {
      await supabase.from('habits').update(payload).eq('id', habit.id)
    } else {
      await supabase.from('habits').insert({ ...payload, user_id: user.id })
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-t-3xl w-full max-w-lg p-6 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-5">{habit ? 'Edit Habit' : 'New Habit'}</h2>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Habit question</label>
            <input
              type="text"
              placeholder="e.g. Did I go for a run?"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:outline-none focus:border-indigo-500 text-base"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Reward per day (S$)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="1.00"
              value={dollarValue}
              onChange={e => setDollarValue(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:outline-none focus:border-indigo-500 text-base"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Allowed "No" days per week (streak still counts)
            </label>
            <select
              value={allowedNoDays}
              onChange={e => setAllowedNoDays(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-indigo-500 text-base"
            >
              {[0, 1, 2, 3, 4, 5, 6].map(n => (
                <option key={n} value={n}>{n} day{n !== 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
