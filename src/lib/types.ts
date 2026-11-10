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
  start_date: string | null
  question_config: HabitPopupConfig | null
  sort_order: number | null
}

// Whether a habit applies on a date (it has started by then).
export function habitStarted(habit: { start_date?: string | null }, date: string): boolean {
  return !habit.start_date || habit.start_date <= date
}

export type Checkin = {
  id: string
  habit_id: string
  user_id: string
  date: string
  response: 'yes' | 'no' | 'freeze' | 'na'
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
  sort_order: number | null
}

export type Credit = {
  id: string
  user_id: string
  description: string
  amount: number
  date: string
  created_at: string
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

export type BadgeStyle = {
  label: string
  color: string // disc fill, white (pale mint) to dark green
  text: string  // day-count colour inside the disc
  ring: string  // outline, so the pale tiers still show on white
}

// Tailwind green scale, kept apart from the app's emerald accent. 365 is the
// trophy tier: darkest green with a gold ring.
export const BADGE_CONFIG: Record<number, BadgeStyle> = {
  7:   { label: '7-day',   color: '#F0FDF4', text: '#166534', ring: '#86EFAC' },
  14:  { label: '14-day',  color: '#BBF7D0', text: '#14532D', ring: '#4ADE80' },
  30:  { label: '30-day',  color: '#4ADE80', text: '#14532D', ring: '#22C55E' },
  90:  { label: '90-day',  color: '#16A34A', text: '#FFFFFF', ring: '#15803D' },
  180: { label: '180-day', color: '#166534', text: '#FFFFFF', ring: '#14532D' },
  365: { label: '365-day', color: '#14532D', text: '#FFFFFF', ring: '#F59E0B' },
}

export function getStreakBadge(streak: number): BadgeStyle | null {
  const earned = BADGE_MILESTONES.filter(m => streak >= m)
  if (earned.length === 0) return null
  return BADGE_CONFIG[earned[earned.length - 1]]
}

export type AppConfig = {
  badgeMultipliers: Record<number, number>
  currencySymbol: string
  weeklyNoFreezeBonus: number
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  badgeMultipliers: { 7: 1.5, 14: 1.75, 30: 2, 90: 2.5, 180: 3, 365: 4 },
  currencySymbol: 'S$',
  weeklyNoFreezeBonus: 10,
}

export function normalizeAppConfig(raw: unknown): AppConfig {
  const parsed = (raw ?? {}) as Partial<AppConfig>
  return {
    badgeMultipliers: { ...DEFAULT_APP_CONFIG.badgeMultipliers, ...(parsed.badgeMultipliers ?? {}) },
    currencySymbol: parsed.currencySymbol ?? DEFAULT_APP_CONFIG.currencySymbol,
    weeklyNoFreezeBonus: parsed.weeklyNoFreezeBonus ?? DEFAULT_APP_CONFIG.weeklyNoFreezeBonus,
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
