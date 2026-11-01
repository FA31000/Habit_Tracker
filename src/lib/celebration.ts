import { BADGE_CONFIG, BADGE_MILESTONES, getStreakMultiplier, type AppConfig } from './types'
import type { RewardTarget } from './moneySnapshot'
import { QUOTES } from './quotes'

// What the Save Check-In celebration shows. Built once from the saved day, then
// rendered by CelebrationOverlay.

// A badge or reward this many days away (or fewer) counts as "close": it takes
// the content slot and makes the celebration one step bigger.
export const NEAR_DAYS = 3

export type CelebrationTier = 'partial' | 'perfect' | 'milestone'
export type ContentKind = 'reward' | 'badge' | 'why' | 'quote'

export type CelebrationHabit = {
  id: string
  name: string
  description: string | null
  response: 'yes' | 'no' | 'freeze' | 'na' | undefined
  streak: number // current streak after the save
  streakBefore: number // streak before today's answer, to spot a break
}

export type NewBadge = { habitId: string; habitName: string; milestone: number }

export type CelebrationContent = { kind: ContentKind; icon: string; text: string; sub?: string }

export type CelebrationStreak = {
  name: string
  streak: number
  response: CelebrationHabit['response']
  broken: number | null // the streak today's No just reset, if any
  badgeToday: boolean // reached a badge milestone with today's answer
  near: { days: number; milestone: number } | null // within NEAR_DAYS of the next badge
}

export type Celebration = {
  tier: CelebrationTier
  near: boolean
  // 0 = partial (quiet, even when close), 1 = perfect, 2 = perfect and close
  // to a badge or reward, 3 = milestone.
  level: number
  yesCount: number
  applicableCount: number
  baseEarned: number // before the perfect-day ×2
  earned: number // what the day actually paid
  balanceBefore: number
  balanceAfter: number
  newBadges: NewBadge[]
  unlocked: RewardTarget[] // rewards this save made affordable
  accent: string // badge colour on milestone days
  streaks: CelebrationStreak[] // done first, then longest streak first
  nudge: CelebrationContent | null // badge / reward / "why" line
  quote: CelebrationContent // shown on every check-in
}

function nextMilestone(streak: number): number | null {
  return BADGE_MILESTONES.find(m => m > streak) ?? null
}

function dayIndex(date: string): number {
  return Math.floor(new Date(date + 'T00:00:00Z').getTime() / 86_400_000)
}

// Steps through the list by a stride coprime to its length, so every quote
// shows once per cycle but neighbours in the file (same author) aren't
// shown on back-to-back days.
function quoteIndex(day: number, len: number): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  let stride = 37
  while (gcd(stride, len) !== 1) stride++
  return (((day * stride) % len) + len) % len
}

function money(sym: string, v: number): string {
  return `${v < 0 ? '−' : ''}${sym}${Math.abs(v).toFixed(2)}`
}

// The habit closest to its next badge, among habits still counting a streak.
function closestBadge(habits: CelebrationHabit[]) {
  let best: { habit: CelebrationHabit; next: number; days: number } | null = null
  for (const h of habits) {
    if (h.streak === 0) continue
    const next = nextMilestone(h.streak)
    if (next === null) continue
    const days = next - h.streak
    if (!best || days < best.days) best = { habit: h, next, days }
  }
  return best
}

// The cheapest reward not yet affordable, and how many days away it is.
function nextReward(rewards: RewardTarget[], balance: number, rate: number) {
  const item = rewards.find(r => r.price > balance)
  if (!item) return null
  const gap = item.price - balance
  return { item, gap, days: rate > 0 ? Math.ceil(gap / rate) : null }
}

export function buildCelebration(args: {
  date: string
  habits: CelebrationHabit[]
  newBadges: NewBadge[]
  perfect: boolean
  earned: number
  balanceAfter: number
  rewards: RewardTarget[]
  ratePerDay: number
  cfg: AppConfig
}): Celebration {
  const { date, habits, newBadges, perfect, earned, balanceAfter, rewards, ratePerDay, cfg } = args
  const sym = cfg.currencySymbol
  const balanceBefore = balanceAfter - earned
  const unlocked = rewards.filter(r => r.price > balanceBefore && r.price <= balanceAfter)
  const badgeNear = closestBadge(habits)
  const rewardNear = nextReward(rewards, balanceAfter, ratePerDay)
  const near = (badgeNear !== null && badgeNear.days <= NEAR_DAYS) || (rewardNear?.days != null && rewardNear.days <= NEAR_DAYS)

  const tier: CelebrationTier = newBadges.length > 0 || unlocked.length > 0 ? 'milestone' : perfect ? 'perfect' : 'partial'
  const level = tier === 'milestone' ? 3 : tier === 'perfect' ? (near ? 2 : 1) : 0
  const topBadge = newBadges.reduce<NewBadge | null>((a, b) => (!a || b.milestone > a.milestone ? b : a), null)

  const builders: Record<ContentKind, () => CelebrationContent | null> = {
    reward: () => {
      if (rewards.length === 0) return null
      if (!rewardNear) {
        const top = rewards[rewards.length - 1]
        return { kind: 'reward', icon: '🎁', text: `You can already afford ${top.name}.`, sub: 'Every reward on your list is within reach.' }
      }
      const when = rewardNear.days === null ? '' : ` — about ${rewardNear.days} ${rewardNear.days === 1 ? 'day' : 'days'} at this pace`
      return { kind: 'reward', icon: '🎁', text: `${money(sym, rewardNear.gap)} to go for ${rewardNear.item.name}${when}.` }
    },
    badge: () => {
      if (!badgeNear) return null
      const b = BADGE_CONFIG[badgeNear.next]
      const mult = getStreakMultiplier(badgeNear.next, cfg)
      return {
        kind: 'badge',
        icon: b.emoji,
        text: `${badgeNear.days} ${badgeNear.days === 1 ? 'day' : 'days'} to your ${b.label} badge (${mult}×)`,
        sub: badgeNear.habit.name,
      }
    },
    why: () => {
      const withWhy = habits.filter(h => h.response === 'yes' && h.description?.trim())
      if (withWhy.length === 0) return null
      const h = withWhy[dayIndex(date) % withWhy.length]
      return { kind: 'why', icon: '💭', text: h.description!.trim(), sub: `Why: ${h.name}` }
    },
    quote: () => {
      const q = QUOTES[quoteIndex(dayIndex(date), QUOTES.length)]
      return { kind: 'quote', icon: '“', text: q.text, sub: q.author }
    },
  }
  const quote = builders.quote()!

  let content: CelebrationContent | null = null
  // Big moments override the daily rotation.
  if (topBadge) {
    const h = habits.find(x => x.id === topBadge.habitId)
    if (h?.description?.trim()) content = { kind: 'why', icon: '💭', text: h.description.trim(), sub: `Why: ${h.name}` }
  }
  if (!content && badgeNear && badgeNear.days <= NEAR_DAYS) content = builders.badge()
  if (!content && rewardNear?.days != null && rewardNear.days <= NEAR_DAYS) content = builders.reward()
  if (!content) {
    const cycle: ContentKind[] = ['reward', 'badge', 'why']
    const start = dayIndex(date) % cycle.length
    for (let i = 0; i < cycle.length && !content; i++) content = builders[cycle[(start + i) % cycle.length]]()
  }

  const done = (r: CelebrationHabit['response']) => (r === 'yes' ? 0 : 1)
  const streaks: CelebrationStreak[] = habits
    .filter(h => h.response !== 'na')
    .map(h => {
      const next = nextMilestone(h.streak)
      const days = next === null ? null : next - h.streak
      return {
        name: h.name,
        streak: h.streak,
        response: h.response,
        broken: h.response === 'no' && h.streakBefore > 0 && h.streak < h.streakBefore ? h.streakBefore : null,
        badgeToday: h.streak > h.streakBefore && BADGE_MILESTONES.includes(h.streak),
        near: h.streak > 0 && days !== null && days <= NEAR_DAYS ? { days, milestone: next! } : null,
      }
    })
    .sort((x, y) => done(x.response) - done(y.response) || y.streak - x.streak)

  const applicable = habits.filter(h => h.response && h.response !== 'na')
  return {
    tier,
    near,
    level,
    yesCount: applicable.filter(h => h.response === 'yes').length,
    applicableCount: applicable.length,
    baseEarned: perfect ? earned / 2 : earned,
    earned,
    balanceBefore,
    balanceAfter,
    newBadges,
    unlocked,
    accent: topBadge ? BADGE_CONFIG[topBadge.milestone].color : '#fbbf24',
    streaks,
    nudge: content,
    quote,
  }
}
