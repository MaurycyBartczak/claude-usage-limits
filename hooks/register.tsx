import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, TurnUsage } from 'claude-code'

import type { LimitWindow, PercentSample } from '../types'
import { alertsBetween } from './alerts'
import type { Alert } from './alerts'
import { STRINGS, languageOf } from './i18n'
import type { Strings } from './i18n'
import { registerTasks, startTasks } from './tasks'
import {
  addCost,
  addLimits,
  addTurn,
  loadHistory,
  registerHistory,
  startHistory,
  storeBurn,
  storeDays,
  storeFiveHour,
  todayTokens,
} from './history'

const windows = atom({ plugin: 'usage-limits', key: 'windows' } as const, [])
const burn = atom({ plugin: 'usage-limits', key: 'burn' } as const, [])
const fiveHour = atom({ plugin: 'usage-limits', key: 'fiveHour' } as const, [])
const costUsd = atom({ plugin: 'usage-limits', key: 'costUsd' } as const, null)
const days = atom({ plugin: 'usage-limits', key: 'days' } as const, [])

const ORDER = ['five_hour', 'seven_day']

const LABEL_COLS = 9 // "Sesja 5h ", "5h limit "
const PERCENT_COLS = 5 // " 100%"
const RESET_COLS = 17 // " resets in 6d 23h"
const FIXED_COLS = LABEL_COLS + PERCENT_COLS + RESET_COLS
const GAP = 3
const MAX_BAR = 30
const MAX_SAMPLES = 40
const RATE_WINDOW_MS = 60 * 60_000

type Settings = {
  showFiveHour: boolean
  showWeekly: boolean
  showBurn: boolean
  showForecast: boolean
  showCost: boolean
  animations: boolean
  thresholdToasts: boolean
  sound90: boolean
  resetToast: boolean
  history: boolean
  t: Strings
}

// Every switch is on unless the person turned it off in /config.
function settingsOf(options: PluginOptions): Settings {
  const on = (key: keyof Settings) => options[key] !== false
  return {
    showFiveHour: on('showFiveHour'),
    showWeekly: on('showWeekly'),
    showBurn: on('showBurn'),
    showForecast: on('showForecast'),
    showCost: on('showCost'),
    animations: on('animations'),
    thresholdToasts: on('thresholdToasts'),
    sound90: on('sound90'),
    resetToast: on('resetToast'),
    history: on('history'),
    t: STRINGS[languageOf(options.language)],
  }
}

function duration(ms: number): string {
  const minutes = Math.max(Math.floor(ms / 60_000), 0)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function untilReset(t: Strings, resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return t.resetsNow
  return t.resetsIn(duration(ms))
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function dollars(usd: number): string {
  return usd < 10 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(1)}`
}

// What a turn spends against the limits; cache reads are left out as near free.
function spent(usage: TurnUsage): number {
  return usage.input_tokens + usage.output_tokens + usage.cache_creation_input_tokens
}

function pick(all: LimitWindow[], settings: Settings): LimitWindow[] {
  return all
    .filter(w => (w.kind === 'five_hour' && settings.showFiveHour) || (w.kind === 'seven_day' && settings.showWeekly))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

type Pace = { kind: 'eta'; ms: number } | { kind: 'ok' }

// When the 5h window hits 100% at the pace of the last hour, if before its reset.
function paceOf(samples: PercentSample[], now: number, resetsAt?: string): Pace | null {
  const recent = samples.filter(s => now - s.at <= RATE_WINDOW_MS)
  const first = recent[0]
  const last = recent[recent.length - 1]
  if (!first || !last || last.at - first.at < 60_000 || last.percent <= first.percent) {
    return null
  }
  const perMs = (last.percent - first.percent) / (last.at - first.at)
  const eta = (100 - last.percent) / perMs
  const resetIn = resetsAt ? Date.parse(resetsAt) - now : Infinity
  return eta >= resetIn ? { kind: 'ok' } : { kind: 'eta', ms: eta }
}

export function forecast(t: Strings, samples: PercentSample[], now: number, resetsAt?: string): string {
  const pace = paceOf(samples, now, resetsAt)
  if (!pace) return ''
  if (pace.kind === 'ok') return t.paceOk
  return t.paceEta(duration(pace.ms))
}

const WINDOW_NAMES: Record<string, string> = {
  five_hour: '5-hour session limit',
  seven_day: 'Weekly limit',
}

// What the usage_limits tool answers the model: the limits and the pace, whatever the band shows.
export function snapshot(limits: LimitWindow[], samples: PercentSample[], now: number): string {
  if (limits.length === 0) {
    return 'No rate-limit reading yet: it arrives with the first API response of the session, and stays empty on accounts without a Claude subscription.'
  }
  const lines = limits.map(w => {
    const reset = w.resetsAt ? `, resets in ${duration(Date.parse(w.resetsAt) - now)} (${w.resetsAt})` : ''
    return `${WINDOW_NAMES[w.kind] ?? w.kind}: ${w.percentUsed}% used${reset}`
  })

  const five = limits.find(w => w.kind === 'five_hour')
  const pace = paceOf(samples, now, five?.resetsAt)
  if (pace?.kind === 'eta') {
    lines.push(`Pace: at the last hour's rate the 5-hour limit reaches 100% in ~${duration(pace.ms)}, before it resets`)
  } else if (pace?.kind === 'ok') {
    lines.push("Pace: at the last hour's rate the 5-hour limit resets before reaching 100%")
  } else {
    lines.push('Pace: not enough readings in the last hour to estimate')
  }
  return lines.join('\n')
}

export function alertText(t: Strings, alert: Alert, limits: LimitWindow[], now: number): string {
  const name = t.names[alert.window] ?? alert.window
  if (alert.kind === 'reset') {
    return t.resetToast(name)
  }
  const reset = untilReset(t, limits.find(w => w.kind === alert.window)?.resetsAt, now)
  const icon = alert.threshold >= 90 ? '🔴' : '⚠'
  return `${icon} ${t.thresholdToast(name, Math.round(alert.percent))}${reset ? ` · ${reset}` : ''}`
}

// One short system sound; Windows and Linux terminals have no clip player.
async function chime($: EngineInterface): Promise<void> {
  try {
    if ((await $.env.get('OS')) === 'Windows_NT') {
      await $.process.run(
        [
          'powershell.exe',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "(New-Object Media.SoundPlayer 'C:\\Windows\\Media\\Windows Exclamation.wav').PlaySync()",
        ],
        { timeoutMs: 10_000 },
      )
    } else {
      await $.process.run(['afplay', '/System/Library/Sounds/Ping.aiff'], { timeoutMs: 10_000 })
    }
  } catch {
    // no player on this machine: the toast still says it
  }
}

// Keeps the windows, and a trail of the 5h reading for the forecast; with
// history on, the trail and the day's highest readings go to the store too.
async function remember($: EngineInterface, limits: LimitWindow[], isHistory: boolean): Promise<void> {
  await update($, windows, () => limits)
  const at = await $.clock.now()
  const five = limits.find(w => w.kind === 'five_hour')
  if (five) {
    await update($, fiveHour, all => {
      // a drop means the window reset: start the trail over
      const kept = all.filter(s => at - s.at <= RATE_WINDOW_MS && s.percent <= five.percentUsed)
      return [...kept, { at, percent: five.percentUsed }].slice(-MAX_SAMPLES)
    })
  }
  if (isHistory) {
    if (five) await storeFiveHour($, await read($, fiveHour))
    await storeDays($, all => addLimits(all, at, limits))
  }
}

async function announce($: EngineInterface, settings: Settings, before: LimitWindow[], after: LimitWindow[]) {
  const now = await $.clock.now()
  let shouldChime = false
  for (const alert of alertsBetween(before, after)) {
    const isWanted = alert.kind === 'reset' ? settings.resetToast : settings.thresholdToasts
    if (isWanted) {
      $.ui.toast(alertText(settings.t, alert, after, now))
    }
    if (alert.kind === 'threshold' && alert.threshold >= 90 && settings.sound90) {
      shouldChime = true
    }
  }
  if (shouldChime) {
    await chime($)
  }
}

// One row when both bars fit at a decent length, else one row per window.
function layout(columns: number, count: number): { isRow: boolean; bar: number } {
  const rowBar = Math.floor((columns - GAP * (count - 1)) / count) - FIXED_COLS
  if (rowBar >= 14) return { isRow: true, bar: Math.min(rowBar, MAX_BAR) }
  return { isRow: false, bar: Math.max(Math.min(columns - FIXED_COLS, 40), 8) }
}

export const register: Register = (on, options) => {
  const settings = settingsOf(options)
  let pendingAgentTokens = 0

  registerTasks(on, settings.t)
  registerHistory(on, settings.t, settings.history)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await startTasks($, settings.t)
    if (settings.history) {
      await startHistory($, settings.t)
      const stored = await loadHistory($)
      // a hot reload keeps the session's own figures; a new session takes the store's
      if ((await read($, burn)).length === 0) await update($, burn, () => stored.burn)
      if ((await read($, fiveHour)).length === 0) await update($, fiveHour, () => stored.fiveHour)
    }
    await $.tool.register({
      name: 'usage_limits',
      description:
        "Reports the user's Claude subscription usage limits right now: how much of the 5-hour session limit and the weekly limit is used (percent), when each resets, and the pace forecast for the 5-hour limit. Call it when the user asks about their limits or usage, or before starting large, token-heavy work.",
      inputSchema: { type: 'object', properties: {} },
    })
    const { rateLimits, cost } = await $.session.usage()
    if (rateLimits.length > 0) {
      await remember($, rateLimits, settings.history)
    }
    if (cost) {
      await update($, costUsd, () => cost.usd)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const before = await read($, windows)
      await remember($, e.rateLimits, settings.history)
      await announce($, settings, before, e.rateLimits)
    }
    if (e.changed.includes('cost') && e.cost) {
      const usd = e.cost.usd
      const before = await read($, costUsd)
      await update($, costUsd, () => usd)
      if (settings.history && before !== null && usd > before) {
        const at = await $.clock.now()
        await storeDays($, all => addCost(all, at, usd - before))
      }
    }
    return next(e)
  })

  // a RegExp, as the tool is typed only once the engine has loaded it
  on('tool.call', { tool: /^mcp__usage-limits__usage_limits$/ }, async $ => {
    const text = snapshot(await read($, windows), await read($, fiveHour), await $.clock.now())
    return { result: text }
  }).catch(() => ({ deny: 'usage_limits could not read the usage figures' }))

  on('turn.complete', async ($, e, next) => {
    if (e.usage) {
      if (e.agentId !== undefined) {
        // a subagent's spend lands in the main turn that spawned it
        pendingAgentTokens += spent(e.usage)
      } else {
        const total = spent(e.usage) + pendingAgentTokens
        pendingAgentTokens = 0
        // with history, the store's chart, so every session's turns line up in it
        const chart = settings.history ? await storeBurn($, total) : null
        await update($, burn, all => chart ?? [...all, total].slice(-MAX_SAMPLES))
        if (settings.history) {
          const at = await $.clock.now()
          await storeDays($, all => addTurn(all, at, total))
        }
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
    const all = await read($, windows)
    const shown = pick(all, settings)
    const samples = await read($, burn)
    const usd = await read($, costUsd)
    const columns = e.props.bodyColumns
    const now = await $.clock.now()

    const five = all.find(w => w.kind === 'five_hour')
    const t = settings.t
    const pace = settings.showForecast ? forecast(t, await read($, fiveHour), now, five?.resetsAt) : ''
    const cost = settings.showCost && usd !== null ? dollars(usd) : ''
    const lastTurn = samples[samples.length - 1]
    const today = settings.history ? todayTokens(await read($, days), now) : 0
    const average = samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : 0
    const hasBars = settings.showFiveHour || settings.showWeekly
    const hasInfoRow = settings.showBurn || pace !== '' || cost !== ''

    if (!hasBars && !hasInfoRow) {
      return next(e)
    }

    const { isRow, bar } = layout(columns, Math.max(shown.length, 1))
    const chartWidth = Math.max(Math.min(columns - LABEL_COLS - 60, MAX_SAMPLES), 8)
    const details = [
      settings.showBurn && lastTurn !== undefined ? t.lastTurn(tokens(lastTurn), tokens(Math.round(average))) : '',
      settings.showBurn && settings.history && today > 0 ? t.history.today(tokens(today)) : '',
      pace,
      cost ? t.cost(cost) : '',
    ].filter(Boolean)

    return (
      <Box flexDirection="column">
        {hasBars && shown.length === 0 ? (
          <Box key="waiting">
            <Text dimColor>{t.waiting}</Text>
          </Box>
        ) : null}
        {shown.length > 0 ? (
          <Box key="bars" flexDirection={isRow ? 'row' : 'column'} columnGap={GAP}>
            {shown.map(w => (
              <Box key={w.kind}>
                <Text weight="bold">{(t.labels[w.kind] ?? w.kind).padEnd(LABEL_COLS)}</Text>
                <Client
                  key={`bar-${w.kind}`}
                  module="./bar.tsx"
                  props={{ percent: w.percentUsed, width: bar, isAnimated: settings.animations }}
                  width={bar + PERCENT_COLS}
                />
                <Text dimColor>{` ${untilReset(t, w.resetsAt, now)}`.padEnd(RESET_COLS)}</Text>
              </Box>
            ))}
          </Box>
        ) : null}
        {hasInfoRow ? (
          <Box key="info">
            <Text weight="bold">{(settings.showBurn ? t.burn : t.info).padEnd(LABEL_COLS)}</Text>
            {settings.showBurn && (samples.length > 0 || e.props.isWorking) ? (
              <Client
                key="burn-chart"
                module="./burn.tsx"
                props={{ samples, isWorking: e.props.isWorking, width: chartWidth, isAnimated: settings.animations }}
              />
            ) : null}
            {settings.showBurn && samples.length === 0 && !e.props.isWorking ? <Text dimColor>{t.noTurns}</Text> : null}
            <Text dimColor>{details.length > 0 ? ` ${details.join(' · ')}` : ''}</Text>
          </Box>
        ) : null}
      </Box>
    )
  })
}
