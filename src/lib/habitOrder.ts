import type { createClient } from './supabase/client'

type Supabase = ReturnType<typeof createClient>

// Legacy: the order used to live here, per browser. It now lives on the account
// in habits.sort_order. Only still read for the one-time migration.
const ORDER_KEY = 'habit_order'

// Writes the list's positions back to the account, so the order is the same on
// every device.
export async function persistOrder(supabase: Supabase, ordered: { id: string }[]) {
  await Promise.all(ordered.map((habit, i) =>
    supabase.from('habits').update({ sort_order: i }).eq('id', habit.id)
  ))
}

// One-time lift of the old browser-only order onto the account. Skipped when any
// habit already has a position, so an order set on another device always wins.
// Reads all of the user's habits itself, since callers may only load a subset.
export async function migrateLocalOrder(supabase: Supabase, userId: string) {
  let raw: string | null = null
  try { raw = localStorage.getItem(ORDER_KEY) } catch { return }
  if (!raw) return
  let order: string[] = []
  try { order = JSON.parse(raw) } catch { order = [] }

  const { data: habits, error } = await supabase.from('habits')
    .select('id, sort_order').eq('user_id', userId).order('created_at', { ascending: true })
  // Keep the key if the read failed (e.g. column not added yet), to retry later.
  if (error || !habits) return
  try { localStorage.removeItem(ORDER_KEY) } catch {}
  if (!order.length || habits.some(h => h.sort_order !== null)) return

  const ids = new Set(habits.map(h => h.id))
  const sorted = [
    ...order.filter(id => ids.has(id)).map(id => ({ id })),
    ...habits.filter(h => !order.includes(h.id)),
  ]
  await persistOrder(supabase, sorted)
}
