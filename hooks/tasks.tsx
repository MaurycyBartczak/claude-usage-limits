import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { PlanFile, Task } from '../types'
import type { Strings } from './i18n'
import { parsePlan, parsePlanFile, pathOf, taskStatus } from './plan'

const PANE = 'zadania'
const WATCH_MS = 3000
const MIN_PLAN_TASKS = 2
const CLEAR_WORDS = ['wyczyść', 'wyczysc', 'clear']

const tasks = atom({ plugin: 'usage-limits', key: 'tasks' } as const, [])
const plan = atom({ plugin: 'usage-limits', key: 'plan' } as const, null)
const planFile = atom({ plugin: 'usage-limits', key: 'planFile' } as const, null)

const MARKS = { completed: '✔', in_progress: '▶', pending: '○' } as const

export function filledCells(done: number, total: number, width: number): number {
  return total > 0 ? Math.round((done / total) * width) : 0
}

async function loadPlanFile($: EngineInterface, path: string): Promise<PlanFile> {
  const text = await $.fs.read(path)
  const { mtimeMs } = await $.fs.stat(path)
  const parsed = parsePlanFile(text)
  return { path, title: parsed.title, tasks: parsed.tasks, mtimeMs }
}

// Re-reads the loaded plan file when it changed on disk (a ticked step).
async function refreshPlanFile($: EngineInterface): Promise<void> {
  const loaded = await read($, planFile)
  if (!loaded) return
  try {
    const { mtimeMs } = await $.fs.stat(loaded.path)
    if (mtimeMs !== loaded.mtimeMs) {
      const fresh = await loadPlanFile($, loaded.path)
      await update($, planFile, () => fresh)
    }
  } catch {
    // the file moved or is mid-write: keep what is shown, try next tick
  }
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()
  return norm(a) === norm(b)
}

async function openPane($: EngineInterface, t: Strings): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) return true
  return (await $.ui.open({ id: PANE, title: t.tasks.paneTitle })).isPlaced
}

// A markdown file Claude wrote, edited or read becomes the shown plan when it
// looks like one: at least two headings with checkbox steps.
async function adoptPlanFile($: EngineInterface, t: Strings, path: string): Promise<void> {
  const loaded = await loadPlanFile($, path)
  if (loaded.tasks.length < MIN_PLAN_TASKS) return
  const before = await read($, planFile)
  await update($, planFile, () => loaded)
  if (!before || !samePath(before.path, path)) {
    await openPane($, t)
  }
}

// The session-start half of the pane, called from the module's one
// session.start hook: the command and the plan file's watch.
export async function startTasks($: EngineInterface, t: Strings): Promise<void> {
  await $.command.register({
    name: 'zadania',
    description: t.tasks.commandDescription,
    argumentHint: t.tasks.commandHint,
  })
  $.clock.every(WATCH_MS, () => {
    void refreshPlanFile($)
  })
}

// The /zadania pane: tasks Claude writes, an approved plan, a plan file.
export function registerTasks(on: On, t: Strings): void {
  on('command.run', { command: 'zadania' }, async ($, e) => {
    const arg = pathOf(e.args)

    if (CLEAR_WORDS.includes(arg)) {
      await update($, planFile, () => null)
      return { text: t.tasks.cleared }
    }

    if (arg) {
      try {
        const loaded = await loadPlanFile($, arg)
        await update($, planFile, () => loaded)
        await openPane($, t)
        const steps = loaded.tasks.reduce((n, task) => n + task.total, 0)
        return { text: t.tasks.loaded(loaded.title || arg, loaded.tasks.length, steps) }
      } catch (error) {
        return { text: t.tasks.cannotLoad(arg, error instanceof Error ? error.message : String(error)) }
      }
    }

    // a bare /zadania toggles the pane
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      return { text: t.tasks.closed }
    }
    const isPlaced = await openPane($, t)
    return { text: isPlaced ? t.tasks.opened : t.tasks.waiting }
  })

  // The whole list, each time the model writes it.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      const list: Task[] = e.todos.map((todo, i) => ({
        id: String(i),
        subject: todo.content,
        status: todo.status,
        activeForm: todo.activeForm,
      }))
      await update($, tasks, () => list)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      const created = ran.result.task
      const task: Task = { id: created.id, subject: created.subject, status: 'pending', activeForm: e.activeForm }
      await update($, tasks, list => [...list.filter(one => one.id !== task.id), task])
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError && ran.result.success) {
      const { taskId, status, subject, activeForm } = e
      await update($, tasks, list => {
        if (status === 'deleted') return list.filter(one => one.id !== taskId)
        return list.map(one =>
          one.id === taskId
            ? {
                ...one,
                subject: subject ?? one.subject,
                activeForm: activeForm ?? one.activeForm,
                status: status ?? one.status,
              }
            : one,
        )
      })
    }
    return ran
  }).catch(($, e, next) => next(e))

  // An approved plan: its file when it has checkbox steps, else its list items
  // stand in until the model writes tasks.
  on('tool.call', { tool: 'ExitPlanMode' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError && ran.result.plan) {
      const parsed = parsePlan(ran.result.plan)
      await update($, plan, () => parsed)
      await update($, tasks, () => [])
      if (ran.result.filePath) {
        await adoptPlanFile($, t, ran.result.filePath)
      }
      await openPane($, t)
    }
    return ran
  }).catch(($, e, next) => next(e))

  // A plan file Claude writes, edits or opens loads by itself.
  on('tool.call', { tool: /^(Write|Edit|Read)$/ }, async ($, e, next) => {
    const ran = await next(e)
    const path = (e as { file_path?: unknown }).file_path
    if (ran.deny === undefined && !ran.isError && typeof path === 'string' && /\.md$/i.test(path)) {
      await adoptPlanFile($, t, path)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, tasks)
    const current = await read($, plan)
    const file = await read($, planFile)
    const width = Math.max(e.props.bodyColumns, 20)
    const barWidth = Math.max(Math.min(width - 22, 30), 6)

    const progress = (done: number, total: number, label: string) => {
      const filled = filledCells(done, total, barWidth)
      return (
        <Text>
          <Text color="success">{'━'.repeat(filled)}</Text>
          <Text dimColor>{'─'.repeat(barWidth - filled)}</Text>
          <Text>{` ${done}/${total}${label ? ` ${label}` : ''}`}</Text>
        </Text>
      )
    }

    const fileSection = file ? (
      <Box key="file" flexDirection="column">
        <Text weight="bold" wrap="truncate-end">
          {file.title || file.path}
        </Text>
        {progress(file.tasks.filter(task => taskStatus(task) === 'completed').length, file.tasks.length, t.tasks.tasksDone)}
        <Text dimColor>
          {t.tasks.steps(
            file.tasks.reduce((n, task) => n + task.done, 0),
            file.tasks.reduce((n, task) => n + task.total, 0),
          )}
        </Text>
        {file.tasks.map((task, i) => {
          const status = taskStatus(task)
          return (
            <Box key={`file-${i}`} flexDirection="row">
              <Box flexGrow={1} flexShrink={1}>
                {status === 'completed' ? (
                  <Text color="success" wrap="truncate-end">
                    {MARKS.completed} <Text dimColor strikethrough>{task.title}</Text>
                  </Text>
                ) : status === 'in_progress' ? (
                  <Text color="claude" weight="bold" wrap="truncate-end">
                    {MARKS.in_progress} {task.title}
                  </Text>
                ) : (
                  <Text wrap="truncate-end">
                    <Text dimColor>{MARKS.pending}</Text> {task.title}
                  </Text>
                )}
              </Box>
              <Text dimColor>{` ${task.done}/${task.total}`}</Text>
            </Box>
          )
        })}
      </Box>
    ) : null

    const done = list.filter(task => task.status === 'completed').length
    const tasksSection =
      list.length > 0 ? (
        <Box key="tasks" flexDirection="column" marginTop={file ? 1 : 0}>
          {file ? (
            <Text weight="bold">{t.tasks.current}</Text>
          ) : current?.title ? (
            <Text weight="bold">{current.title}</Text>
          ) : null}
          {progress(done, list.length, '')}
          {list.map(task => (
            <Box key={`task-${task.id}`}>
              {task.status === 'completed' ? (
                <Text color="success">
                  {MARKS.completed} <Text dimColor strikethrough>{task.subject}</Text>
                </Text>
              ) : task.status === 'in_progress' ? (
                <Text color="claude" weight="bold">
                  {MARKS.in_progress} {task.activeForm || task.subject}
                </Text>
              ) : (
                <Text>
                  <Text dimColor>{MARKS.pending}</Text> {task.subject}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      ) : null

    const planSection =
      !file && list.length === 0 && current && current.steps.length > 0 ? (
        <Box key="plan" flexDirection="column">
          <Text weight="bold">{current.title || 'Plan'}</Text>
          {current.steps.map((step, i) => (
            <Text key={`step-${i}`}>
              <Text dimColor>{`${String(i + 1).padStart(2)}. `}</Text>
              {step}
            </Text>
          ))}
        </Box>
      ) : null

    if (!fileSection && !tasksSection && !planSection) {
      return (
        <Box flexDirection="column">
          {t.tasks.empty.map((line, i) => (
            <Text key={`empty-${i}`} dimColor>
              {line}
            </Text>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {fileSection}
        {tasksSection}
        {planSection}
      </Box>
    )
  })
}
