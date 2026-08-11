export type EvalResult = {
    state: 'value';
    value: unknown;
} | {
    state: 'unknown';
};
export type EvalContext = {
    self?: unknown;
    other?: unknown;
    collected?: unknown[];
    lock?: unknown;
    surface?: unknown;
};
export type Expr = string | number | boolean | null | readonly unknown[] | {
    gte: [Expr, Expr];
} | {
    lte: [Expr, Expr];
} | {
    eq: [Expr, Expr];
} | {
    in: [Expr, Expr];
} | {
    allIn: [Expr, Expr];
} | {
    anyIn: [Expr, Expr];
} | {
    not: Expr;
} | {
    and: Expr[];
} | {
    or: Expr[];
};
export declare const evaluate: (expr: Expr, ctx: EvalContext) => EvalResult;
