// One row of a habit's numbers on the stats and friend-profile cards:
// Streak, Best, then the Yes / No / Freeze / NA counts. The success rate is
// not here: it is the label on the last point of the rate chart below.
export default function HabitStatRow({ streak, best, counts }: {
  streak: number
  best: number
  counts: { yes: number; no: number; freeze: number; na: number }
}) {
  const cells: [string, string, number][] = [
    ['', 'Streak', streak],
    ['', 'Best', best],
    ['✅', 'Yes', counts.yes],
    ['❌', 'No', counts.no],
    ['❄️', 'Freeze', counts.freeze],
    ['⏸️', 'NA', counts.na],
  ]
  return (
    <div className="grid grid-cols-6 gap-1">
      {cells.map(([icon, label, n]) => (
        <div key={label} className="text-center min-w-0">
          <p className="text-sm text-gray-900 font-semibold whitespace-nowrap">{icon && <span className="text-xs mr-0.5">{icon}</span>}{n}</p>
          <p className="text-[11px] text-gray-400">{label}</p>
        </div>
      ))}
    </div>
  )
}
