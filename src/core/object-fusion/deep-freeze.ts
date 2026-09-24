export type DeepReadonly<T> = T extends (infer R)[]
    ? ReadonlyArray<DeepReadonly<R>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/** True for a pure object literal (not an Array, Map, Set, Date, …). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    return (value as { constructor?: { name?: string } }).constructor?.name === 'Object';
}

/**
 * Recursively freeze a value, making it and everything it references immutable.
 * Returns the same reference, now deeply frozen.
 *
 * @param value value to freeze
 */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
    if (value === undefined || Object.isFrozen(value)) {
        return value as DeepReadonly<T>;
    }
    if (isPlainObject(value) || typeof value === 'function') {
        for (const prop of Object.getOwnPropertyNames(value)) {
            deepFreeze((value as Record<string, unknown>)[prop]);
        }
        Object.freeze(value);
    } else if (Array.isArray(value)) {
        for (const element of value) {
            deepFreeze(element);
        }
        Object.freeze(value);
    }
    return value as DeepReadonly<T>;
}
