import { type Fact } from '../ir/fact.js';
import type { IRDoc, IRNode } from '../ir/types.js';
import type { RuleDef, Selector, Finding, VerifyResult } from './rule-types.js';
export type PredicateCtx = {
    doc: IRDoc;
    lock: unknown;
    fact: (path: string) => Fact<unknown> | undefined;
};
export type PredicateFn = (node: IRNode, ctx: PredicateCtx) => Omit<Finding, 'id'> | null;
export declare const getFactPath: (node: IRNode, path: string) => Fact<unknown> | undefined;
export declare const selectNodes: (doc: IRDoc, sel: Selector) => IRNode[];
export declare const runRules: (docs: IRDoc[], rules: RuleDef[], lock: unknown, predicates?: Record<string, PredicateFn>) => VerifyResult;
