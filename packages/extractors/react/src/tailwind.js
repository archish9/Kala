import { emptyStyleFacts } from '@fe-design/kernel/ir/types.js';
import { known } from '@fe-design/kernel/ir/fact.js';
export const DEFAULT_SCALE = {
    spacing: {
        '0': 0, '0.5': 2, '1': 4, '1.5': 6, '2': 8, '2.5': 10, '3': 12,
        '3.5': 14, '4': 16, '5': 20, '6': 24, '8': 32, '10': 40, '12': 48,
        '16': 64, '20': 80, '24': 96
    },
    text: {
        xs: 12, sm: 14, base: 16, lg: 18, xl: 20,
        '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48, '6xl': 60
    },
    radius: {
        none: 0, sm: 2, DEFAULT: 4, md: 6, lg: 8,
        xl: 12, '2xl': 16, '3xl': 24, full: 9999
    },
    weight: {
        thin: 100, light: 300, normal: 400, medium: 500,
        semibold: 600, bold: 700, extrabold: 800, black: 900
    },
    colors: {
        white: '#ffffff', black: '#000000',
        'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb',
        'gray-300': '#d1d5db', 'gray-400': '#9ca3af', 'gray-500': '#6b7280',
        'gray-600': '#4b5563', 'gray-700': '#374151', 'gray-800': '#1f2937',
        'gray-900': '#111827'
    }
};
const toPx = (raw) => {
    const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(raw.trim());
    if (!m)
        return null;
    const n = Number(m[1]);
    if (Number.isNaN(n))
        return null;
    return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
};
const arbitrary = (token) => /^\[(.+)\]$/.exec(token)?.[1] ?? null;
const box = (v) => ({ top: v, right: v, bottom: v, left: v });
export const resolveTailwindClasses = (classes, scale = DEFAULT_SCALE) => {
    const facts = emptyStyleFacts();
    const list = classes.split(/\s+/).filter(Boolean);
    facts.raw = list;
    let pad = null;
    let padOrigin = null;
    const spacingValue = (token) => {
        const arb = arbitrary(token);
        return arb ? toPx(arb) : scale.spacing[token] ?? null;
    };
    for (const cls of list) {
        const origin = { kind: 'class', raw: cls };
        const padM = /^p([xytrbl])?-(.+)$/.exec(cls);
        if (padM) {
            const v = spacingValue(padM[2]);
            if (v !== null) {
                pad ??= box(0);
                const axis = padM[1];
                if (!axis)
                    pad = box(v);
                else if (axis === 'x') {
                    pad.left = v;
                    pad.right = v;
                }
                else if (axis === 'y') {
                    pad.top = v;
                    pad.bottom = v;
                }
                else if (axis === 't')
                    pad.top = v;
                else if (axis === 'r')
                    pad.right = v;
                else if (axis === 'b')
                    pad.bottom = v;
                else if (axis === 'l')
                    pad.left = v;
                padOrigin = origin;
            }
            continue;
        }
        const gapM = /^gap-(.+)$/.exec(cls);
        if (gapM) {
            const v = spacingValue(gapM[1]);
            if (v !== null)
                facts.space.gap = known({ px: v }, origin);
            continue;
        }
        if (cls === 'border') {
            facts.shape.borderWidth = known({ px: 1 }, origin);
            continue;
        }
        const borderM = /^border-(\d+)$/.exec(cls);
        if (borderM) {
            facts.shape.borderWidth = known({ px: Number(borderM[1]) }, origin);
            continue;
        }
        const roundM = /^rounded(?:-(.+))?$/.exec(cls);
        if (roundM) {
            const key = roundM[1] ?? 'DEFAULT';
            const arb = arbitrary(key);
            const v = arb ? toPx(arb) : scale.radius[key] ?? null;
            if (v !== null)
                facts.shape.radius = known({ px: v }, origin);
            continue;
        }
        const weightM = /^font-(.+)$/.exec(cls);
        if (weightM) {
            const w = scale.weight[weightM[1]];
            if (w !== undefined) {
                facts.type.weight = known(w, origin);
                continue;
            }
        }
        const textM = /^text-(.+)$/.exec(cls);
        if (textM) {
            const key = textM[1];
            const arb = arbitrary(key);
            if (arb) {
                if (arb.startsWith('#'))
                    facts.color.fg = known({ hex: arb }, origin);
                else {
                    const px = toPx(arb);
                    if (px !== null)
                        facts.type.size = known({ px }, origin);
                }
            }
            else if (scale.text[key] !== undefined) {
                facts.type.size = known({ px: scale.text[key] }, origin);
            }
            else if (scale.colors[key] !== undefined) {
                facts.color.fg = known({ hex: scale.colors[key] }, origin);
            }
            continue;
        }
        const bgM = /^bg-(.+)$/.exec(cls);
        if (bgM) {
            const key = bgM[1];
            const hex = arbitrary(key) ?? scale.colors[key];
            if (hex)
                facts.color.bg = known({ hex }, origin);
            continue;
        }
    }
    if (pad && padOrigin)
        facts.space.padding = known(pad, padOrigin);
    return facts;
};
