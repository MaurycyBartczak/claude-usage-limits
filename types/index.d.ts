export type LimitWindow = { kind: string; percentUsed: number; resetsAt?: string }

export type PercentSample = { at: number; percent: number }

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type Task = { id: string; subject: string; status: TaskStatus; activeForm?: string }

export type Plan = { title: string; steps: string[] }

export type PlanTask = { title: string; done: number; total: number }

export type PlanFile = { path: string; title: string; tasks: PlanTask[]; mtimeMs: number }

// One day of use, summed over every session: "2026-10-19", local time.
export type DayRecord = {
  day: string
  tokens: number
  turns: number
  cost: number
  fiveMax: number | null
  weekMax: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'usage-limits': {
      windows: LimitWindow[]
      burn: number[]
      fiveHour: PercentSample[]
      costUsd: number | null
      tasks: Task[]
      plan: Plan | null
      planFile: PlanFile | null
      days: DayRecord[]
    }
  }
}
