import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { DayRecord, LimitWindow, PercentSample } from '../types'
import { colorAt } from './colors'
import type { Strings } from './i18n'

const PANE = 'limity'
const MAX_DAYS = 35
const SHOWN_DAYS = 14
const MAX_BURN = 40
const RATE_WINDOW_MS = 60 * 60_000

const days = atom({ plugin: 'usage-limits', key: 'days' } as const, [])

// The day a moment falls on, in the machine's local time: "2026-10-19".
export function dayKey(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function emptyDay(day: string): DayRecord {
  return { day, tokens: 0, turns: 0, cost: 0, fiveMax: null, weekMax: null }
}

// Applies a change to one day's record, keeping the list sorted and short.
export function withDay(all: DayRecord[], day: string, change: (d: DayRecord) => DayRecord): DayRecord[] {
  const found = all.find(d => d.day === day) ?? emptyDay(day)
  const rest = all.filter(d => d.day !== day)
  return [...rest, change(found)].sort((a, b) => a.day.localeCompare(b.day)).slice(-MAX_DAYS)
}

export function addTurn(all: DayRecord[], at: number, tokens: number): DayRecord[] {
  return withDay(all, dayKey(at), d => ({ ...d, tokens: d.tokens + tokens, turns: d.turns + 1 }))
}

export function addCost(all: DayRecord[], at: number, usd: number): DayRecord[] {
  return withDay(all, dayKey(at), d => ({ ...d, cost: d.cost + usd }))
}

export function addLimits(all: DayRecord[], at: number, limits: LimitWindow[]): DayRecord[] {
  const five = limits.find(w => w.kind === 'five_hour')?.percentUsed
  const week = limits.find(w => w.kind === 'seven_day')?.percentUsed
  return withDay(all, dayKey(at), d => ({
    ...d,
    fiveMax: five === undefined ? d.fiveMax : Math.max(d.fiveMax ?? 0, five),
    weekMax: week === undefined ? d.weekMax : Math.max(d.weekMax ?? 0, week),
  }))
}

// The store is shared by every session: each write reads it first, so two
// sessions add up rather than overwrite each other. History is a nicety: a
// store that fails costs the history alone, never the band or the alerts.
export async function storeDays($: EngineInterface, change: (all: DayRecord[]) => DayRecord[]): Promise<void> {
  try {
    const before = ((await $.store.get('days')) as DayRecord[] | undefined) ?? []
    const after = change(before)
    await $.store.set('days', after)
    await update($, days, () => after)
  } catch {
    // keep going without history
  }
}

// The chart with this turn added, or null when the store failed.
export async function storeBurn($: EngineInterface, tokens: number): Promise<number[] | null> {
  try {
    const before = ((await $.store.get('burn')) as number[] | undefined) ?? []
    const after = [...before, tokens].slice(-MAX_BURN)
    await $.store.set('burn', after)
    return after
  } catch {
    return null
  }
}

export async function storeFiveHour($: EngineInterface, samples: PercentSample[]): Promise<void> {
  try {
    await $.store.set('fiveHour', samples)
  } catch {
    // keep going without history
  }
}

// What the last sessions left: the burn chart, the forecast's trail, the days.
export async function loadHistory($: EngineInterface): Promise<{ burn: number[]; fiveHour: PercentSample[] }> {
  try {
    const now = await $.clock.now()
    const stored = ((await $.store.get('days')) as DayRecord[] | undefined) ?? []
    await update($, days, () => stored)
    const burn = ((await $.store.get('burn')) as number[] | undefined) ?? []
    const trail = ((await $.store.get('fiveHour')) as PercentSample[] | undefined) ?? []
    return { burn, fiveHour: trail.filter(s => now - s.at <= RATE_WINDOW_MS) }
  } catch {
    return { burn: [], fiveHour: [] }
  }
}

export async function startHistory($: EngineInterface, t: Strings): Promise<void> {
  await $.command.register({ name: 'limity', description: t.history.commandDescription })
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

// The last `count` calendar days up to today, oldest first, empty ones included.
export function lastDays(all: DayRecord[], now: number, count: number): DayRecord[] {
  const today = new Date(now)
  const out: DayRecord[] = []
  for (let i = count - 1; i >= 0; i--) {
    const at = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i, 12).getTime()
    const key = dayKey(at)
    out.push(all.find(d => d.day === key) ?? emptyDay(key))
  }
  return out
}

export function registerHistory(on: On, t: Strings, isEnabled: boolean): void {
  on('command.run', { command: 'limity' }, async $ => {
    if (!isEnabled) return { text: t.history.disabled }
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      return { text: t.history.closed }
    }
    const { isPlaced } = await $.ui.open({ id: PANE, title: t.history.paneTitle })
    return { text: isPlaced ? t.history.opened : t.history.waiting }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const shown = lastDays(await read($, days), now, SHOWN_DAYS)
    const max = Math.max(...shown.map(d => d.tokens), 1)
    // "pon 19.10 " + bar + " 412k 5h 87% 7d 34% $7.11"
    const barWidth = Math.max(Math.min(e.props.bodyColumns - 40, 30), 6)

    if (shown.every(d => d.turns === 0)) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{t.history.empty}</Text>
        </Box>
      )
    }

    const week = shown.slice(-7)
    const weekTokens = week.reduce((n, d) => n + d.tokens, 0)
    const weekCost = week.reduce((n, d) => n + d.cost, 0)
    const activeDays = week.filter(d => d.turns > 0).length

    return (
      <Box flexDirection="column">
        <Text weight="bold">{t.history.title(SHOWN_DAYS)}</Text>
        {shown.map(d => {
          const date = new Date(`${d.day}T12:00:00`)
          const label = `${(t.history.weekdays[date.getDay()] ?? '').padEnd(3)} ${d.day.slice(8, 10)}.${d.day.slice(5, 7)} `
          const filled = Math.round((d.tokens / max) * barWidth)
          const isToday = d.day === dayKey(now)
          return (
            <Text key={d.day}>
              <Text weight={isToday ? 'bold' : 'regular'} dimColor={d.turns === 0}>
                {label}
              </Text>
              <Text color={colorAt((d.tokens / max) * 100)}>{'━'.repeat(filled)}</Text>
              <Text dimColor>{'─'.repeat(barWidth - filled)}</Text>
              {d.turns > 0 ? (
                <Text>
                  {` ${tokens(d.tokens).padStart(5)}`}
                  <Text dimColor>{d.fiveMax !== null ? ` 5h ${String(Math.round(d.fiveMax)).padStart(3)}%` : '        '}</Text>
                  <Text dimColor>{d.weekMax !== null ? ` 7d ${String(Math.round(d.weekMax)).padStart(3)}%` : ''}</Text>
                  <Text dimColor>{d.cost > 0 ? ` $${d.cost.toFixed(2)}` : ''}</Text>
                </Text>
              ) : (
                <Text dimColor>{'     —'}</Text>
              )}
            </Text>
          )
        })}
        <Text dimColor>
          {t.history.weekTotal(tokens(weekTokens), tokens(Math.round(weekTokens / Math.max(activeDays, 1))), `$${weekCost.toFixed(2)}`)}
        </Text>
      </Box>
    )
  })
}

export function todayTokens(all: DayRecord[], now: number): number {
  return all.find(d => d.day === dayKey(now))?.tokens ?? 0
}
