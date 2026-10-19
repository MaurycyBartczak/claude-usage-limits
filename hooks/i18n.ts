export type Language = 'pl' | 'en'

export type Strings = {
  // bar labels, by window kind
  labels: Record<string, string>
  // window names inside a sentence (toasts), by window kind
  names: Record<string, string>
  burn: string
  info: string
  waiting: string
  noTurns: string
  resetsIn: (duration: string) => string
  resetsNow: string
  lastTurn: (last: string, average: string) => string
  paceOk: string
  paceEta: (duration: string) => string
  cost: (dollars: string) => string
  thresholdToast: (name: string, percent: number) => string
  resetToast: (name: string) => string
  // the /zadania pane
  tasks: {
    paneTitle: string
    commandDescription: string
    commandHint: string
    opened: string
    waiting: string
    closed: string
    cleared: string
    loaded: (title: string, tasks: number, steps: number) => string
    cannotLoad: (path: string, reason: string) => string
    tasksDone: string
    steps: (done: number, total: number) => string
    current: string
    empty: string[]
  }
}

export const STRINGS: Record<Language, Strings> = {
  pl: {
    labels: { five_hour: 'Sesja 5h', seven_day: 'Tydzień' },
    names: { five_hour: 'sesji 5h', seven_day: 'tygodniowy' },
    burn: 'Spalanie',
    info: 'Info',
    waiting: 'Limity: brak odczytu (pojawi się po pierwszej odpowiedzi)',
    noTurns: 'brak tur',
    resetsIn: d => `reset za ${d}`,
    resetsNow: 'reset teraz',
    lastTurn: (last, average) => `ostatnia ${last} tok · śr. ${average}`,
    paceOk: 'tempo OK do resetu',
    paceEta: d => `w tym tempie 100% za ~${d}`,
    cost: d => `koszt ${d}`,
    thresholdToast: (name, percent) => `Limit ${name}: ${percent}% zużyte`,
    resetToast: name => `✅ Limit ${name} zresetowany, możesz działać dalej`,
    tasks: {
      paneTitle: 'Zadania',
      commandDescription: 'Panel z listą zadań; /zadania <plik.md> wczytuje plan, /zadania wyczyść go zapomina',
      commandHint: '[plik planu .md | wyczyść]',
      opened: 'Panel zadań otwarty.',
      waiting: 'Panel zadań czeka na miejsce w terminalu.',
      closed: 'Panel zadań schowany.',
      cleared: 'Zapomniałem wczytany plan.',
      loaded: (title, tasks, steps) => `Wczytano plan „${title}”: ${tasks} zadań, ${steps} kroków.`,
      cannotLoad: (path, reason) => `Nie mogę wczytać pliku ${path}: ${reason}`,
      tasksDone: 'zadań',
      steps: (done, total) => `kroki: ${done}/${total}`,
      current: 'Bieżące zadania',
      empty: [
        'Brak zadań.',
        'Pojawią się, gdy Claude rozpisze pracę na zadania albo zatwierdzisz plan.',
        'Plik planu wczytasz przez /zadania ścieżka/do/planu.md',
      ],
    },
  },
  en: {
    labels: { five_hour: '5h limit', seven_day: 'Weekly' },
    names: { five_hour: '5-hour', seven_day: 'weekly' },
    burn: 'Burn',
    info: 'Info',
    waiting: 'Limits: no reading yet (arrives with the first response)',
    noTurns: 'no turns yet',
    resetsIn: d => `resets in ${d}`,
    resetsNow: 'resets now',
    lastTurn: (last, average) => `last ${last} tok · avg ${average}`,
    paceOk: 'pace OK until reset',
    paceEta: d => `at this pace 100% in ~${d}`,
    cost: d => `cost ${d}`,
    thresholdToast: (name, percent) => `${name.charAt(0).toUpperCase()}${name.slice(1)} limit: ${percent}% used`,
    resetToast: name => `✅ ${name.charAt(0).toUpperCase()}${name.slice(1)} limit has reset, you're good to go`,
    tasks: {
      paneTitle: 'Tasks',
      commandDescription: 'Task list pane; /zadania <file.md> loads a plan, /zadania clear forgets it',
      commandHint: '[plan file .md | clear]',
      opened: 'Tasks pane opened.',
      waiting: 'Tasks pane is waiting for room in the terminal.',
      closed: 'Tasks pane hidden.',
      cleared: 'Forgot the loaded plan.',
      loaded: (title, tasks, steps) => `Loaded plan "${title}": ${tasks} tasks, ${steps} steps.`,
      cannotLoad: (path, reason) => `Cannot load ${path}: ${reason}`,
      tasksDone: 'tasks',
      steps: (done, total) => `steps: ${done}/${total}`,
      current: 'Current tasks',
      empty: [
        'No tasks yet.',
        'They appear when Claude breaks the work into tasks or you approve a plan.',
        'Load a plan file with /zadania path/to/plan.md',
      ],
    },
  },
}

export function languageOf(value: unknown): Language {
  return value === 'en' ? 'en' : 'pl'
}
