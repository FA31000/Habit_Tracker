'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Habit } from '@/lib/types'
import HabitForm from '@/components/HabitForm'

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const supabase = createClient()

  async function loadHabits() {
    const { data } = await supabase
      .from('habits')
      .select('*')
      .order('created_at', { ascending: true })
    setHabits(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadHabits() }, [])

  async function deleteHabit(id: string) {
    if (!confirm('Delete this habit?')) return
    await supabase.from('habits').delete().eq('id', id)
    setHabits(h => h.filter(x => x.id !== id))
  }

  async function toggleActive(habit: Habit) {
    await supabase.from('habits').update({ is_active: !habit.is_active }).eq('id', habit.id)
    setHabits(h => h.map(x => x.id === habit.id ? { ...x, is_active: !x.is_active } : x))
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6 pt-4">
        <h1 className="text-xl font-bold">My Habits</h1>
        <button
          onClick={() => { setEditingHabit(null); setShowForm(true) }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold"
        >
          + Add
        </button>
      </div>

      {habits.length === 0 && (
        <p className="text-gray-500 text-center mt-12">No habits yet. Add your first one!</p>
      )}

      <div className="space-y-3">
        {habits.map(habit => (
          <div key={habit.id} className={`bg-gray-900 rounded-2xl p-4 border ${habit.is_active ? 'border-gray-800' : 'border-gray-800 opacity-50'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm leading-snug">{habit.name}</p>
                <div className="flex gap-3 mt-1 text-xs text-gray-400">
                  <span>S${habit.dollar_value.toFixed(2)}/day</span>
                  {habit.allowed_no_days_per_week > 0 && (
                    <span>{habit.allowed_no_days_per_week} skip{habit.allowed_no_days_per_week > 1 ? 's' : ''}/week ok</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => toggleActive(habit)}
                  className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-300"
                >
                  {habit.is_active ? 'On' : 'Off'}
                </button>
                <button
                  onClick={() => { setEditingHabit(habit); setShowForm(true) }}
                  className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-300"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteHabit(habit.id)}
                  className="text-xs px-2 py-1 rounded-lg bg-red-900/40 text-red-400"
                >
                  Del
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <HabitForm
          habit={editingHabit}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadHabits() }}
        />
      )}
    </div>
  )
}
