import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const NOW = new Date(2026, 9, 20, 10).getTime()

const BAND = {
  plugin: 'usage-limits',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 140, scroll: { bodyRows: 10, offset: 0 }, view: {} } as never,
} as const

const usage = (output: number) => ({
  input_tokens: 0,
  output_tokens: output,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  model: 'm',
})

// A session whose requests stream `text` and spend `tokens` each.
function session(on: On) {
  const engine = { text: '', tokens: 0 }
  mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.start', () => ({ cwd: '.' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200000 }, rateLimits: [] } }) as never)
  on('tool.register', () => ({ value: { tool: 'mcp__usage-limits__usage_limits' } }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* (_$, e) {
    if (engine.text) yield { kind: 'text', index: 0, text: engine.text }
    return { turnId: e.turnId, index: e.index, answer: engine.text, toolUses: [], stopReason: 'end_turn', usage: usage(engine.tokens) }
  })
  return engine
}

function request($: Engine, index: number, agentId?: string) {
  return $.turn.step({ turnId: agentId ? `t-${agentId}` : 't', index, model: 'm', messageCount: 1, agentId } as never)[
    Symbol.asyncIterator
  ]()
}

async function drain(stream: AsyncIterator<unknown>) {
  while (!(await stream.next()).done) {
    // the rest of the response
  }
}

async function bandText($: Engine): Promise<string> {
  const ui = await $.ui.mount(BAND)
  const found = await ui.find({ type: 'Box' })
  await ui.unmount()
  return (found as { text?: string } | undefined)?.text ?? ''
}

test("a subagent's requests move the burn while the main turn still runs", async ($, on) => {
  const engine = session(on)
  await $.session.start({ source: 'startup', cwd: '.' } as never)

  engine.tokens = 1_000
  await drain(request($, 0))
  engine.tokens = 6_000
  await drain(request($, 0, 'a1'))
  await drain(request($, 1, 'a1'))
  expect(await bandText($)).toMatch(/ta tura 13\.0k/)
  expect(await bandText($)).toMatch(/dziś 13\.0k/)

  // the main turn ends: its requests and the subagent's are one bar
  await $.turn.complete({ turnId: 't-a1', reason: 'answer', usage: usage(12_000), agentId: 'a1' } as never)
  await $.turn.complete({ turnId: 't', reason: 'answer', usage: usage(1_000) } as never)
  const after = await bandText($)
  expect(after).toMatch(/ostatnia 13\.0k/)
  expect(after).not.toMatch(/ta tura/)
})

test('subagents streaming side by side each keep their own count', async ($, on) => {
  const engine = session(on)
  await $.session.start({ source: 'startup', cwd: '.' } as never)

  // two subagents stream about 1000 tokens each at once
  engine.text = 'x'.repeat(4_000)
  const first = request($, 0, 'a1')
  const second = request($, 0, 'a2')
  await first.next()
  await second.next()
  expect(await bandText($)).toMatch(/ta tura 2\.0k/)

  // the first ends having spent nothing; the second still streams
  await drain(first)
  expect(await bandText($)).toMatch(/ta tura 1\.0k/)
  await drain(second)
  expect(await bandText($)).not.toMatch(/ta tura/)
})
