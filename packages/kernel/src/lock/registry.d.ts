export declare const UI_DIRS: string[];
export declare const scanComponents: (dir: string) => Promise<Record<string, {
    file: string;
    variants: string[];
}>>;
