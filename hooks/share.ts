import type { EngineInterface } from 'claude-code'

import type { LimitWindow } from '../types'

// The newest limit reading any session saw, so every session shows it: the
// limits are the account's, but each session hears only its own responses.
export type SharedReading = { at: number; windows: LimitWindow[] }

export function readingKey(limits: LimitWindow[]): string {
  return limits
    .map(w => `${w.kind}:${w.percentUsed}:${w.resetsAt ?? ''}`)
    .sort()
    .join('|')
}

export async function readShared($: EngineInterface): Promise<SharedReading | null> {
  try {
    const value = (await $.store.get('latest')) as SharedReading | undefined
    return value && Array.isArray(value.windows) ? value : null
  } catch {
    return null
  }
}

// Shares a reading unless another session already shared a newer one.
export async function shareReading($: EngineInterface, reading: SharedReading): Promise<void> {
  try {
    const before = await readShared($)
    if (!before || before.at < reading.at) {
      await $.store.set('latest', reading)
    }
  } catch {
    // sharing is a nicety: the session's own reading still shows
  }
}

// Which reading to show: the shared one only when it is newer and differs.
export function shouldAdopt(shared: SharedReading | null, ownAt: number, shown: LimitWindow[]): shared is SharedReading {
  return shared !== null && shared.at > ownAt && readingKey(shared.windows) !== readingKey(shown)
}
