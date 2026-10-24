import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { alertsBetween } from './alerts'
import { levelOf } from './burn'
import { colorAt } from './colors'
import { STRINGS } from './i18n'
import { tokens } from './format'
import { dollars, forecast, snapshot } from './register'

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { bodyRows: 10, offset: 0 },
  view: {},
} as never

const USAGE = {
  input_tokens: 1000,
  output_tokens: 2000,
  cache_read_input_tokens: 50000,
  cache_creation_input_tokens: 500,
  model: 'claude-opus-5-5',
}

const CONTEXT = { window: 200000 } as never

// The engine's side: a clock, measure's echo, a turn's end, and a record of
// the toasts and commands the plugin sends.
function engine(on: On) {
  const toasts: string[] = []
  const commands: string[][] = []
  mock.clock(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('env.get', () => ({ value: 'Windows_NT' }))
  on('process.run', (_$, e) => {
    commands.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { toasts, commands }
}

test('shows a placeholder before any reading', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-limits', surface, component: 'AbovePrompt', props: BAND_PROPS })
    expect(await ui.find({ type: 'Text', text: /brak odczytu/ })).toBeDefined()
    await ui.unmount()
  }
})

test('animates both bars, charts the burn and shows the cost', async ($, on) => {
  engine(on)
  await $.session.measure({
    context: CONTEXT,
    rateLimits: [
      { kind: 'seven_day', percentUsed: 18 },
      { kind: 'five_hour', percentUsed: 42.5 },
    ],
    cost: { usd: 1.234 },
    changed: ['rateLimits', 'cost'],
  })
  await $.turn.complete({ turnId: 't1', reason: 'answer', usage: USAGE } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-limits', surface, component: 'AbovePrompt', props: BAND_PROPS })
    expect(await ui.find({ type: 'Text', text: /Sesja 5h/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Tydzień/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ostatnia 3\.5k tok/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /koszt \$1\.23/ })).toBeDefined()
    await ui.advance(2000)
    expect(await ui.find({ in: 'bar-five_hour', text: /43%/ })).toBeDefined()
    expect(await ui.find({ in: 'bar-seven_day', text: /18%/ })).toBeDefined()
    expect(await ui.find({ in: 'burn-chart', text: /█/ })).toBeDefined()
    await ui.unmount()
  }
})

test('toasts a crossed threshold and chimes at 90%', async ($, on) => {
  const { toasts, commands } = engine(on)
  const measure = (five: number) =>
    $.session.measure({ context: CONTEXT, rateLimits: [{ kind: 'five_hour', percentUsed: five }], changed: ['rateLimits'] })

  await measure(40)
  expect(toasts).toEqual([])
  await measure(76)
  expect(toasts).toEqual([expect.stringContaining('sesji 5h: 76%')])
  expect(commands).toEqual([])
  await measure(91)
  expect(toasts[1]).toContain('🔴')
  expect(commands[0]?.[0]).toBe('powershell.exe')
  await measure(2)
  expect(toasts[2]).toContain('zresetowany')
})

test('switches in /config turn statistics and alerts off', { options: { showWeekly: false, showCost: false, thresholdToasts: false, sound90: false } }, async ($, on) => {
  const { toasts, commands } = engine(on)
  await $.session.measure({
    context: CONTEXT,
    rateLimits: [
      { kind: 'seven_day', percentUsed: 18 },
      { kind: 'five_hour', percentUsed: 40 },
    ],
    cost: { usd: 3 },
    changed: ['rateLimits', 'cost'],
  })
  await $.session.measure({
    context: CONTEXT,
    rateLimits: [
      { kind: 'seven_day', percentUsed: 18 },
      { kind: 'five_hour', percentUsed: 95 },
    ],
    changed: ['rateLimits'],
  })
  expect(toasts).toEqual([])
  expect(commands).toEqual([])

  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await ui.find({ type: 'Text', text: /Sesja 5h/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Tydzień/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /koszt/ })).toBeUndefined()
  await ui.unmount()
})

test('the usage_limits tool tells the model the limits, not cost or burn', async ($, on) => {
  engine(on)
  const empty = await $.tool.call({ tool: 'mcp__usage-limits__usage_limits' } as never)
  expect(String(empty.result)).toContain('No rate-limit reading yet')

  await $.session.measure({
    context: CONTEXT,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 43 },
      { kind: 'seven_day', percentUsed: 18 },
    ],
    cost: { usd: 2.5 },
    changed: ['rateLimits', 'cost'],
  })
  await $.turn.complete({ turnId: 't1', reason: 'answer', usage: USAGE } as never)

  const { result } = await $.tool.call({ tool: 'mcp__usage-limits__usage_limits' } as never)
  const text = String(result)
  expect(text).toContain('5-hour session limit: 43% used')
  expect(text).toContain('Weekly limit: 18% used')
  expect(text).toContain('Pace:')
  expect(text).not.toContain('$2.50')
  expect(text).not.toContain('3.5k')
})

test('speaks English when the language is set to en', { options: { language: 'en' } }, async ($, on) => {
  const { toasts } = engine(on)
  const measure = (five: number) =>
    $.session.measure({
      context: CONTEXT,
      rateLimits: [
        { kind: 'five_hour', percentUsed: five },
        { kind: 'seven_day', percentUsed: 18 },
      ],
      cost: { usd: 1.5 },
      changed: ['rateLimits', 'cost'],
    })
  await measure(40)
  await measure(80)
  expect(toasts).toEqual([expect.stringContaining('5-hour limit: 80% used')])
  await measure(1)
  expect(toasts[1]).toContain('5-hour limit has reset')
  await $.turn.complete({ turnId: 't1', reason: 'answer', usage: USAGE } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-limits', surface, component: 'AbovePrompt', props: BAND_PROPS })
    expect(await ui.find({ type: 'Text', text: /5h limit/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Weekly/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Burn/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /last 3\.5k tok · avg 3\.5k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /cost \$1\.50/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Sesja|Tydzień|Spalanie|koszt/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('alerts between readings', async () => {
  const five = (p: number) => [{ kind: 'five_hour', percentUsed: p }]
  expect(alertsBetween(five(40), five(60))).toEqual([{ kind: 'threshold', window: 'five_hour', threshold: 50, percent: 60 }])
  // a jump past two thresholds alerts the highest once
  expect(alertsBetween(five(40), five(92))).toEqual([{ kind: 'threshold', window: 'five_hour', threshold: 90, percent: 92 }])
  expect(alertsBetween(five(60), five(70))).toEqual([])
  expect(alertsBetween(five(80), five(3))).toEqual([{ kind: 'reset', window: 'five_hour' }])
  expect(alertsBetween([], five(95))).toEqual([])

  // a window used little resets too: its reset time moves on
  const at = (p: number, resetsAt: string) => [{ kind: 'five_hour', percentUsed: p, resetsAt }]
  expect(alertsBetween(at(6, '2026-10-19T15:00:00Z'), at(0, '2026-10-19T20:00:00Z'))).toEqual([
    { kind: 'reset', window: 'five_hour' },
  ])
  // the same reset time, give or take the rounding, is the same window
  expect(alertsBetween(at(6, '2026-10-19T15:00:00Z'), at(7, '2026-10-19T15:00:40Z'))).toEqual([])
  // nothing was used: nothing to announce
  expect(alertsBetween(at(0, '2026-10-19T15:00:00Z'), at(0, '2026-10-19T20:00:00Z'))).toEqual([])
})

test('snapshot for the usage_limits tool', async () => {
  const now = Date.parse('2026-10-19T12:00:00Z')
  const text = snapshot(
    [
      { kind: 'five_hour', percentUsed: 43, resetsAt: '2026-10-19T14:13:00Z' },
      { kind: 'seven_day', percentUsed: 18, resetsAt: 'soon' },
    ],
    [],
    now,
  )
  expect(text).toContain('5-hour session limit: 43% used, resets in 2h 13m (2026-10-19T14:13:00Z)')
  expect(text).toContain('Weekly limit: 18% used, resets at soon')
  expect(text).not.toContain('NaN')
})

test('token counts', async () => {
  expect(tokens(800)).toBe('800')
  expect(tokens(8100)).toBe('8.1k')
  expect(tokens(412_400, 0)).toBe('412k')
  expect(tokens(1_250_000)).toBe('1.3M')
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

test('dollars', async () => {
  expect(dollars(0.5)).toBe('$0.50')
  expect(dollars(12.345)).toBe('$12.3')
})

test('forecast of the 5h window', async () => {
  const hour = 60 * 60_000
  const now = 10 * hour
  const samples = [
    { at: now - hour / 2, percent: 40 },
    { at: now, percent: 60 },
  ]
  // 20 points per half hour: 40 left takes an hour
  expect(forecast(STRINGS.pl, samples, now, new Date(now + 3 * hour).toISOString())).toBe('w tym tempie 100% za ~1h 0m')
  expect(forecast(STRINGS.en, samples, now, new Date(now + 3 * hour).toISOString())).toBe('at this pace 100% in ~1h 0m')
  expect(forecast(STRINGS.pl, samples, now, new Date(now + hour / 2).toISOString())).toBe('tempo OK do resetu')
  expect(forecast(STRINGS.pl, [], now)).toBe('')
})
