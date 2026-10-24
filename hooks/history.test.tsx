import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { DayRecord } from '../types'
import { addCost, addLimits, addTurn, dayKey, lastDays, mergeTrail } from './history'

// Noon on Monday 19 October 2026, local time.
const NOW = new Date(2026, 9, 19, 12).getTime()
const DAY = 24 * 60 * 60_000

const PANE_PROPS = {
  title: 'Historia',
  isFocused: false,
  bodyColumns: 70,
  placement: 'dock',
  scroll: { bodyRows: 20, offset: 0 },
  view: {},
} as never

const USAGE = {
  input_tokens: 1000,
  output_tokens: 2000,
  cache_read_input_tokens: 50000,
  cache_creation_input_tokens: 500,
  model: 'claude-opus-5-5',
}

// The store as a map the test can read back.
function engine(on: On, stored: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(stored))
  mock.clock(on, { now: NOW })
  on('store.get', (_$, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_$, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined } as never
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', () => ({ cwd: '.' }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200000 }, rateLimits: [] } }) as never)
  on('tool.register', () => ({ value: { tool: 'mcp__usage-limits__usage_limits' } }) as never)
  on('command.register', () => ({ value: {} }) as never)
  const panes: string[] = []
  on('ui.panes', () => ({ value: panes.map(id => ({ id, title: id, isShown: true, isFocused: false })) }) as never)
  on('ui.open', (_$, e) => {
    panes.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    panes.splice(panes.indexOf(e.id), 1)
    return { value: undefined } as never
  })
  return { panes, store }
}

async function mountHistory($: Engine) {
  return $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'Pane', requestId: 'limity', props: PANE_PROPS })
}

test('turns and readings are summed per day in the store', async ($, on) => {
  const { store } = engine(on)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '', usage: USAGE } as never)
  await $.turn.complete({ turnId: 't2', reason: 'answer', answer: '', usage: USAGE } as never)
  await $.session.measure({
    context: { window: 200000 } as never,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 61 },
      { kind: 'seven_day', percentUsed: 34 },
    ],
    changed: ['rateLimits'],
  })

  expect(store.get('days')).toEqual([{ day: '2026-10-19', tokens: 7000, turns: 2, cost: 0, fiveMax: 61, weekMax: 34 }])
  expect(store.get('burn')).toEqual([3500, 3500])
})

test('a new session picks up the chart and the days from the store', async ($, on) => {
  engine(on, {
    burn: [1000, 9000, 4000],
    days: [{ day: '2026-10-18', tokens: 120000, turns: 12, cost: 3.5, fiveMax: 80, weekMax: 30 }],
  })
  await $.session.start({ source: 'startup', cwd: '.' } as never)

  const band = await $.ui.mount({
    plugin: 'usage-limits',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { bodyRows: 10, offset: 0 }, view: {} } as never,
  })
  // the last turn on the chart is the stored one: the chart carries on
  expect(await band.find({ type: 'Text', text: /ostatnia 4\.0k tok/ })).toBeDefined()
  await band.unmount()

  const ui = await mountHistory($)
  expect(await ui.find({ type: 'Text', text: /Ostatnie 14 dni/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /nd  18\.10 .* 120k 5h  80% 7d  30% \$3\.50/ })).toBeDefined()
  await ui.unmount()
})

test('/limity toggles the history pane', async ($, on) => {
  const { panes } = engine(on)
  const run = () => $.command.run({ command: 'limity', args: '', origin: 'user', presentation: {} } as never)
  expect((await run()).text).toContain('otwarty')
  expect(panes).toEqual(['limity'])
  expect((await run()).text).toContain('schowany')
  expect(panes).toEqual([])
})

test('with history off nothing is stored', { options: { history: false } }, async ($, on) => {
  const { store } = engine(on)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '', usage: USAGE } as never)
  expect(store.size).toBe(0)
  const { text } = await $.command.run({ command: 'limity', args: '', origin: 'user', presentation: {} } as never)
  expect(text).toContain('wyłączona')
})

test('day records', async () => {
  let days: DayRecord[] = []
  days = addTurn(days, NOW, 1000)
  days = addTurn(days, NOW + 60_000, 500)
  days = addCost(days, NOW, 1.25)
  days = addLimits(days, NOW, [{ kind: 'five_hour', percentUsed: 40 }])
  days = addLimits(days, NOW, [{ kind: 'five_hour', percentUsed: 20 }])
  days = addTurn(days, NOW - DAY, 300)
  expect(days).toEqual([
    { day: '2026-10-18', tokens: 300, turns: 1, cost: 0, fiveMax: null, weekMax: null },
    { day: '2026-10-19', tokens: 1500, turns: 2, cost: 1.25, fiveMax: 40, weekMax: null },
  ])
  expect(dayKey(NOW)).toBe('2026-10-19')

  const shown = lastDays(days, NOW, 3)
  expect(shown.map(d => d.day)).toEqual(['2026-10-17', '2026-10-18', '2026-10-19'])
  expect(shown[0]?.turns).toBe(0)
})

test('the 5h trail merges readings, keeps the last hour, starts over on a reset', async () => {
  const min = 60_000
  const trail = [
    { at: NOW - 90 * min, percent: 10 },
    { at: NOW - 20 * min, percent: 30 },
  ]
  // the old sample falls out, a reading seen twice counts once
  expect(mergeTrail(trail, { at: NOW, percent: 40 })).toEqual([
    { at: NOW - 20 * min, percent: 30 },
    { at: NOW, percent: 40 },
  ])
  expect(mergeTrail(trail, { at: NOW - 20 * min, percent: 30 })).toEqual([{ at: NOW - 20 * min, percent: 30 }])
  // another session's older reading slots in by time
  expect(mergeTrail([{ at: NOW, percent: 40 }], { at: NOW - 10 * min, percent: 35 })).toEqual([
    { at: NOW - 10 * min, percent: 35 },
    { at: NOW, percent: 40 },
  ])
  expect(mergeTrail(trail, { at: NOW, percent: 2 })).toEqual([{ at: NOW, percent: 2 }])
})

test('two sessions add to one 5h trail in the store', async ($, on) => {
  const { store } = engine(on, { fiveHour: [{ at: NOW - 10 * 60_000, percent: 35 }] })
  await $.session.measure({
    context: { window: 200000 } as never,
    rateLimits: [{ kind: 'five_hour', percentUsed: 40 }],
    changed: ['rateLimits'],
  })
  expect(store.get('fiveHour')).toEqual([
    { at: NOW - 10 * 60_000, percent: 35 },
    { at: NOW, percent: 40 },
  ])
})
