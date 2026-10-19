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
  },
}

export function languageOf(value: unknown): Language {
  return value === 'en' ? 'en' : 'pl'
}
