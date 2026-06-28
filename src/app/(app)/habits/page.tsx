'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Habit } from '@/lib/types'
import HabitForm from '@/components/HabitForm'
import { applyStoredOrder, saveOrder } from '@/lib/habitOrder'

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const dragIndex = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  async function loadHabits() {
    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data } = await supabase.auth.signInAnonymously()
      user = data.user
    }
    if (!user) return
    const { data } = await supabase.from('habits').select('*').order('created_at', { ascending: true })
    setHabits(applyStoredOrder(data ?? []))
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

  // Mouse drag handlers
  function onDragStart(index: number) {
    dragIndex.current = index
    setDraggingIndex(index)
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    const from = dragIndex.current
    if (from === null || from === index) return
    setHabits(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(index, 0, item)
      dragIndex.current = index
      setDraggingIndex(index)
      return next
    })
  }

  function onDragEnd() {
    dragIndex.current = null
    setDraggingIndex(null)
    setHabits(prev => { saveOrder(prev); return prev })
  }

  // Touch drag handlers
  function onTouchStart(index: number) {
    dragIndex.current = index
    setDraggingIndex(index)
  }

  function onTouchEnd() {
    dragIndex.current = null
    setDraggingIndex(null)
    setHabits(prev => { saveOrder(prev); return prev })
  }

  // Register non-passive touchmove so preventDefault() actually works
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    function handleTouchMove(e: TouchEvent) {
      if (dragIndex.current === null) return
      e.preventDefault()
      const touch = e.touches[0]
      const children = Array.from(el!.children) as HTMLElement[]
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect()
        if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          const from = dragIndex.current!
          if (i !== from) {
            setHabits(prev => {
              const next = [...prev]
              const [item] = next.splice(from, 1)
              next.splice(i, 0, item)
              dragIndex.current = i
              setDraggingIndex(i)
              return next
            })
          }
          break
        }
      }
    }
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', handleTouchMove)
  }, [loading])

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 mt-2">
        <p className="text-sm text-gray-500">{habits.filter(h => h.is_active).length} active habits</p>
        <button
          onClick={() => { setEditingHabit(null); setShowForm(true) }}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold shadow-sm"
        >
          + Add
        </button>
      </div>

      {habits.length === 0 && (
        <p className="text-gray-400 text-center mt-12 text-sm">No habits yet. Add your first one!</p>
      )}

      <div className="space-y-3" ref={listRef}>
        {habits.map((habit, index) => (
          <div
            key={habit.id}
            draggable
            onDragStart={() => onDragStart(index)}
            onDragOver={e => onDragOver(e, index)}
            onDragEnd={onDragEnd}
            onTouchStart={() => onTouchStart(index)}
            onTouchEnd={onTouchEnd}
            className={`bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5 cursor-grab active:cursor-grabbing transition-opacity ${!habit.is_active ? 'opacity-50' : ''} ${draggingIndex === index ? 'ring-2 ring-emerald-400' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <span className="text-gray-300 text-base mt-0.5 select-none">⠿</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 leading-snug">{habit.name}</p>
                  {habit.description && (
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">{habit.description}</p>
                  )}
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    <span>S${habit.dollar_value.toFixed(2)}/day</span>
                    {habit.allowed_no_days_per_week > 0 && (
                      <span>{habit.allowed_no_days_per_week} skip{habit.allowed_no_days_per_week > 1 ? 's' : ''}/week ok</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => toggleActive(habit)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium ${habit.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                >
                  {habit.is_active ? 'On' : 'Off'}
                </button>
                <button
                  onClick={() => { setEditingHabit(habit); setShowForm(true) }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteHabit(habit.id)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-500 font-medium"
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
