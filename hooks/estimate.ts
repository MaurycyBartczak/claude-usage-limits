import type { LimitWindow } from '../types'

// Tokens per 1% of each window, learned from this session's own readings.
export type Calibration = Record<string, number>

// A window must move at least this much, on at least this many tokens, to teach.
const MIN_STEP = 0.5
const MIN_TOKENS = 1000
// How much a new sample moves the learned rate.
const WEIGHT = 0.3

// Learns from two of this session's own readings and the tokens spent between.
export function calibrate(
  calib: Calibration,
  before: LimitWindow[],
  after: LimitWindow[],
  tokens: number,
): Calibration {
  const next = { ...calib }
  for (const now of after) {
    const was = before.find(w => w.kind === now.kind)
    if (!was) continue
    const moved = now.percentUsed - was.percentUsed
    if (moved < MIN_STEP || tokens < MIN_TOKENS) continue
    const sample = tokens / moved
    const old = next[now.kind]
    next[now.kind] = old === undefined ? sample : old * (1 - WEIGHT) + sample * WEIGHT
  }
  return next
}

// The window's percent with the tokens spent since its last reading added,
// or null when there is nothing to add or nothing learned yet.
export function estimateOf(window: LimitWindow, calib: Calibration, liveTokens: number): number | null {
  const perPercent = calib[window.kind]
  if (!perPercent || liveTokens <= 0) return null
  const estimate = Math.min(window.percentUsed + liveTokens / perPercent, 100)
  return estimate - window.percentUsed >= 0.3 ? estimate : null
}

// A streamed piece's rough token count: about four characters a token.
export function tokensOfText(text: string): number {
  return Math.ceil(text.length / 4)
}
