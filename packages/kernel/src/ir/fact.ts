export type UnknownReason =
  | 'dynamic-expression'
  | 'external-stylesheet'
  | 'unresolved-call'
  | 'prop-flow'
  | 'parse-limit'

export type StyleOrigin = {
  kind: 'class' | 'inline' | 'stylesheet' | 'attribute'
  raw: string
}

export type KnownFact<T> = { state: 'known'; value: T; origin: StyleOrigin }
export type AbsentFact = { state: 'absent' }
export type UnknownFact = { state: 'unknown'; reason: UnknownReason }

export type Fact<T> = KnownFact<T> | AbsentFact | UnknownFact

export const known = <T>(value: T, origin: StyleOrigin): Fact<T> =>
  ({ state: 'known', value, origin })

export const absent = (): Fact<never> => ({ state: 'absent' })

export const unknown = (reason: UnknownReason): Fact<never> =>
  ({ state: 'unknown', reason })

export const isKnown = <T>(f: Fact<T>): f is KnownFact<T> => f.state === 'known'
export const isUnknown = <T>(f: Fact<T>): f is UnknownFact => f.state === 'unknown'
