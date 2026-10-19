import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { parsePlan, parsePlanFile, pathOf, taskStatus } from './plan'
import { filledCells } from './tasks'

const PANE_PROPS = {
  title: 'Zadania',
  isFocused: false,
  bodyColumns: 50,
  placement: 'dock',
  scroll: { bodyRows: 20, offset: 0 },
  view: {},
} as never

// The engine's side: tools answer as core would, panes open and close.
function engine(on: On) {
  const panes: string[] = []
  on('tool.call', (_$, e) => {
    if (e.tool === 'TaskCreate') return { result: { task: { id: '7', subject: e.subject } } } as never
    if (e.tool === 'TaskUpdate') return { result: { success: true, taskId: e.taskId, updatedFields: [] } } as never
    if (e.tool === 'ExitPlanMode') return { result: { plan: PLAN, isAgent: false } } as never
    return { result: {} } as never
  })
  on('ui.panes', () => ({ value: panes.map(id => ({ id, title: 'Zadania', isShown: true, isFocused: false })) }) as never)
  on('ui.open', (_$, e) => {
    panes.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    panes.splice(panes.indexOf(e.id), 1)
    return { value: undefined } as never
  })
  return { panes }
}

const PLAN = `# Plan: pasek limitów

## Kroki
1. Dodać **toasty** przy progach
2. Dodać \`dźwięk\` przy 90%
   - szczegół, który nie jest krokiem
- [ ] Wypchnąć na GitHuba
`

async function mountPane($: Engine) {
  return $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'Pane', requestId: 'zadania', props: PANE_PROPS })
}

test('an empty pane says how tasks appear', async ($, on) => {
  engine(on)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /Brak zadań/ })).toBeDefined()
  await ui.unmount()
})

test('TodoWrite fills the pane with every status', async ($, on) => {
  engine(on)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Dodać toasty', status: 'completed', activeForm: 'Dodaję toasty' },
      { content: 'Dodać dźwięk', status: 'in_progress', activeForm: 'Dodaję dźwięk' },
      { content: 'Wypchnąć', status: 'pending', activeForm: 'Wypycham' },
    ],
  } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-limits', surface, component: 'Pane', requestId: 'zadania', props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /1\/3/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✔ Dodać toasty/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▶ Dodaję dźwięk/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /○ Wypchnąć/ })).toBeDefined()
    await ui.unmount()
  }
})

test('TaskCreate and TaskUpdate keep the list', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Napisać testy', description: '...' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '7', status: 'completed' } as never)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /✔ Napisać testy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1\/1/ })).toBeDefined()
  await ui.unmount()

  await $.tool.call({ tool: 'TaskUpdate', taskId: '7', status: 'deleted' } as never)
  const after = await mountPane($)
  expect(await after.find({ type: 'Text', text: /Brak zadań/ })).toBeDefined()
  await after.unmount()
})

test('an approved plan shows its steps until tasks are written', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'ExitPlanMode' } as never)
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /Plan: pasek limitów/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1\. Dodać toasty przy progach/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /3\. Wypchnąć na GitHuba/ })).toBeDefined()
  await ui.unmount()
})

test('/zadania opens the pane, a second /zadania closes it', async ($, on) => {
  const { panes } = engine(on)
  const run = () =>
    $.command.run({ command: 'zadania', args: '', origin: 'user', presentation: {} } as never)
  expect((await run()).text).toContain('otwarty')
  expect(panes).toEqual(['zadania'])
  expect((await run()).text).toContain('schowany')
  expect(panes).toEqual([])
})

const PLAN_FILE = `# Tryb kompaktowy — plan wdrożenia

## Global Constraints
- nie checkbox, nie krok

### Task 1: Opcja w konfiguracji
- [x] **Krok 1: Dodaj pole compact**
- [x] **Krok 2: Build**

### Task 2: Układ jednowierszowy
- [x] **Krok 1: Policz szerokości**

\`\`\`sql
- [ ] to jest kod, nie krok
\`\`\`

- [ ] **Krok 2: Narysuj paski**

### Task 3: Tłumaczenia
- [ ] **Krok 1: Krótkie etykiety**
`

test('/zadania <file> loads a plan file into the pane', async ($, on) => {
  const { panes } = engine(on)
  on('fs.read', () => ({ value: PLAN_FILE }) as never)
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }) as never)

  const { text } = await $.command.run({ command: 'zadania', args: '"C:\\plany\\plan.md"', origin: 'user', presentation: {} } as never)
  expect(text).toContain('3 zadań, 5 kroków')
  expect(panes).toEqual(['zadania'])

  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /Tryb kompaktowy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1\/3 zadań/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /kroki: 3\/5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✔ Task 1: Opcja w konfiguracji/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▶ Task 2: Układ jednowierszowy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /○ Task 3: Tłumaczenia/ })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run({ command: 'zadania', args: 'wyczyść', origin: 'user', presentation: {} } as never)).text).toContain('Zapomniałem')
})

test('a plan file Claude writes loads by itself, a plain markdown file does not', async ($, on) => {
  const { panes } = engine(on)
  const files: Record<string, string> = { 'notes.md': '# Notatki\n\n- [ ] jedna rzecz\n', 'plan.md': PLAN_FILE }
  // paths reach fs.read made absolute: match by the file's name
  const named = (path: string) => Object.entries(files).find(([name]) => path.endsWith(name))?.[1] ?? ''
  on('fs.read', (_$, e) => ({ value: named((e as { path: string }).path) }) as never)
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }) as never)

  await $.tool.call({ tool: 'Write', file_path: 'notes.md', content: files['notes.md'] } as never)
  expect(panes).toEqual([])

  await $.tool.call({ tool: 'Write', file_path: 'plan.md', content: PLAN_FILE } as never)
  expect(panes).toEqual(['zadania'])
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /Tryb kompaktowy/ })).toBeDefined()
  await ui.unmount()
})

test('a missing plan file is reported, not thrown', async ($, on) => {
  engine(on)
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  const { text } = await $.command.run({ command: 'zadania', args: 'brak.md', origin: 'user', presentation: {} } as never)
  expect(text).toContain('Nie mogę wczytać pliku brak.md')
})

test('plan file parsing', async () => {
  const parsed = parsePlanFile(PLAN_FILE)
  expect(parsed.title).toBe('Tryb kompaktowy — plan wdrożenia')
  expect(parsed.tasks).toEqual([
    { title: 'Task 1: Opcja w konfiguracji', done: 2, total: 2 },
    { title: 'Task 2: Układ jednowierszowy', done: 1, total: 2 },
    { title: 'Task 3: Tłumaczenia', done: 0, total: 1 },
  ])
  expect(parsed.tasks.map(taskStatus)).toEqual(['completed', 'in_progress', 'pending'])
  expect(pathOf(' "C:\\a b\\plan.md" ')).toBe('C:\\a b\\plan.md')
})

test('plan parsing', async () => {
  expect(parsePlan(PLAN)).toEqual({
    title: 'Plan: pasek limitów',
    steps: ['Dodać toasty przy progach', 'Dodać dźwięk przy 90%', 'Wypchnąć na GitHuba'],
  })
})

test('progress cells', async () => {
  expect(filledCells(0, 0, 10)).toBe(0)
  expect(filledCells(1, 3, 30)).toBe(10)
  expect(filledCells(3, 3, 30)).toBe(30)
})
