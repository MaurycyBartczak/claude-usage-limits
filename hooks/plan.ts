import type { Plan, PlanTask } from '../types'

const MAX_STEPS = 40

function clean(text: string): string {
  return text
    .replace(/^\[[ xX]\]\s*/, '') // a checkbox
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim()
}

// The plan's title (its first heading) and its top-level list items as steps.
export function parsePlan(markdown: string): Plan {
  let title = ''
  const steps: string[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^#{1,3}\s+(.+)/.exec(line)
    if (heading?.[1] && !title) {
      title = clean(heading[1])
      continue
    }
    // top level only: at most one space of indent
    const item = /^ ?(?:\d+[.)]|[-*])\s+(.+)/.exec(line)
    if (item?.[1] && steps.length < MAX_STEPS) {
      steps.push(clean(item[1]))
    }
  }
  return { title, steps }
}

// A plan file's tasks: each heading with checkboxes under it is a task,
// its checkboxes the steps; ticked ones are done. Code blocks are skipped.
export function parsePlanFile(markdown: string): { title: string; tasks: PlanTask[] } {
  let title = ''
  let isInCode = false
  let current: PlanTask | null = null
  const tasks: PlanTask[] = []

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      isInCode = !isInCode
      continue
    }
    if (isInCode) continue

    const heading = /^(#{1,4})\s+(.+)/.exec(line)
    if (heading?.[1] && heading[2]) {
      if (heading[1].length === 1 && !title) {
        title = clean(heading[2])
      } else if (heading[1].length > 1) {
        current = { title: clean(heading[2]), done: 0, total: 0 }
        tasks.push(current)
      }
      continue
    }

    const box = /^\s*[-*]\s+\[([ xX])\]/.exec(line)
    if (box && current) {
      current.total += 1
      if (box[1] !== ' ') current.done += 1
    }
  }

  // only headings that hold steps are tasks
  return { title, tasks: tasks.filter(t => t.total > 0) }
}

export function taskStatus(task: PlanTask): 'completed' | 'in_progress' | 'pending' {
  if (task.status) return task.status
  if (task.done >= task.total) return 'completed'
  return task.done > 0 ? 'in_progress' : 'pending'
}

// The number a task heading carries: "Task 3: Parser" or "Zadanie 3 — …".
export function taskNumber(title: string): number | null {
  const found = /^(?:task|zadanie)\s+(\d+)\b/i.exec(title.trim())
  return found?.[1] ? Number(found[1]) : null
}

// The progress ledger subagent-driven-development keeps beside a plan
// (.superpowers/sdd/<plan>/progress.md): a task with any line of its own has
// started, one with "Task N: complete" is done.
export function parseLedger(text: string): Map<number, 'completed' | 'in_progress'> {
  const states = new Map<number, 'completed' | 'in_progress'>()
  for (const line of text.split(/\r?\n/)) {
    const found = /^Task\s+(\d+)\s*:\s*(.*)$/i.exec(line.trim())
    if (!found?.[1]) continue
    const n = Number(found[1])
    if (/^complete\b/i.test(found[2] ?? '')) {
      states.set(n, 'completed')
    } else if (states.get(n) !== 'completed') {
      states.set(n, 'in_progress')
    }
  }
  return states
}

// The ledger's word wins over the checkboxes: those are never ticked there.
export function applyLedger(tasks: PlanTask[], ledger: Map<number, 'completed' | 'in_progress'>): PlanTask[] {
  return tasks.map(task => {
    const n = taskNumber(task.title)
    const state = n === null ? undefined : ledger.get(n)
    if (state === 'completed') return { ...task, done: task.total, status: 'completed' }
    if (state === 'in_progress' && taskStatus(task) !== 'completed') return { ...task, status: 'in_progress' }
    return task
  })
}

// Where the ledger for a plan file would be, from the plan's folder up.
export function ledgerCandidates(planPath: string): string[] {
  const path = planPath.replace(/\\/g, '/')
  const name = (path.split('/').pop() ?? '').replace(/\.md$/i, '')
  const parts = path.split('/').slice(0, -1)
  const out: string[] = []
  for (let i = parts.length; i > 0 && out.length < 6; i--) {
    out.push(`${parts.slice(0, i).join('/')}/.superpowers/sdd/${name}/progress.md`)
  }
  return out
}

// What /zadania takes as a path: quotes and spaces around it dropped.
export function pathOf(args: string): string {
  return args.trim().replace(/^["']|["']$/g, '').trim()
}
