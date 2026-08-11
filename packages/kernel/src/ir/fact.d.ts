export type UnknownReason = 'dynamic-expression' | 'external-stylesheet' | 'unresolved-call' | 'prop-flow' | 'parse-limit';
export type StyleOrigin = {
    kind: 'class' | 'inline' | 'stylesheet' | 'attribute';
    raw: string;
};
export type KnownFact<T> = {
    state: 'known';
    value: T;
    origin: StyleOrigin;
};
export type AbsentFact = {
    state: 'absent';
};
export type UnknownFact = {
    state: 'unknown';
    reason: UnknownReason;
};
export type Fact<T> = KnownFact<T> | AbsentFact | UnknownFact;
export declare const known: <T>(value: T, origin: StyleOrigin) => Fact<T>;
export declare const absent: () => Fact<never>;
export declare const unknown: (reason: UnknownReason) => Fact<never>;
export declare const isKnown: <T>(f: Fact<T>) => f is KnownFact<T>;
export declare const isUnknown: <T>(f: Fact<T>) => f is UnknownFact;
