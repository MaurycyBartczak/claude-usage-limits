// Threshold stops: below each limit, its color.
const STOPS: [number, string][] = [
  [50, '#4ade80'],
  [75, '#facc15'],
  [90, '#fb923c'],
]
const CRITICAL = '#f87171'

export function colorAt(percent: number): string {
  for (const [limit, color] of STOPS) {
    if (percent < limit) return color
  }
  return CRITICAL
}
