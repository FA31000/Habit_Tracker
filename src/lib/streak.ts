export type StreakResponse = 'yes' | 'no' | 'freeze'
export type StreakCheckin = { date: string; response: StreakResponse }

// Today's date in Singapore time, as YYYY-MM-DD.
export function todayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Monday that starts the week containing dateStr, as YYYY-MM-DD.
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// A streak counts every day that is a "yes", an allowed "no", or a "freeze",
// counting backwards from today.
// - A "yes" adds 1.
// - A "freeze" adds 1 (the app only lets you record a freeze when one is
//   available, so any recorded freeze is valid).
// - A "no" — or a missed day with no answer — adds 1 while you are still
//   within this habit's weekly "No" allowance; once you go over, it breaks the streak.
// - Today, if not yet answered, is skipped (it does not count and does not break).
// - Nothing before your first ever check-in counts.
export function computeHabitStreak(
  checkins: StreakCheckin[],
  allowedNoPerWeek: number,
  today: string,
): { current: number; longest: number } {
  if (checkins.length === 0) return { current: 0, longest: 0 }

  const byDate: Record<string, StreakResponse> = {}
  for (const c of checkins) byDate[c.date] = c.response

  const start = Object.keys(byDate).sort()[0]
  if (start > today) return { current: 0, longest: 0 }

  const classes: ('count' | 'skip' | 'break')[] = []
  const noUsedByWeek: Record<string, number> = {}

  for (let day = start; day <= today; day = addDays(day, 1)) {
    const r = byDate[day]
    if (r === 'yes') { classes.push('count'); continue }
    if (r === 'freeze') { classes.push('count'); continue }
    if (r === undefined && day === today) { classes.push('skip'); continue }
    const week = getWeekStart(day)
    const used = (noUsedByWeek[week] ?? 0) + 1
    noUsedByWeek[week] = used
    classes.push(used <= allowedNoPerWeek ? 'count' : 'break')
  }

  let longest = 0
  let run = 0
  for (const k of classes) {
    if (k === 'count') { run++; if (run > longest) longest = run }
    else if (k === 'break') { run = 0 }
  }

  let current = 0
  for (let i = classes.length - 1; i >= 0; i--) {
    const k = classes[i]
    if (k === 'count') current++
    else if (k === 'break') break
  }

  return { current, longest }
}
