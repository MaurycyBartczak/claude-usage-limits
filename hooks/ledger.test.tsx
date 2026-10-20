import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import {
  applyLedger,
  isLedgerOf,
  ledgerBases,
  ledgerPathsIn,
  ledgerPlan,
  parseLedger,
  parsePlanFile,
  planCandidates,
  taskNumber,
  taskStatus,
} from './plan'

const PLAN = `# Tryb kompaktowy — plan wdrożenia

### Task 1: Opcja w konfiguracji
- [ ] **Step 1:** pole compact
- [ ] **Step 2:** commit

### Task 2: Układ jednowierszowy
- [ ] **Step 1:** szerokości
- [ ] **Step 2:** commit

### Task 3: Tłumaczenia
- [ ] **Step 1:** etykiety
`

// The ledger as subagent-driven-development writes it: rulings, a done task,
// a started one.
const LEDGER = `# SDD ledger — plan: docs/plans/compact.md
Setup: Ruling: work on a branch
Task 1: Ruling: kept the old option name
Task 1: complete (commits a1..b2, tests pass)
Task 2: BASE b2
`

const PANE_PROPS = {
  title: 'Zadania',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { bodyRows: 20, offset: 0 },
  view: {},
} as never

const norm = (p: string) => p.replace(/\\/g, '/')

// The engine's side: files in memory, folders listed from them, the session
// in `cwd`, panes that open.
function engine(on: On, files: Record<string, string>, cwd = '/home/me') {
  on('fs.read', (_$, e) => {
    const path = norm((e as { path: string }).path)
    if (!(path in files)) throw new Error(`ENOENT: ${path}`)
    return { value: files[path] } as never
  })
  on('fs.exists', (_$, e) => ({ value: norm((e as { path: string }).path) in files }) as never)
  on('fs.stat', (_$, e) => {
    const path = norm((e as { path: string }).path)
    if (!(path in files)) throw new Error(`ENOENT: ${path}`)
    return { value: { kind: 'file', size: 1, mtimeMs: files[path]?.length ?? 1, isLink: false } } as never
  })
  on('fs.list', (_$, e) => {
    const dir = `${norm((e as { path: string }).path)}/`
    const names = new Set<string>()
    for (const path of Object.keys(files)) {
      if (!path.startsWith(dir)) continue
      const rest = path.slice(dir.length).split('/')
      if (rest.length > 1 && rest[0]) names.add(rest[0])
    }
    if (names.size === 0) throw new Error(`ENOENT: ${dir}`)
    return { value: [...names].map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })) } as never
  })
  on('session.cwd', () => ({ value: cwd }) as never)
  on('session.root', () => ({ value: cwd }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('tool.call', () => ({ result: {} }) as never)
}

async function showsLedgerProgress($: Engine) {
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'Pane', requestId: 'zadania', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /1\/3 zadań/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✔ Task 1: Opcja w konfiguracji/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▶ Task 2: Układ jednowierszowy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /○ Task 3: Tłumaczenia/ })).toBeDefined()
  await ui.unmount()
}

const load = (path: string) => ({ command: 'zadania', args: path, origin: 'user', presentation: {} }) as never

test('the ledger marks done and started tasks over unticked checkboxes', async () => {
  const tasks = applyLedger(parsePlanFile(PLAN).tasks, parseLedger(LEDGER))
  expect(tasks.map(taskStatus)).toEqual(['completed', 'in_progress', 'pending'])
  expect(tasks[0]).toEqual({ title: 'Task 1: Opcja w konfiguracji', done: 2, total: 2, status: 'completed' })

  expect(taskNumber('Task 12: Linia')).toBe(12)
  expect(taskNumber('Zadanie 3 — coś')).toBe(3)
  expect(taskNumber('Global Constraints')).toBeNull()
})

test('where a ledger may be, and whose it is', async () => {
  expect(ledgerBases('C:\\repo\\docs\\plans\\compact.md', ['D:/work/tree/app'])).toEqual([
    'C:/repo/docs/plans/.superpowers/sdd',
    'C:/repo/docs/plans/sdd',
    'C:/repo/docs/.superpowers/sdd',
    'C:/repo/docs/sdd',
    'C:/repo/.superpowers/sdd',
    'C:/repo/sdd',
    'C:/.superpowers/sdd',
    'C:/sdd',
    'D:/work/tree/app/.superpowers/sdd',
    'D:/work/tree/.superpowers/sdd',
    'D:/work/.superpowers/sdd',
    'D:/.superpowers/sdd',
  ])

  expect(ledgerPlan(LEDGER)).toBe('docs/plans/compact.md')
  expect(ledgerPlan('Task 1: complete')).toBeNull()
  expect(isLedgerOf('/w/.superpowers/sdd/compact/progress.md', LEDGER, 'C:\\other\\Compact.md')).toBe(true)
  expect(isLedgerOf('/w/.superpowers/sdd/compact/progress.md', '# SDD ledger — plan: docs/inny.md', '/p/compact.md')).toBe(false)
  expect(isLedgerOf('/w/.superpowers/sdd/compact-plans/progress.md', 'Task 1: complete', '/p/compact.md')).toBe(true)
  expect(isLedgerOf('/w/.superpowers/sdd/compactor/progress.md', 'Task 1: complete', '/p/compact.md')).toBe(false)

  expect(ledgerPathsIn(`echo "Task 2: complete" >> "C:\\w\\.superpowers\\sdd\\compact\\progress.md"`)).toEqual([
    'C:\\w\\.superpowers\\sdd\\compact\\progress.md',
  ])
  expect(ledgerPathsIn('cat .superpowers/sdd/compact/progress.md; git log')).toEqual(['.superpowers/sdd/compact/progress.md'])
  expect(ledgerPathsIn('git status')).toEqual([])

  expect(planCandidates('/w/tree/.superpowers/sdd/compact/progress.md', 'docs/plans/compact.md')[0]).toBe('/w/tree/docs/plans/compact.md')
  expect(planCandidates('/w/tree/.superpowers/sdd/compact/progress.md', 'C:\\p\\compact.md')).toEqual(['C:/p/compact.md'])
})

test('a ledger beside the plan shows its progress', async ($, on) => {
  engine(on, {
    '/repo/docs/plans/compact.md': PLAN,
    '/repo/.superpowers/sdd/compact/progress.md': LEDGER,
  })
  await $.command.run(load('/repo/docs/plans/compact.md'))
  await showsLedgerProgress($)
})

test('a ledger in the worktree the session runs in, far from the plan, shows its progress', async ($, on) => {
  engine(
    on,
    {
      '/home/me/notes/docs/plans/compact.md': PLAN,
      '/home/me/worktrees/app/.superpowers/sdd/compact/progress.md': LEDGER,
    },
    '/home/me/worktrees/app/src',
  )
  await $.command.run(load('/home/me/notes/docs/plans/compact.md'))
  await showsLedgerProgress($)
})

test('a suffixed workspace and an sdd folder beside plans are found; another plan’s ledger is not', async ($, on) => {
  engine(on, {
    '/repo/docs/plans/compact.md': PLAN,
    '/repo/.superpowers/sdd/compact/progress.md': '# SDD ledger — plan: other/compact-old.md\nTask 1: complete\nTask 2: complete\nTask 3: complete\n',
    '/repo/.superpowers/sdd/compact-plans/progress.md': LEDGER,
  })
  await $.command.run(load('/repo/docs/plans/compact.md'))
  await showsLedgerProgress($)
})

test('a plain sdd folder beside the plans folder holds the ledger', async ($, on) => {
  engine(on, {
    '/repo/docs/superpowers/plans/compact.md': PLAN,
    '/repo/docs/superpowers/sdd/compact/progress.md': LEDGER,
  })
  await $.command.run(load('/repo/docs/superpowers/plans/compact.md'))
  await showsLedgerProgress($)
})

test('a ledger Claude writes loads the plan it names, and a shell append updates it', async ($, on) => {
  const files: Record<string, string> = {
    '/elsewhere/docs/plans/compact.md': PLAN,
    '/tree/.superpowers/sdd/compact/progress.md': '# SDD ledger — plan: /elsewhere/docs/plans/compact.md\nTask 1: BASE a1\n',
  }
  engine(on, files, '/somewhere/else')

  await $.tool.call({ tool: 'Write', file_path: '/tree/.superpowers/sdd/compact/progress.md', content: '' } as never)
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'Pane', requestId: 'zadania', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /▶ Task 1: Opcja w konfiguracji/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /0\/3 zadań/ })).toBeDefined()
  await ui.unmount()

  files['/tree/.superpowers/sdd/compact/progress.md'] = LEDGER.replace('docs/plans/compact.md', '/elsewhere/docs/plans/compact.md')
  await $.tool.call({ tool: 'Bash', command: 'echo "Task 2: BASE b2" >> /tree/.superpowers/sdd/compact/progress.md' } as never)
  await showsLedgerProgress($)
})
