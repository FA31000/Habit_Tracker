// Vibrates the phone where supported (Android browsers). iOS Safari has no
// vibration API, so this quietly does nothing there.
export function buzz(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
  } catch {}
}

// One pattern per celebration level (see Celebration.level).
export const CELEBRATION_BUZZ: number[][] = [
  [40],
  [60, 40, 60],
  [60, 40, 60, 40, 100],
  [80, 50, 80, 50, 200],
]
