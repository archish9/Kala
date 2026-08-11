import { type Lock, type IntentZone } from './types.js';
import type { Degraded } from '../engine/rule-types.js';
export declare const deriveLock: (dir: string, intent?: Partial<IntentZone>) => Promise<{
    lock: Lock | null;
    degraded: Degraded[];
}>;
