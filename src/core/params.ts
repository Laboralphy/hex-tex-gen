export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks that every key of `params` exists in `defaults`, recursively.
 * @param path prefix of the reported key paths
 * @throws Error naming the first unknown key, as a dotted path
 */
export function checkKeys(params: unknown, defaults: unknown, path = ''): void {
    if (!isPlainObject(params) || !isPlainObject(defaults)) {
        return;
    }
    for (const key of Object.keys(params)) {
        const keyPath = path ? `${path}.${key}` : key;
        if (!(key in defaults)) {
            throw new Error(`unknown parameter "${keyPath}"`);
        }
        checkKeys(params[key], defaults[key], keyPath);
    }
}

/**
 * Turns a dotted path and a value into nested objects:
 * `expandPath('mortar.size', 3)` gives `{ mortar: { size: 3 } }`.
 */
export function expandPath(path: string, value: unknown): Record<string, unknown> {
    return path
        .split('.')
        .reduceRight<Record<string, unknown>>((acc, key) => ({ [key]: acc }), value as never);
}
