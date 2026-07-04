import type { HabitPopupConfig } from '@/lib/types'

export const DEFAULT_EXERCISE_CONFIG: HabitPopupConfig = {
  trigger: 'yes',
  questions: [
    { type: 'multi', label: 'What did you do?', options: ['Running', 'Swimming', 'Biking', 'Resistance', 'Yoga', 'Other'] },
    { type: 'number', label: 'Weight', unit: 'kg' },
  ],
}
export const DEFAULT_READING_CONFIG: HabitPopupConfig = {
  trigger: 'yes',
  questions: [{ type: 'number', label: 'Minutes read', unit: 'min' }],
}
export const DEFAULT_EATING_CONFIG: HabitPopupConfig = {
  trigger: 'no',
  questions: [{ type: 'multi', label: 'Why not?', options: ['Sugar', 'Alcohol', 'Carbs at dinner', 'Other'] }],
}

// Built-in default question config for a habit, based on its name.
// Used as a fallback when the habit has no saved question_config.
export function defaultConfigForName(name: string): HabitPopupConfig | null {
  const n = name.toLowerCase()
  if (n.includes('exercise') || n.includes('workout') || n.includes('gym')) return DEFAULT_EXERCISE_CONFIG
  if (n.includes('read')) return DEFAULT_READING_CONFIG
  if (n.includes('eat') || n.includes('healthy')) return DEFAULT_EATING_CONFIG
  return null
}
