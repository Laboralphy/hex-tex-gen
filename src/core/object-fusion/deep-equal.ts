/**
 * Recursively compare two values for structural equality: primitives by `===`,
 * arrays element-wise, plain objects key-by-key (order-independent). Other object
 * kinds (`Date`, `Map`, `Set`) are compared only by their enumerable own keys.
 *
 * @param a first value
 * @param b second value
 */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
        return false;
    }

    const aIsArray = Array.isArray(a);
    const bIsArray = Array.isArray(b);
    if (aIsArray || bIsArray) {
        if (!aIsArray || !bIsArray || a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }

    const oa = a as Record<string, unknown>;
    const ob = b as Record<string, unknown>;
    const keys = Object.keys(oa);
    if (keys.length !== Object.keys(ob).length) {
        return false;
    }
    for (const key of keys) {
        if (!Object.hasOwn(ob, key) || !deepEqual(oa[key], ob[key])) {
            return false;
        }
    }
    return true;
}
