import type { IRDoc, IRNode } from './types.js';
export declare const nodeById: (doc: IRDoc, id: string) => IRNode | undefined;
export declare const ancestors: (doc: IRDoc, nodeId: string) => IRNode[];
