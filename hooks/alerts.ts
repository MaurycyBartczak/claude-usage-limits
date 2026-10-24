import type { LimitWindow } from '../types'

export const THRESHOLDS = [50, 75, 90]

// A drop this large between two readings of one window means it reset.
const RESET_DROP = 10
// A reset time moved later by this much means a new window, rounding aside.
const RESET_MOVE_MS = 30 * 60_000

function hasMovedOn(was: LimitWindow, now: LimitWindow): boolean {
  if (!was.resetsAt || !now.resetsAt) return false
  return Date.parse(now.resetsAt) - Date.parse(was.resetsAt) >= RESET_MOVE_MS
}

export type Alert =
  | { kind: 'threshold'; window: string; threshold: number; percent: number }
  | { kind: 'reset'; window: string }

// What changed between two readings: thresholds crossed upward, windows reset.
export function alertsBetween(before: LimitWindow[], after: LimitWindow[]): Alert[] {
  const alerts: Alert[] = []
  for (const now of after) {
    const was = before.find(w => w.kind === now.kind)
    if (!was) continue

    // a window used little drops little: its reset time tells it reset
    const isReset = was.percentUsed - now.percentUsed >= RESET_DROP || (was.percentUsed > 0 && hasMovedOn(was, now))
    if (isReset) {
      alerts.push({ kind: 'reset', window: now.kind })
      continue
    }

    // only the highest threshold crossed, so a jump past two toasts once
    const crossed = THRESHOLDS.filter(t => was.percentUsed < t && now.percentUsed >= t)
    const highest = crossed[crossed.length - 1]
    if (highest !== undefined) {
      alerts.push({ kind: 'threshold', window: now.kind, threshold: highest, percent: now.percentUsed })
    }
  }
  return alerts
}
