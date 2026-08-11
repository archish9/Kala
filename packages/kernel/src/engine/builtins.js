import { parse, wcagContrast } from 'culori';
export const contrastRatio = (a, b) => {
    const ca = parse(a), cb = parse(b);
    if (!ca || !cb)
        return NaN;
    return wcagContrast(ca, cb);
};
export const distinct = (xs) => new Set(xs.map(x => JSON.stringify(x))).size;
export const count = (xs) => xs.length;
export const nearest = (list, v) => list.reduce((best, x) => Math.abs(x - v) < Math.abs(best - v) ? x : best, list[0] ?? v);
export const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};
export const stddev = (xs) => {
    if (xs.length === 0)
        return 0;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
};
