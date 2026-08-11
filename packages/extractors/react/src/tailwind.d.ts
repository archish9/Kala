import { type StyleFacts } from '@fe-design/kernel/ir/types.js';
export type TailwindScale = {
    spacing: Record<string, number>;
    text: Record<string, number>;
    radius: Record<string, number>;
    weight: Record<string, number>;
    colors: Record<string, string>;
};
export declare const DEFAULT_SCALE: TailwindScale;
export declare const resolveTailwindClasses: (classes: string, scale?: TailwindScale) => StyleFacts;
