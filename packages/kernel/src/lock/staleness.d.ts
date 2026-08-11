import type { Lock, SourceRef } from './types.js';
export declare const hashSources: (dir: string, paths: string[]) => Promise<SourceRef[]>;
export declare const checkStale: (lock: Lock, dir: string) => Promise<{
    stale: boolean;
    changed: string[];
}>;
