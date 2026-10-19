import { test, expect, mock } from 'claude-code/testing'

import { levelOf } from './burn'
import { colorAt } from './colors'
import { forecast } from './register'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { bodyRows: 10, offset: 0 },
    view: {},
  },
} as const

const USAGE = {
  input_tokens: 1000,
  output_tokens: 2000,
  cache_read_input_tokens: 50000,
  cache_creation_input_tokens: 500,
  model: 'claude-opus-5-5',
}

test('shows a placeholder before any reading', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-limits', surface, component: 'AbovePrompt', props: BAND.props as never })
    expect(await ui.find({ type: 'Text', text: /brak odczytu/ })).toBeDefined()
    await ui.unmount()
  }
})

test('animates both bars up to the measured usage and charts the burn', async ($, on) => {
  mock.clock(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.measure({
    context: { window: 200000 } as never,
    rateLimits: [
      { kind: 'seven_day', percentUsed: 18 },
      { kind: 'five_hour', percentUsed: 42.5 },
    ],
    changed: ['rateLimits'],
  })
  await $.turn.complete({ turnId: 't1', reason: 'answer', usage: USAGE } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-limits', surface, component: 'AbovePrompt', props: BAND.props as never })
    expect(await ui.find({ type: 'Text', text: /Sesja 5h/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Tydzień/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ostatnia 3\.5k tok/ })).toBeDefined()
    await ui.advance(2000)
    expect(await ui.find({ in: 'bar-five_hour', text: /43%/ })).toBeDefined()
    expect(await ui.find({ in: 'bar-seven_day', text: /18%/ })).toBeDefined()
    expect(await ui.find({ in: 'burn-chart', text: /█/ })).toBeDefined()
    await ui.unmount()
  }
})

test('threshold colors', async () => {
  expect(colorAt(10)).toBe('#4ade80')
  expect(colorAt(60)).toBe('#facc15')
  expect(colorAt(80)).toBe('#fb923c')
  expect(colorAt(95)).toBe('#f87171')
})

test('sparkline levels', async () => {
  expect(levelOf(0, 100)).toBe(0)
  expect(levelOf(100, 100)).toBe(7)
  expect(levelOf(50, 100)).toBe(4)
})

test('forecast of the 5h window', async () => {
  const hour = 60 * 60_000
  const now = 10 * hour
  const samples = [
    { at: now - hour / 2, percent: 40 },
    { at: now, percent: 60 },
  ]
  // 20 points per half hour: 40 left takes an hour
  expect(forecast(samples, now, new Date(now + 3 * hour).toISOString())).toBe('w tym tempie 100% za ~1h 0m')
  expect(forecast(samples, now, new Date(now + hour / 2).toISOString())).toBe('tempo OK do resetu')
  expect(forecast([], now)).toBe('')
})
