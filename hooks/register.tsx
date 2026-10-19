import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnUsage } from 'claude-code'

import type { LimitWindow, PercentSample } from '../types'

const windows = atom({ plugin: 'usage-limits', key: 'windows' } as const, [])
const burn = atom({ plugin: 'usage-limits', key: 'burn' } as const, [])
const fiveHour = atom({ plugin: 'usage-limits', key: 'fiveHour' } as const, [])

const LABELS: Record<string, string> = {
  five_hour: 'Sesja 5h',
  seven_day: 'Tydzień',
}

const ORDER = ['five_hour', 'seven_day']

const LABEL_COLS = 9 // "Sesja 5h "
const PERCENT_COLS = 5 // " 100%"
const RESET_COLS = 16 // " reset za 6d 23h"
const FIXED_COLS = LABEL_COLS + PERCENT_COLS + RESET_COLS
const GAP = 3
const MAX_BAR = 30
const MAX_SAMPLES = 40
const RATE_WINDOW_MS = 60 * 60_000

function duration(ms: number): string {
  const minutes = Math.max(Math.floor(ms / 60_000), 0)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function untilReset(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'reset teraz'
  return `reset za ${duration(ms)}`
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// What a turn spends against the limits; cache reads are left out as near free.
function spent(usage: TurnUsage): number {
  return usage.input_tokens + usage.output_tokens + usage.cache_creation_input_tokens
}

function pick(all: LimitWindow[]): LimitWindow[] {
  return all
    .filter(w => w.kind in LABELS)
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

// When the 5h window hits 100% at the pace of the last hour, if before its reset.
export function forecast(samples: PercentSample[], now: number, resetsAt?: string): string {
  const recent = samples.filter(s => now - s.at <= RATE_WINDOW_MS)
  const first = recent[0]
  const last = recent[recent.length - 1]
  if (!first || !last || last.at - first.at < 60_000 || last.percent <= first.percent) {
    return ''
  }
  const perMs = (last.percent - first.percent) / (last.at - first.at)
  const eta = (100 - last.percent) / perMs
  const resetIn = resetsAt ? Date.parse(resetsAt) - now : Infinity
  if (eta >= resetIn) return 'tempo OK do resetu'
  return `w tym tempie 100% za ~${duration(eta)}`
}

// One row when both bars fit at a decent length, else one row per window.
function layout(columns: number, count: number): { isRow: boolean; bar: number } {
  const rowBar = Math.floor((columns - GAP * (count - 1)) / count) - FIXED_COLS
  if (rowBar >= 14) return { isRow: true, bar: Math.min(rowBar, MAX_BAR) }
  return { isRow: false, bar: Math.max(Math.min(columns - FIXED_COLS, 40), 8) }
}

// Keeps the windows, and a trail of the 5h reading for the forecast.
async function remember($: EngineInterface, limits: LimitWindow[]): Promise<void> {
  await update($, windows, () => limits)
  const five = limits.find(w => w.kind === 'five_hour')
  if (five) {
    const at = await $.clock.now()
    await update($, fiveHour, all => {
      // a drop means the window reset: start the trail over
      const kept = all.filter(s => at - s.at <= RATE_WINDOW_MS && s.percent <= five.percentUsed)
      return [...kept, { at, percent: five.percentUsed }].slice(-MAX_SAMPLES)
    })
  }
}

export const register: Register = on => {
  let pendingAgentTokens = 0

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const { rateLimits } = await $.session.usage()
    if (rateLimits.length > 0) {
      await remember($, rateLimits)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await remember($, e.rateLimits)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.usage) {
      if (e.agentId !== undefined) {
        // a subagent's spend lands in the main turn that spawned it
        pendingAgentTokens += spent(e.usage)
      } else {
        const total = spent(e.usage) + pendingAgentTokens
        pendingAgentTokens = 0
        await update($, burn, all => [...all, total].slice(-MAX_SAMPLES))
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      return next(e)
    }

    const { Box, Text, Client } = $.ui.resolve(e)
    const shown = pick(await read($, windows))
    const samples = await read($, burn)
    const columns = e.props.bodyColumns

    if (shown.length === 0) {
      return (
        <Box>
          <Text dimColor>Limity: brak odczytu (pojawi się po pierwszej odpowiedzi)</Text>
        </Box>
      )
    }

    const now = await $.clock.now()
    const { isRow, bar } = layout(columns, shown.length)
    const five = shown.find(w => w.kind === 'five_hour')
    const pace = forecast(await read($, fiveHour), now, five?.resetsAt)
    const lastTurn = samples[samples.length - 1]
    const average = samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : 0
    const chartWidth = Math.max(Math.min(columns - LABEL_COLS - 50, MAX_SAMPLES), 8)

    return (
      <Box flexDirection="column">
        <Box flexDirection={isRow ? 'row' : 'column'} columnGap={GAP}>
          {shown.map(w => (
            <Box key={w.kind}>
              <Text weight="bold">{(LABELS[w.kind] ?? w.kind).padEnd(LABEL_COLS)}</Text>
              <Client
                key={`bar-${w.kind}`}
                module="./bar.tsx"
                props={{ percent: w.percentUsed, width: bar }}
                width={bar + PERCENT_COLS}
              />
              <Text dimColor>{` ${untilReset(w.resetsAt, now)}`.padEnd(RESET_COLS)}</Text>
            </Box>
          ))}
        </Box>
        <Box key="burn">
          <Text weight="bold">{'Spalanie'.padEnd(LABEL_COLS)}</Text>
          {samples.length > 0 || e.props.isWorking ? (
            <Client
              key="burn-chart"
              module="./burn.tsx"
              props={{ samples, isWorking: e.props.isWorking, width: chartWidth }}
            />
          ) : (
            <Text dimColor>brak tur</Text>
          )}
          <Text dimColor>
            {lastTurn !== undefined ? ` ostatnia ${tokens(lastTurn)} tok · śr. ${tokens(Math.round(average))}` : ''}
            {pace ? ` · ${pace}` : ''}
          </Text>
        </Box>
      </Box>
    )
  })
}
