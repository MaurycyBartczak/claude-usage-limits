export type LimitWindow = { kind: string; percentUsed: number; resetsAt?: string }

export type PercentSample = { at: number; percent: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-limits': {
      windows: LimitWindow[]
      burn: number[]
      fiveHour: PercentSample[]
    }
  }
}
