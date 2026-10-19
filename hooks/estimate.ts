import type { LimitWindow } from '../types'

// Tokens per 1% of each window, learned from this session's own readings.
export type Calibration = Record<string, number>

// A window must move at least this much, on at least this many tokens, to teach.
const MIN_STEP = 0.5
const MIN_TOKENS = 1000
// How much a new sample moves the learned rate.
const WEIGHT = 0.3

// Dollars per 1% of each window: the session's cost counts every request,
// a subagent's too, while the limit reading moves only with the main thread's.
export const MIN_USD = 0.02

// Learns from two of this session's own readings and what was spent between:
// tokens, or with `minAmount` set, dollars.
export function calibrate(
  calib: Calibration,
  before: LimitWindow[],
  after: LimitWindow[],
  amount: number,
  minAmount: number = MIN_TOKENS,
): Calibration {
  const next = { ...calib }
  for (const now of after) {
    const was = before.find(w => w.kind === now.kind)
    if (!was) continue
    const moved = now.percentUsed - was.percentUsed
    if (moved < MIN_STEP || amount < minAmount) continue
    const sample = amount / moved
    const old = next[now.kind]
    next[now.kind] = old === undefined ? sample : old * (1 - WEIGHT) + sample * WEIGHT
  }
  return next
}

// What was spent since the window's last reading, each amount with the rate
// learned for it: dollars of finished requests, tokens still streaming.
export type Spend = { calib: Calibration; amount: number }

// The window's percent with that spend added, or null when there is nothing
// to add or nothing learned yet.
export function estimateFrom(window: LimitWindow, spends: Spend[]): number | null {
  let added = 0
  for (const { calib, amount } of spends) {
    const perPercent = calib[window.kind]
    if (perPercent && amount > 0) added += amount / perPercent
  }
  if (added <= 0) return null
  const estimate = Math.min(window.percentUsed + added, 100)
  return estimate - window.percentUsed >= 0.3 ? estimate : null
}

export function estimateOf(window: LimitWindow, calib: Calibration, liveTokens: number): number | null {
  return estimateFrom(window, [{ calib, amount: liveTokens }])
}

// A streamed piece's rough token count: about four characters a token.
export function tokensOfText(text: string): number {
  return Math.ceil(text.length / 4)
}
