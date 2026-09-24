import { deepClone } from './deep-clone';

/** How {@link deepMerge} combines two arrays found at the same key. */
export type ArrayMergeStrategy = 'replace' | 'concat';

export interface DeepMergeOptions {
    /**
     * What to do when both objects hold an array at the same key:
     * - `'replace'` (default) — the source array wins;
     * - `'concat'` — the target's items come first, then the source's.
     *
     * The merged items are always deep-cloned from the source.
     */
    arrays?: ArrayMergeStrategy;

    /**
     * When `true`, merge **in place**: write straight into `target` (recursing into
     * its nested objects, and mutating its arrays in place) and return `target`
     * itself, instead of building a fresh object. Source values are still
     * deep-cloned in, so the result never shares structure with `source`. Defaults
     * to `false` (immutable merge — a new object is returned, `target` untouched).
     */
    mutate?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deep-merge `source` into `target`. Nested objects merge recursively; arrays
 * follow the chosen {@link ArrayMergeStrategy} (default `'replace'`); every other
 * value is overwritten by a deep clone of the source's. A circular `source` throws
 * `ERR_MERGE_RECURSIVE`.
 *
 * By default the merge is **immutable**: a new object is returned and neither input
 * is mutated (branches present only in `target` are carried over by reference —
 * cheap, and safe because the result is never mutated in place). Pass
 * `{ mutate: true }` to instead write into `target` and return it.
 *
 * @param target base object
 * @param source object whose values are merged in
 * @param options array strategy and `mutate` flag
 */
export function deepMerge<T extends object, S extends object>(
    target: T,
    source: S,
    options: DeepMergeOptions = {},
): T & S {
    return mergeValues(
        target,
        source,
        options.arrays ?? 'replace',
        options.mutate ?? false,
        new WeakSet(),
    ) as T & S;
}

function mergeValues(
    target: unknown,
    source: unknown,
    arrays: ArrayMergeStrategy,
    mutate: boolean,
    seen: WeakSet<object>,
): unknown {
    if (!isPlainObject(target) || !isPlainObject(source)) {
        // Not both mergeable objects — the source replaces the target (cloned so the
        // result shares nothing with the source).
        return deepClone(source);
    }

    if (seen.has(source)) {
        throw new Error('ERR_MERGE_RECURSIVE');
    }
    seen.add(source);

    // In mutate mode write straight into `target`; otherwise onto a shallow copy.
    const output: Record<string, unknown> = mutate ? target : { ...target };
    for (const key in source) {
        if (!Object.hasOwn(source, key)) {
            continue;
        }
        const sourceValue = source[key];
        const targetValue = target[key];
        if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
            output[key] = mergeValues(targetValue, sourceValue, arrays, mutate, seen);
        } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
            const additions = sourceValue.map((element) => deepClone(element));
            if (mutate) {
                // Reuse the existing target array, mutating it in place.
                if (arrays === 'replace') {
                    targetValue.length = 0;
                }
                targetValue.push(...additions);
            } else {
                const base =
                    arrays === 'concat' ? targetValue.map((element) => deepClone(element)) : [];
                output[key] = [...base, ...additions];
            }
        } else {
            output[key] = deepClone(sourceValue);
        }
    }

    seen.delete(source);
    return output;
}
