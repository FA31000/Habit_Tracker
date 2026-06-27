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
  const [description, setDescription] = useState(habit?.description ?? '')
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
      description: description.trim() || null,
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center pb-16" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-10 shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-5">{habit ? 'Edit Habit' : 'New Habit'}</h2>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">Habit question</label>
            <input
              type="text"
              placeholder="e.g. Did I go for a run?"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">Description (optional)</label>
            <textarea
              placeholder="e.g. Why this habit matters to me..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">Reward per day (S$)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="1.00"
              value={dollarValue}
              onChange={e => setDollarValue(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">
              Allowed &quot;No&quot; days per week (streak still counts)
            </label>
            <select
              value={allowedNoDays}
              onChange={e => setAllowedNoDays(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
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
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
