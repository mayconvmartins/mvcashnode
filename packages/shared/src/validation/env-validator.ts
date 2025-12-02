export interface EnvConfig {
  [key: string]: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean';
    default?: string | number | boolean;
  };
}

export function validateEnv(config: EnvConfig): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};

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

