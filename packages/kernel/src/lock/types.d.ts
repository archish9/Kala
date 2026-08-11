export type SourceRef = {
    path: string;
    hash: string;
};
export type DerivedZone = {
    space: number[];
    type: {
        steps: number[];
        families: Record<string, string>;
    };
    color: Record<string, string>;
    radius: number[];
    components: Record<string, {
        file: string;
        variants: string[];
    }>;
    inferred?: boolean;
};
export type IntentZone = {
    system: string | null;
    density: string | null;
    hierarchy: {
        headingJump: number;
        maxWeightsPerSurface: number;
    } | null;
    motion: {
        budget: string;
        maxDurationMs: number;
    } | null;
    banned: {
        fonts: string[];
        patterns: string[];
    };
    rationale: string | null;
};
export type Lock = {
    version: 1;
    sources: SourceRef[];
    derived: DerivedZone;
    intent: IntentZone;
};
export declare const emptyIntent: () => IntentZone;
