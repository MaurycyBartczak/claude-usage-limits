import type { ClientModule, ClientSurface } from 'claude-code'

import { colorAt } from './colors'

type Props = { percent: number; width: number }

type Anim = { shown: number; phase: number }

const FRAME_MS = 40
const SWEEP_EVERY = 90 // ticks between shimmer sweeps (~3.6s)
const PULSE_TICKS = 12 // ~0.5s per pulse half

const live = new WeakMap<object, Props>()

function tick(surface: ClientSurface<Anim>): void {
  const props = live.get(surface)
  const s = surface.state
  if (!props || !s) return

  const phase = (s.phase + 1) % SWEEP_EVERY
  const diff = props.percent - s.shown
  const shown = Math.abs(diff) < 0.1 ? props.percent : s.shown + diff * 0.15
  const isMoving = shown !== s.shown
  const isSweeping = phase <= props.width + 3
  const isPulsing = props.percent >= 90 && phase % PULSE_TICKS === 0

  if (isMoving || isSweeping || isPulsing) {
    surface.setState({ shown, phase })
  } else {
    // advance the phase without a redraw while idle
    s.phase = phase
  }
}

const UsageBar: ClientModule<Props, Anim> = (props, surface) => {
  const { Box, Text } = surface.elements
  live.set(surface, props)

  if (surface.state === undefined) {
    surface.setState({ shown: 0, phase: SWEEP_EVERY - 1 })
    surface.every(FRAME_MS, () => tick(surface))
  }

  const { shown, phase } = surface.state ?? { shown: 0, phase: 0 }
  const width = props.width
  const exact = (Math.min(Math.max(shown, 0), 100) / 100) * width
  const full = Math.floor(exact)
  const hasHalf = exact - full >= 0.5
  const shimmerAt = phase - 2

  // Group consecutive cells of one style into one Text.
  const runs: { text: string; color: string; isBright: boolean }[] = []
  for (let i = 0; i < full; i++) {
    const color = colorAt(((i + 0.5) / width) * 100)
    const isBright = Math.abs(i - shimmerAt) <= 1
    const last = runs[runs.length - 1]
    if (last && last.color === color && last.isBright === isBright) {
      last.text += '━'
    } else {
      runs.push({ text: '━', color, isBright })
    }
  }
  if (hasHalf) {
    runs.push({ text: '╸', color: colorAt(((full + 0.5) / width) * 100), isBright: false })
  }
  const empty = Math.max(width - full - (hasHalf ? 1 : 0), 0)

  const isPulseOn = props.percent >= 90 && Math.floor(phase / PULSE_TICKS) % 2 === 0

  return (
    <Box>
      <Text>
        {runs.map((r, i) => (
          <Text key={String(i)} color={r.isBright ? '#ffffff' : r.color} weight={r.isBright ? 'bold' : 'regular'}>
            {r.text}
          </Text>
        ))}
        <Text dimColor>{'─'.repeat(empty)}</Text>
        <Text color={colorAt(props.percent)} weight={isPulseOn ? 'bold' : 'regular'} inverse={isPulseOn}>
          {` ${String(Math.round(shown)).padStart(3)}%`}
        </Text>
      </Text>
    </Box>
  )
}

export default UsageBar
