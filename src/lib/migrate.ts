import type { HabitPopupConfig, PopupAnswers } from '@/lib/types'
import type { createClient } from '@/lib/supabase/client'

type SupabaseClient = ReturnType<typeof createClient>

const MIGRATION_FLAG = 'migrated_to_supabase_v1'

// One-time migration of popup data that used to live in localStorage into Supabase.
// - habit_popup_config  -> habits.question_config
// - habit_popup_answers -> checkins.answers
// - reading_minutes / exercise_data (legacy) -> checkins.answers
// Runs once per browser; safe to call on every page load (guarded by a flag).
// Returns true only when it actually migrated something, so callers can skip a
// reload on the common no-op path.
export async function migrateLocalDataToSupabase(supabase: SupabaseClient): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (localStorage.getItem(MIGRATION_FLAG)) return false

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const parse = <T,>(key: string): T => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : ({} as T) }
    catch { return {} as T }
  }
  const config = parse<Record<string, HabitPopupConfig>>('habit_popup_config')
  const answers = parse<Record<string, PopupAnswers>>('habit_popup_answers')
  const readingMinutes = parse<Record<string, number>>('reading_minutes')
  const exerciseData = parse<Record<string, { weight?: number; types?: string[] }>>('exercise_data')

  const { data: habits } = await supabase.from('habits').select('id, name, question_config').eq('user_id', user.id)

  // Migrate question config into the habits table (only where not already set).
  let changed = false
  const resolved: Record<string, HabitPopupConfig | null> = {}
  for (const h of habits ?? []) {
    if (h.question_config) { resolved[h.id] = h.question_config; continue }
    const local = config[h.id] ?? null
    resolved[h.id] = local
    if (config[h.id]) {
      await supabase.from('habits').update({ question_config: config[h.id] }).eq('id', h.id)
      changed = true
    }
  }

  // Migrate popup answers into the checkins table (only where not already set).
  const { data: checkins } = await supabase.from('checkins').select('id, habit_id, date, answers').eq('user_id', user.id)
  for (const c of checkins ?? []) {
    if (c.answers) continue
    const key = c.habit_id + '_' + c.date
    let built: PopupAnswers | null = answers[key] ?? null

    if (!built) {
      const cfg = resolved[c.habit_id]
      const entry: PopupAnswers = {}
      if (cfg) {
        if (readingMinutes[key] !== undefined) {
          const q = cfg.questions.find(q => q.type === 'number' && q.label.toLowerCase().includes('min'))
          if (q) entry[q.label] = String(readingMinutes[key])
        }
        const ex = exerciseData[key]
        if (ex) {
          if (ex.weight !== undefined) {
            const q = cfg.questions.find(q => q.type === 'number' && q.label.toLowerCase().includes('weight'))
            if (q) entry[q.label] = String(ex.weight)
          }
          if (Array.isArray(ex.types)) {
            const q = cfg.questions.find(q => q.type === 'multi')
            if (q) entry[q.label] = ex.types
          }
        }
      }
      if (Object.keys(entry).length > 0) built = entry
    }

    if (built) {
      await supabase.from('checkins').update({ answers: built }).eq('id', c.id)
      changed = true
    }
  }

  localStorage.setItem(MIGRATION_FLAG, '1')
  return changed
}
