import type { ClientModule, ClientSurface } from 'claude-code'

import { colorAt } from './colors'

// `current`: tokens of the turn under way, drawn as a live bar after the samples
type Props = { samples: number[]; current?: number; isWorking: boolean; width: number; isAnimated: boolean }

type Anim = { frame: number }

const FRAME_MS = 80
const LEVELS = '▁▂▃▄▅▆▇█'
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const LIVE_WAVE = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1]

const live = new WeakMap<object, Props>()

function tick(surface: ClientSurface<Anim>): void {
  const props = live.get(surface)
  const s = surface.state
  if (!props || !s || !props.isWorking || !props.isAnimated) return
  surface.setState({ frame: s.frame + 1 })
}

export function levelOf(value: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(Math.round((value / max) * (LEVELS.length - 1)), LEVELS.length - 1)
}

const BurnChart: ClientModule<Props, Anim> = (props, surface) => {
  const { Box, Text } = surface.elements
  live.set(surface, props)

  if (surface.state === undefined) {
    surface.setState({ frame: 0 })
    surface.every(FRAME_MS, () => tick(surface))
  }

  const frame = surface.state?.frame ?? 0
  const current = props.current ?? 0
  const hasLive = props.isWorking || current > 0
  const room = hasLive ? props.width - 2 : props.width
  const samples = props.samples.slice(-Math.max(room, 1))
  const max = Math.max(...samples, current, 1)
  const liveBar = current > 0 ? LEVELS[levelOf(current, max)] : LEVELS[LIVE_WAVE[frame % LIVE_WAVE.length] ?? 0]

  return (
    <Box>
      <Text>
        {samples.map((v, i) => {
          const level = levelOf(v, max)
          return (
            <Text key={String(i)} color={colorAt((level / (LEVELS.length - 1)) * 100)}>
              {LEVELS[level]}
            </Text>
          )
        })}
        {current > 0 && !(props.isWorking && props.isAnimated) ? <Text color="claude">{liveBar}</Text> : null}
        {props.isWorking && !props.isAnimated ? <Text color="claude">…</Text> : null}
        {props.isWorking && props.isAnimated ? (
          <Text>
            <Text color="claude">{liveBar}</Text>
            <Text color="claude" weight="bold">{SPINNER[frame % SPINNER.length]}</Text>
          </Text>
        ) : null}
      </Text>
    </Box>
  )
}

export default BurnChart
