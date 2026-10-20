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

function slashed(path: string): string {
  return path.replace(/\\/g, '/')
}

// A plan's workspace name: its file name without .md.
export function planSlug(planPath: string): string {
  return (slashed(planPath).split('/').pop() ?? '').replace(/\.md$/i, '')
}

function ancestors(dir: string, limit: number): string[] {
  const parts = slashed(dir).replace(/\/+$/, '').split('/')
  const out: string[] = []
  for (let i = parts.length; i > 0 && out.length < limit; i--) {
    const one = parts.slice(0, i).join('/')
    if (one) out.push(one)
  }
  return out
}

// The folders that may hold a plan's workspace (<base>/<slug>/progress.md):
// .superpowers/sdd and a plain sdd beside the plan's folders, then
// .superpowers/sdd above the session's folders, since the workspace sits in
// the repo the plan runs in (a worktree), not where the plan file lives.
export function ledgerBases(planPath: string, sessionDirs: string[] = []): string[] {
  const planDir = slashed(planPath).split('/').slice(0, -1).join('/')
  const out: string[] = []
  const add = (base: string) => {
    if (!out.some(one => one.toLowerCase() === base.toLowerCase())) out.push(base)
  }
  for (const dir of ancestors(planDir, 6)) {
    add(`${dir}/.superpowers/sdd`)
    add(`${dir}/sdd`)
  }
  for (const sessionDir of sessionDirs) {
    for (const dir of ancestors(sessionDir, 6)) add(`${dir}/.superpowers/sdd`)
  }
  return out
}

// A workspace folder of this plan: its slug, or the slug with the suffix
// sdd-workspace adds when two plans share a file name.
export function isWorkspaceOf(folder: string, planPath: string): boolean {
  const name = folder.toLowerCase()
  const slug = planSlug(planPath).toLowerCase()
  return name === slug || name.startsWith(`${slug}-`)
}

// The plan a ledger names on its first line: "# SDD ledger — plan: <path>".
export function ledgerPlan(text: string): string | null {
  const first = text.split(/\r?\n/).find(line => line.trim() !== '') ?? ''
  const found = /^#\s*SDD ledger\s*[—–-]+\s*plan:\s*(.+?)\s*$/i.exec(first.trim())
  return found?.[1] ? found[1].replace(/^[`"']|[`"']$/g, '') : null
}

// Whether the ledger at ledgerPath is the given plan's: the plan its first
// line names has the same file name, or, with no such line, the workspace
// folder is the plan's.
export function isLedgerOf(ledgerPath: string, text: string, planPath: string): boolean {
  const named = ledgerPlan(text)
  if (named) return planSlug(named).toLowerCase() === planSlug(planPath).toLowerCase()
  const folder = slashed(ledgerPath).split('/').slice(-2, -1)[0] ?? ''
  return isWorkspaceOf(folder, planPath)
}

export function isLedgerPath(path: string): boolean {
  return /(^|\/)sdd\/[^/]+\/progress\.md$/i.test(slashed(path))
}

// Ledger paths a shell command names, as when it appends a line to one.
export function ledgerPathsIn(command: string): string[] {
  const found = command.match(/[^\s'"`<>|;&()]*sdd[\\/][^\s'"`<>|;&()\\/]+[\\/]progress\.md/gi) ?? []
  return [...new Set(found)]
}

// Where the plan a ledger names may be: as given when absolute, else under
// the repo the workspace is in (above .superpowers/sdd) or a folder above it.
export function planCandidates(ledgerPath: string, named: string): string[] {
  const plan = slashed(named)
  if (/^([A-Za-z]:)?\//.test(plan)) return [plan]
  const ledger = slashed(ledgerPath)
  const marker = ledger.toLowerCase().lastIndexOf('/.superpowers/sdd/')
  const roots = marker >= 0 ? [ledger.slice(0, marker)] : []
  const ledgerDir = ledger.split('/').slice(0, -1).join('/')
  for (const dir of ancestors(ledgerDir, 6)) if (!roots.includes(dir)) roots.push(dir)
  return roots.map(root => `${root}/${plan.replace(/^\.\//, '')}`)
}

// What /zadania takes as a path: quotes and spaces around it dropped.
export function pathOf(args: string): string {
  return args.trim().replace(/^["']|["']$/g, '').trim()
}
