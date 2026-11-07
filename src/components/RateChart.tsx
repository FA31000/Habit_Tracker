'use client'

import { XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Dot } from 'recharts'
import { cumulativeRateSeries } from '@/lib/streak'
import type { StreakCheckin } from '@/lib/streak'

export const RATE_RANGES = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '3m', label: '3M', days: 91 },
  { key: '1y', label: '1Y', days: 365 },
] as const
export type RateRange = typeof RATE_RANGES[number]['key']

function formatTick(date: string, range: RateRange): string {
  const d = new Date(date + 'T00:00:00')
  if (range === '1y') return d.toLocaleDateString('en-SG', { month: 'short' })
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

// 7D / 30D / 3M / 1Y segmented control for the rate charts.
export function RateRangeToggle({ value, onChange }: { value: RateRange; onChange: (r: RateRange) => void }) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-0.5" role="group" aria-label="Rate chart range">
      {RATE_RANGES.map(r => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          aria-pressed={value === r.key}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${value === r.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

// Line chart of a habit's all-time success rate at the end of each day in the range.
export function RateChart({ checkins, range, today }: { checkins: StreakCheckin[]; range: RateRange; today: string }) {
  const days = RATE_RANGES.find(r => r.key === range)!.days
  const series = cumulativeRateSeries(checkins, today, days)
  const values = series.flatMap(p => (p.rate === null ? [] : [p.rate]))
  if (values.length === 0) return null

  // Zoom the Y-axis to the data: an all-time rate moves slowly, so 0–100 would look flat.
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max(2, (max - min) * 0.15)
  const domain = [Math.max(0, Math.floor(min - pad)), Math.min(100, Math.ceil(max + pad))]

  return (
    <div className="mt-3">
      <ResponsiveContainer width="100%" height={110}>
        <LineChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={d => formatTick(d, range)}
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={false} tickLine={false}
            interval="preserveStartEnd" minTickGap={24}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={false} tickLine={false}
            domain={domain} allowDecimals={false}
            tickFormatter={v => `${v}%`}
          />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#6b7280' }}
            itemStyle={{ color: '#047857' }}
            labelFormatter={d => new Date(d + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
            formatter={v => [`${v}%`, 'Rate']}
          />
          <Line
            type="monotone" dataKey="rate" stroke="#047857" strokeWidth={2}
            dot={range === '7d' ? <Dot r={3} fill="#047857" /> : false}
            activeDot={{ r: 4 }} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
