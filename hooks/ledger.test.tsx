import { test, expect } from 'claude-code/testing'

import { applyLedger, ledgerCandidates, parseLedger, parsePlanFile, taskNumber, taskStatus } from './plan'

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

test('the ledger marks done and started tasks over unticked checkboxes', async () => {
  const tasks = applyLedger(parsePlanFile(PLAN).tasks, parseLedger(LEDGER))
  expect(tasks.map(taskStatus)).toEqual(['completed', 'in_progress', 'pending'])
  expect(tasks[0]).toEqual({ title: 'Task 1: Opcja w konfiguracji', done: 2, total: 2, status: 'completed' })

  expect(taskNumber('Task 12: Linia')).toBe(12)
  expect(taskNumber('Zadanie 3 — coś')).toBe(3)
  expect(taskNumber('Global Constraints')).toBeNull()

  expect(ledgerCandidates('C:\\repo\\docs\\plans\\compact.md')).toEqual([
    'C:/repo/docs/plans/.superpowers/sdd/compact/progress.md',
    'C:/repo/docs/.superpowers/sdd/compact/progress.md',
    'C:/repo/.superpowers/sdd/compact/progress.md',
    'C:/.superpowers/sdd/compact/progress.md',
  ])
})

test('a plan loaded with a ledger beside it shows the ledger progress', async ($, on) => {
  const files: Record<string, string> = {
    'C:/repo/docs/plans/compact.md': PLAN,
    'C:/repo/.superpowers/sdd/compact/progress.md': LEDGER,
  }
  const norm = (p: string) => p.replace(/\\/g, '/')
  on('fs.read', (_$, e) => ({ value: files[norm((e as { path: string }).path)] ?? '' }) as never)
  on('fs.exists', (_$, e) => ({ value: norm((e as { path: string }).path) in files }) as never)
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)

  await $.command.run({ command: 'zadania', args: 'C:/repo/docs/plans/compact.md', origin: 'user', presentation: {} } as never)

  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'Pane', requestId: 'zadania', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /1\/3 zadań/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✔ Task 1: Opcja w konfiguracji/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▶ Task 2: Układ jednowierszowy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /○ Task 3: Tłumaczenia/ })).toBeDefined()
  await ui.unmount()
})
