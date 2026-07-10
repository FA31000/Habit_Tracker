export type MultiQuestion = { type: 'multi'; label: string; options: string[] }
export type NumberQuestion = { type: 'number'; label: string; unit: string }
export type PopupQuestion = MultiQuestion | NumberQuestion
export type HabitPopupConfig = { trigger: 'yes' | 'no'; questions: PopupQuestion[] }
export type PopupAnswers = Record<string, string[] | string>

export type Habit = {
  id: string
  user_id: string
  name: string
  description: string | null
  dollar_value: number
  is_active: boolean
  allowed_no_days_per_week: number
  created_at: string
  question_config: HabitPopupConfig | null
}

export type Checkin = {
  id: string
  habit_id: string
  user_id: string
  date: string
  response: 'yes' | 'no' | 'freeze'
  answers: PopupAnswers | null
}

export type Streak = {
  id: string
  habit_id: string
  user_id: string
  current_streak: number
  longest_streak: number
  updated_at: string
}

export type Badge = {
  id: string
  habit_id: string
  user_id: string
  milestone_days: number
  earned_at: string
}

export type WishlistItem = {
  id: string
  user_id: string
  name: string
  price: number
  url: string | null
  redeemed: boolean
  redeemed_at: string | null
}

export type Feedback = {
  id: string
  user_id: string
  user_email: string | null
  message: string
  done: boolean
  created_at: string
}

export const BADGE_MILESTONES = [7, 14, 30, 90, 180, 365]

export const BADGE_CONFIG: Record<number, { label: string; color: string; emoji: string }> = {
  7:   { label: '7-day',   color: '#9CA3AF', emoji: '⚫' },
  14:  { label: '14-day',  color: '#92400E', emoji: '🟤' },
  30:  { label: '30-day',  color: '#9CA3AF', emoji: '⚪' },
  90:  { label: '90-day',  color: '#D97706', emoji: '🟡' },
  180: { label: '180-day', color: '#CBD5E1', emoji: '🩶' },
  365: { label: '365-day', color: '#F59E0B', emoji: '🏆' },
}

export function getStreakBadge(streak: number): { label: string; color: string; emoji: string } | null {
  const earned = BADGE_MILESTONES.filter(m => streak >= m)
  if (earned.length === 0) return null
  return BADGE_CONFIG[earned[earned.length - 1]]
}

export type AppConfig = {
  badgeMultipliers: Record<number, number>
  currencySymbol: string
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  badgeMultipliers: { 7: 1.5, 14: 1.75, 30: 2, 90: 2.5, 180: 3, 365: 4 },
  currencySymbol: 'S$',
}

export function normalizeAppConfig(raw: unknown): AppConfig {
  const parsed = (raw ?? {}) as Partial<AppConfig>
  return {
    badgeMultipliers: { ...DEFAULT_APP_CONFIG.badgeMultipliers, ...(parsed.badgeMultipliers ?? {}) },
    currencySymbol: parsed.currencySymbol ?? DEFAULT_APP_CONFIG.currencySymbol,
  }
}

export function loadAppConfig(): AppConfig {
  if (typeof window === 'undefined') return DEFAULT_APP_CONFIG
  try {
    const stored = localStorage.getItem('app_config')
    if (!stored) return DEFAULT_APP_CONFIG
    return normalizeAppConfig(JSON.parse(stored))
  } catch { return DEFAULT_APP_CONFIG }
}

export function getStreakMultiplier(streak: number, config?: AppConfig): number {
  const c = config ?? DEFAULT_APP_CONFIG
  for (let i = BADGE_MILESTONES.length - 1; i >= 0; i--) {
    const m = BADGE_MILESTONES[i]
    if (streak >= m) return c.badgeMultipliers[m] ?? 1
  }
  return 1
}
