import { BADGE_CONFIG, BADGE_MILESTONES, getStreakBadge, getStreakMultiplier, type AppConfig } from './types'
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
}

export type NewBadge = { habitId: string; habitName: string; milestone: number }

export type CelebrationContent = { kind: ContentKind; icon: string; text: string; sub?: string }

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
  ring: { habitName: string; streak: number; progress: number; next: number | null; reached: boolean; color: string }
  streaks: { name: string; streak: number; response: CelebrationHabit['response'] }[]
  content: CelebrationContent
}

function nextMilestone(streak: number): number | null {
  return BADGE_MILESTONES.find(m => m > streak) ?? null
}

function dayIndex(date: string): number {
  return Math.floor(new Date(date + 'T00:00:00Z').getTime() / 86_400_000)
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

  // The ring features the habit that just earned a badge, else the longest streak.
  const ringHabit = (topBadge && habits.find(h => h.id === topBadge.habitId))
    || habits.reduce<CelebrationHabit | null>((a, h) => (!a || h.streak > a.streak ? h : a), null)
  const ringStreak = ringHabit?.streak ?? 0
  const ringNext = nextMilestone(ringStreak)
  const ringPrev = [...BADGE_MILESTONES].reverse().find(m => m <= ringStreak) ?? 0
  const reached = ringPrev > 0 && ringStreak === ringPrev
  const ring = {
    habitName: ringHabit?.name ?? '',
    streak: ringStreak,
    next: ringNext,
    // Full on the day a badge is reached, rather than empty towards the next.
    progress: ringNext === null || reached ? 1 : (ringStreak - ringPrev) / (ringNext - ringPrev),
    reached,
    color: getStreakBadge(ringStreak)?.color ?? '#34d399',
  }

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
      const q = QUOTES[dayIndex(date) % QUOTES.length]
      return { kind: 'quote', icon: '“', text: q.text, sub: q.author }
    },
  }

  let content: CelebrationContent | null = null
  // Big moments override the daily rotation.
  if (topBadge) {
    const h = habits.find(x => x.id === topBadge.habitId)
    if (h?.description?.trim()) content = { kind: 'why', icon: '💭', text: h.description.trim(), sub: `Why: ${h.name}` }
  }
  if (!content && badgeNear && badgeNear.days <= NEAR_DAYS) content = builders.badge()
  if (!content && rewardNear?.days != null && rewardNear.days <= NEAR_DAYS) content = builders.reward()
  if (!content) {
    const cycle: ContentKind[] = ['reward', 'badge', 'why', 'quote']
    const start = dayIndex(date) % cycle.length
    for (let i = 0; i < cycle.length && !content; i++) content = builders[cycle[(start + i) % cycle.length]]()
  }

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
    ring,
    streaks: habits.filter(h => h.response !== 'na').map(h => ({ name: h.name, streak: h.streak, response: h.response })),
    content: content ?? builders.quote()!,
  }
}
