"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnv = validateEnv;
function validateEnv(config) {
    const result = {};
    for (const [key, options] of Object.entries(config)) {
        const value = process.env[key];
        if (!value && options.required) {
            throw new Error(`Environment variable ${key} is required but not set`);
        }
        if (!value && options.default !== undefined) {
            result[key] = options.default;
            continue;
        }
        if (!value) {
            continue;
        }
        switch (options.type) {
            case 'number':
                const numValue = Number(value);
                if (isNaN(numValue)) {
                    throw new Error(`Environment variable ${key} must be a number`);
                }
                result[key] = numValue;
                break;
            case 'boolean':
                result[key] = value === 'true' || value === '1';
                break;
            default:
                result[key] = value;
        }
    }
    return result;
}
//# sourceMappingURL=env-validator.js.map