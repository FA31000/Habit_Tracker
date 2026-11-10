import { BADGE_CONFIG } from '@/lib/types'

const SIZES = {
  sm: 'h-5 w-5 text-[8px] border',
  md: 'h-7 w-7 text-[10px] border-2',
  lg: 'h-9 w-9 text-xs border-2',
} as const

// A disc in the tier's green with the day count inside. Replaces the old emoji.
export default function StreakBadge({ milestone, size = 'md', className = '' }: { milestone: number; size?: keyof typeof SIZES; className?: string }) {
  const cfg = BADGE_CONFIG[milestone]
  if (!cfg) return null
  return (
    <span
      title={`${cfg.label} badge`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none tabular-nums align-middle ${SIZES[size]} ${className}`}
      style={{ backgroundColor: cfg.color, color: cfg.text, borderColor: cfg.ring }}
    >
      {milestone}
    </span>
  )
}
