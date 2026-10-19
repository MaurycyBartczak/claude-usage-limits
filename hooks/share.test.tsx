import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { LimitWindow } from '../types'
import { readingKey, shouldAdopt } from './share'

const NOW = new Date(2026, 9, 19, 18).getTime()

const BAND = {
  plugin: 'usage-limits',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { bodyRows: 10, offset: 0 }, view: {} } as never,
} as const

const limits = (five: number, week: number): LimitWindow[] => [
  { kind: 'five_hour', percentUsed: five },
  { kind: 'seven_day', percentUsed: week },
]

// One session: a store the test reads back, the engine's own reading.
function session(on: On, store: Map<string, unknown>, own: LimitWindow[]) {
  mock.clock(on, { now: NOW })
  on('store.get', (_$, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_$, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined } as never
  })
  on('session.start', () => ({ cwd: '.' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200000 }, rateLimits: own } }) as never)
  on('tool.register', () => ({ value: { tool: 'mcp__usage-limits__usage_limits' } }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
}

test('a session shares its own reading', async ($, on) => {
  const store = new Map<string, unknown>()
  session(on, store, [])
  await $.session.start({ source: 'startup', cwd: '.' } as never)
  await $.session.measure({ context: { window: 200000 } as never, rateLimits: limits(69, 39), changed: ['rateLimits'] })
  expect(store.get('latest')).toEqual({ at: NOW, windows: limits(69, 39) })
})

test('a session shows a newer reading another session shared', async ($, on) => {
  const store = new Map<string, unknown>([['latest', { at: NOW + 5_000, windows: limits(73, 40) }]])
  session(on, store, limits(69, 39))
  await $.session.start({ source: 'startup', cwd: '.' } as never)

  const ui = await $.ui.mount(BAND)
  await ui.advance(2000)
  expect(await ui.find({ in: 'bar-five_hour', text: /73%/ })).toBeDefined()
  expect(await ui.find({ in: 'bar-seven_day', text: /40%/ })).toBeDefined()
  await ui.unmount()
  // the older own reading did not overwrite the newer shared one
  expect((store.get('latest') as { windows: LimitWindow[] }).windows).toEqual(limits(73, 40))
})

test('which reading wins', async () => {
  expect(shouldAdopt(null, 0, limits(69, 39))).toBe(false)
  expect(shouldAdopt({ at: 10, windows: limits(73, 40) }, 5, limits(69, 39))).toBe(true)
  // older than ours
  expect(shouldAdopt({ at: 3, windows: limits(73, 40) }, 5, limits(69, 39))).toBe(false)
  // the same figures
  expect(shouldAdopt({ at: 10, windows: limits(69, 39) }, 5, limits(69, 39))).toBe(false)
  expect(readingKey(limits(1, 2))).toBe(readingKey([...limits(1, 2)].reverse()))
})
