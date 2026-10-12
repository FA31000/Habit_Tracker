import type { createClient } from '@/lib/supabase/client'
import { addDays, todayDate } from '@/lib/streak'

type SupabaseClient = ReturnType<typeof createClient>

// Auto-No: every blank day before today, from each active habit's first
// check-in onwards, is saved as a "no". Existing answers are never overwritten.
export async function fillMissedDays(supabase: SupabaseClient, userId: string): Promise<void> {
  const [{ data: habits }, { data: checkins }] = await Promise.all([
    supabase.from('habits').select('id').eq('user_id', userId).eq('is_active', true),
    supabase.from('checkins').select('habit_id, date').eq('user_id', userId),
  ])

  const datesByHabit: Record<string, Set<string>> = {}
  for (const c of checkins ?? []) {
    if (!datesByHabit[c.habit_id]) datesByHabit[c.habit_id] = new Set()
    datesByHabit[c.habit_id].add(c.date)
  }

  const today = todayDate()
  const rows: { habit_id: string; user_id: string; date: string; response: 'no' }[] = []
  for (const h of habits ?? []) {
    const dates = datesByHabit[h.id]
    if (!dates) continue
    const first = [...dates].sort()[0]
    for (let day = first; day < today; day = addDays(day, 1)) {
      if (!dates.has(day)) rows.push({ habit_id: h.id, user_id: userId, date: day, response: 'no' })
    }
  }

  if (rows.length > 0) {
    await supabase.from('checkins').upsert(rows, { onConflict: 'habit_id,date', ignoreDuplicates: true })
  }
}
