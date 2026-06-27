import type { Habit } from './types'

const ORDER_KEY = 'habit_order'

export function applyStoredOrder(habits: Habit[]): Habit[] {
  try {
    const stored: string[] = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]')
    if (stored.length === 0) return habits
    const map = new Map(habits.map(h => [h.id, h]))
    const ordered = stored.map(id => map.get(id)).filter(Boolean) as Habit[]
    const rest = habits.filter(h => !stored.includes(h.id))
    return [...ordered, ...rest]
  } catch {
    return habits
  }
}

export function saveOrder(habits: Habit[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(habits.map(h => h.id)))
}
