'use client'

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { WishlistItem } from '@/lib/types'
import { addDays } from '@/lib/streak'

type Props = {
  balance: number
  ratePerDay: number
  items: WishlistItem[]
  today: string
  history: { date: string; value: number }[]
}

function shortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

export default function RewardForecast({ balance, ratePerDay, items, today, history }: Props) {
  if (items.length === 0) return null

  if (ratePerDay <= 0) {
    return (
      <div className="bg-white rounded-xl p-3 shadow-sm ring-1 ring-black/5 mb-2">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Forecast</p>
        <p className="text-sm text-gray-400">Keep checking in for a few days and a forecast of when you can afford each reward will appear here.</p>
      </div>
    )
  }

  const milestones = [...items].sort((a, b) => a.price - b.price).map(item => {
    const days = item.price <= balance ? 0 : Math.ceil((item.price - balance) / ratePerDay)
    return { item, days, date: addDays(today, days), beyond: days > 365 }
  })

  const bars = [
    ...history.map(h => ({ label: shortDate(h.date), value: Math.round(h.value), projected: false })),
    ...Array.from({ length: 8 }, (_, i) => {
      const day = (i + 1) * 7
      return { label: shortDate(addDays(today, day)), value: Math.round(balance + ratePerDay * day), projected: true }
    }),
  ]
  const yMax = Math.max(...bars.map(b => b.value)) * 1.15

  return (
    <div className="bg-white rounded-xl p-3 shadow-sm ring-1 ring-black/5 mb-2">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Forecast</p>
        <p className="text-xs text-gray-500">≈ S${ratePerDay.toFixed(2)}/day at your current pace</p>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={bars} margin={{ top: 14, right: 2, left: 2, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={14} />
          <YAxis hide domain={[0, yMax]} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="value" position="top" style={{ fill: '#6b7280', fontSize: 9 }} />
            {bars.map((b, i) => <Cell key={i} fill={b.projected ? '#a7f3d0' : '#047857'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-1 mb-2">
        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-800 inline-block" />Past</span>
        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 inline-block" />Projected</span>
      </div>
      <div className="space-y-1">
        {milestones.map(m => (
          <div key={m.item.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-600 truncate">{m.item.name} · S${Math.round(m.item.price)}</span>
            <span className="font-semibold text-emerald-700 shrink-0">
              {m.days === 0 ? 'Ready now' : m.beyond ? 'Over a year away' : `~${shortDate(m.date)} (${m.days} ${m.days === 1 ? 'day' : 'days'})`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
