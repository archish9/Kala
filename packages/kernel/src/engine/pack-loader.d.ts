import type { RuleDef, Degraded } from './rule-types.js';
export declare const loadPack: (dir: string) => Promise<{
    rules: RuleDef[];
    degraded: Degraded[];
}>;
