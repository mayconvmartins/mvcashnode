export interface EnvConfig {
    [key: string]: {
        required?: boolean;
        type?: 'string' | 'number' | 'boolean';
        default?: string | number | boolean;
    };
}
export declare function validateEnv(config: EnvConfig): Record<string, string | number | boolean>;
//# sourceMappingURL=env-validator.d.ts.map