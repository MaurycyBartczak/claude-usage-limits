import type { LimitWindow } from '../types'

export const THRESHOLDS = [50, 75, 90]

// A drop this large between two readings of one window means it reset.
const RESET_DROP = 10

export type Alert =
  | { kind: 'threshold'; window: string; threshold: number; percent: number }
  | { kind: 'reset'; window: string }

// What changed between two readings: thresholds crossed upward, windows reset.
export function alertsBetween(before: LimitWindow[], after: LimitWindow[]): Alert[] {
  const alerts: Alert[] = []
  for (const now of after) {
    const was = before.find(w => w.kind === now.kind)
    if (!was) continue

    if (was.percentUsed - now.percentUsed >= RESET_DROP) {
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
