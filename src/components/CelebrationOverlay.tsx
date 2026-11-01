'use client'

import { useEffect, useState } from 'react'
import Confetti from '@/components/Confetti'
import { BADGE_CONFIG } from '@/lib/types'
import type { Celebration } from '@/lib/celebration'

// Timeline (ms from opening). The day's money counts up, a perfect day stamps
// "×2" and counts on to the doubled amount, then the balance rolls old → new,
// then the nudge line fades in. The quote shows early, alongside the count.
const EARN_START = 300
const EARN_MS = 1000
const DOUBLE_STAMP = 1500
const DOUBLE_MS = 600
const ROLL_MS = 1000
const QUOTE_AT = 700

function useCountUp(from: number, to: number, delay: number, duration: number): number {
  const [value, setValue] = useState(from)
  useEffect(() => {
    let raf = 0
    const begin = performance.now() + delay
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - begin) / duration))
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (to - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [from, to, delay, duration])
  return value
}

function useElapsed(ms: number): boolean {
  const [hit, setHit] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setHit(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return hit
}

function money(sym: string, v: number): string {
  return `${v < 0 ? '−' : ''}${sym}${Math.abs(v).toFixed(2)}`
}

const BACKGROUND: Record<Celebration['tier'], string> = {
  partial: 'from-slate-800 to-slate-900',
  perfect: 'from-emerald-700 to-emerald-950',
  milestone: 'from-amber-600 via-emerald-800 to-emerald-950',
}

export default function CelebrationOverlay({ data, symbol, onClose }: { data: Celebration; symbol: string; onClose: () => void }) {
  const perfect = data.tier !== 'partial' && data.earned > data.baseEarned
  const rollStart = perfect ? DOUBLE_STAMP + DOUBLE_MS + 200 : EARN_START + EARN_MS + 200
  const firstCount = useCountUp(0, data.baseEarned, EARN_START, EARN_MS)
  const doubled = useCountUp(data.baseEarned, data.earned, DOUBLE_STAMP + 100, DOUBLE_MS)
  const balance = useCountUp(data.balanceBefore, data.balanceAfter, rollStart, ROLL_MS)
  const showStamp = useElapsed(DOUBLE_STAMP)
  const earnedShown = perfect && showStamp ? doubled : firstCount
  const showContent = useElapsed(rollStart + ROLL_MS + 100)
  const showQuote = useElapsed(QUOTE_AT)
  const canClose = useElapsed(600)
  const [confettiOn, setConfettiOn] = useState(data.level > 0)

  const headline = data.tier === 'milestone'
    ? (data.newBadges.length > 0 ? 'New badge!' : 'Reward unlocked!')
    : data.tier === 'perfect' ? 'Perfect day!' : 'Day logged'
  const subline = perfect ? 'Every habit done — earnings doubled' : `${data.yesCount} of ${data.applicableCount} habits done`

  const confettiCount = [0, 90, 150, 220][data.level]
  const confettiColors = data.tier === 'milestone' ? [data.accent, '#fbbf24', '#fde68a', '#34d399', '#ffffff'] : undefined

  return (
    <div
      className={`fixed inset-0 z-[55] bg-gradient-to-b ${BACKGROUND[data.tier]} text-white flex flex-col items-center justify-center px-6 overflow-y-auto`}
      style={{ animation: 'fade-up 250ms ease-out' }}
      onClick={() => { if (canClose) onClose() }}
    >
      {confettiOn && confettiCount > 0 && (
        <Confetti count={confettiCount} colors={confettiColors} onDone={() => setConfettiOn(false)} />
      )}

      <div className="w-full max-w-sm flex flex-col items-center text-center py-10">
        {data.tier === 'milestone' && (
          <div className="flex flex-wrap justify-center gap-2 mb-3" style={{ animation: 'pop-in 600ms ease-out' }}>
            {data.newBadges.map(b => (
              <span key={b.habitId + b.milestone} className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
                {BADGE_CONFIG[b.milestone].emoji} {BADGE_CONFIG[b.milestone].label} · {b.habitName}
              </span>
            ))}
            {data.unlocked.map(r => (
              <span key={r.id} className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">🎁 {r.name} unlocked</span>
            ))}
          </div>
        )}

        <p className={`font-extrabold tracking-tight ${data.tier === 'partial' ? 'text-2xl' : 'text-3xl'}`} style={{ animation: 'pop-in 500ms ease-out' }}>{headline}</p>
        <p className="text-white/70 text-sm mt-1">{subline}</p>
        {data.near && data.tier !== 'milestone' && (
          <span className="mt-2 rounded-full bg-amber-400/20 text-amber-200 px-3 py-0.5 text-xs font-semibold" style={{ animation: 'glow-pulse 1.6s ease-in-out infinite' }}>
            Almost there
          </span>
        )}

        {/* Money */}
        <div className="mt-6">
          <p className="text-xs uppercase tracking-widest text-white/60">Earned today</p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="text-5xl font-extrabold tabular-nums">+{money(symbol, earnedShown)}</p>
            {perfect && showStamp && (
              <span className="rounded-lg bg-amber-400 text-emerald-950 px-2 py-0.5 text-lg font-black" style={{ animation: 'pop-in 400ms ease-out' }}>×2</span>
            )}
          </div>
          <p className="text-sm text-white/70 mt-3">
            Balance <span className={`font-bold tabular-nums ${balance < 0 ? 'text-red-300' : 'text-white'}`}>{money(symbol, balance)}</span>
          </p>
        </div>

        {/* Streaks per habit */}
        {data.streaks.length > 0 && (
          <div className="mt-7 w-full">
            <p className="text-xs uppercase tracking-widest text-white/60 mb-2">Streaks</p>
            <div className="flex flex-wrap justify-center gap-2">
              {data.streaks.map(s => {
                const label = s.name.replace(/^Did I /i, '').replace(/\?$/, '')
                const style = s.broken !== null
                  ? 'bg-red-500/15 text-red-200 ring-1 ring-red-400/40'
                  : s.badgeToday
                    ? 'bg-amber-400/25 text-amber-100 ring-1 ring-amber-300/60'
                    : s.near
                      ? 'bg-white/15 text-white ring-1 ring-amber-300/50'
                      : s.response === 'yes'
                        ? 'bg-white/15 text-white'
                        : 'bg-white/5 text-white/50'
                return (
                  <span key={s.name} className={`rounded-full px-3 py-1 text-sm ${style}`}>
                    {label} ·{' '}
                    {s.broken !== null
                      ? <span className="font-semibold tabular-nums"><s className="opacity-70">{s.broken}</s> → 0</span>
                      : <span className="font-semibold tabular-nums">{s.streak}</span>}
                    {s.near && s.broken === null && !s.badgeToday && (
                      <span className="ml-1 text-amber-200 text-xs">{s.near.days} to {s.near.milestone}</span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Quote — every check-in, shown early so it isn't missed */}
        {showQuote && (
          <figure className="mt-7 w-full px-2" style={{ animation: 'fade-up 500ms ease-out' }}>
            <blockquote className="text-lg leading-snug font-medium italic text-white/95">“{data.quote.text}”</blockquote>
            {data.quote.sub && <figcaption className="text-xs text-white/60 mt-2">— {data.quote.sub}</figcaption>}
          </figure>
        )}

        {/* Badge / reward / why nudge */}
        <div className="mt-6 min-h-[4rem] w-full">
          {showContent && data.nudge && (
            <div className="rounded-2xl bg-white/10 px-4 py-3" style={{ animation: 'fade-up 400ms ease-out' }}>
              <p className={`text-sm leading-snug ${data.nudge.kind === 'why' ? 'italic' : 'font-semibold'}`}>
                <span className="not-italic mr-1">{data.nudge.icon}</span>{data.nudge.text}
              </p>
              {data.nudge.sub && <p className="text-xs text-white/60 mt-1">— {data.nudge.sub}</p>}
            </div>
          )}
        </div>

        <p className={`text-xs text-white/40 mt-6 transition-opacity ${canClose ? 'opacity-100' : 'opacity-0'}`}>Tap anywhere to continue</p>
      </div>
    </div>
  )
}
