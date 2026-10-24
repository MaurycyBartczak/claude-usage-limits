import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { LimitWindow } from '../types'
import { calibrate, estimateFrom, tokensOfText } from './estimate'

const NOW = new Date(2026, 9, 19, 20).getTime()

const BAND = {
  plugin: 'usage-limits',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 140, scroll: { bodyRows: 10, offset: 0 }, view: {} } as never,
} as const

const five = (percent: number): LimitWindow[] => [{ kind: 'five_hour', percentUsed: percent }]

// A session whose engine reading the test moves, and whose requests it plays.
function session(on: On) {
  const engine = { own: five(40), text: '', tokens: 0 }
  mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.start', () => ({ cwd: '.' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200000 }, rateLimits: engine.own } }) as never)
  on('tool.register', () => ({ value: { tool: 'mcp__usage-limits__usage_limits' } }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('turn.step', async function* (_$, e) {
    if (engine.text) yield { kind: 'text', index: 0, text: engine.text }
    return {
      turnId: e.turnId,
      index: e.index,
      answer: engine.text,
      toolUses: [],
      stopReason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: engine.tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' },
    }
  })
  return engine
}

async function step($: Engine, index: number) {
  for await (const _chunk of $.turn.step({ turnId: 't', index, model: 'm', messageCount: 1 } as never)) {
    // drain the stream
  }
}

test('the band draws a live estimate once a reading has taught the rate', async ($, on) => {
  const engine = session(on)
  await $.session.start({ source: 'startup', cwd: '.' } as never)

  // 20k tokens move the 5h window from 40% to 45%: 4000 tokens a percent
  engine.tokens = 10_000
  await step($, 0)
  engine.own = five(45)
  await step($, 1)

  // 8000 more tokens and no new reading yet: ~47%
  engine.tokens = 8_000
  await step($, 2)

  const ui = await $.ui.mount(BAND)
  await ui.advance(2000)
  expect(await ui.find({ in: 'bar-five_hour', text: /45%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /~47%/ })).toBeDefined()
  expect(await ui.find({ in: 'bar-five_hour', text: /╍/ })).toBeDefined()
  await ui.unmount()

  // the next reading replaces the estimate
  engine.own = five(47)
  engine.tokens = 0
  await step($, 3)
  const after = await $.ui.mount(BAND)
  expect(await after.find({ type: 'Text', text: /~4\d%/ })).toBeUndefined()
  await after.unmount()
})

test("the cost a subagent's requests add moves the estimate with no new reading", async ($, on) => {
  const engine = session(on)
  await $.session.start({ source: 'startup', cwd: '.' } as never)
  const measure = (own: LimitWindow[], usd: number) =>
    $.session.measure({ context: { window: 200000 } as never, rateLimits: own, cost: { usd }, changed: ['cost', 'rateLimits'] })

  // $0.50 moved the 5h window 5 points: $0.10 a percent
  await measure(five(40), 0)
  await measure(five(45), 0.5)
  // subagents spend $0.30 more; the main thread hears no new reading
  engine.own = five(45)
  await $.session.measure({ context: { window: 200000 } as never, rateLimits: five(45), cost: { usd: 0.8 }, changed: ['cost'] })

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /~48%/ })).toBeDefined()
  await ui.unmount()
})

test('without the switch no estimate shows', { options: { estimate: false } }, async ($, on) => {
  const engine = session(on)
  await $.session.start({ source: 'startup', cwd: '.' } as never)
  engine.tokens = 10_000
  await step($, 0)
  engine.own = five(45)
  await step($, 1)
  await step($, 2)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /~\d+%/ })).toBeUndefined()
  await ui.unmount()
})

test('calibration and estimate', async () => {
  // 5 points on 20k tokens, then 2 points on 10k: 4000, then 0.7·4000 + 0.3·5000
  let calib = calibrate({}, five(40), five(45), 20_000)
  expect(calib.five_hour).toBe(4000)
  calib = calibrate(calib, five(45), five(47), 10_000)
  expect(Math.round(calib.five_hour ?? 0)).toBe(4300)
  // too small a move or too few tokens teach nothing
  expect(calibrate({}, five(40), five(40.2), 20_000)).toEqual({})
  expect(calibrate({}, five(40), five(45), 500)).toEqual({})
  // a reset teaches nothing
  expect(calibrate({}, five(80), five(2), 20_000)).toEqual({})

  const estimateOf = (w: LimitWindow, calib: Record<string, number>, amount: number) =>
    estimateFrom(w, [{ calib, amount }])
  expect(estimateOf(five(45)[0]!, { five_hour: 4000 }, 8000)).toBe(47)
  expect(estimateOf(five(45)[0]!, {}, 8000)).toBeNull()
  expect(estimateOf(five(45)[0]!, { five_hour: 4000 }, 0)).toBeNull()
  expect(estimateOf(five(99)[0]!, { five_hour: 100 }, 8000)).toBe(100)
  expect(tokensOfText('abcdefgh')).toBe(2)
})
