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
  if (task.done >= task.total) return 'completed'
  return task.done > 0 ? 'in_progress' : 'pending'
}

// What /zadania takes as a path: quotes and spaces around it dropped.
export function pathOf(args: string): string {
  return args.trim().replace(/^["']|["']$/g, '').trim()
}
