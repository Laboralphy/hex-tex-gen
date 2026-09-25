export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
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
