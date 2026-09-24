/** A leaf-value transformer, called on every primitive (and function) reached. */
export type TransformFunction = (value: unknown) => unknown;

/**
 * Deep-clone any value. Plain objects, arrays, `Date`, `Set` and `Map` instances
 * are duplicated; primitives and functions are returned as-is — unless a
 * `transform` is given, in which case it receives every leaf (including `Set`
 * elements and `Map` keys/values) and returns the replacement to store in the
 * clone.
 *
 * A value reached twice through different branches (a shared sub-object) is cloned
 * independently each time. A genuine **circular** reference throws
 * `ERR_CLONE_CIRCULAR` rather than looping forever.
 *
 * @param item value to clone
 * @param transform optional leaf-value transformer
 */
export function deepClone<T>(item: T, transform: TransformFunction | null = null): T {
    return cloneValue(item, transform, new WeakSet());
}

function cloneValue<T>(
    item: T,
    transform: TransformFunction | null,
    ancestors: WeakSet<object>,
): T {
    if (item === null) {
        return null as T;
    }
    if (typeof item !== 'object') {
        // primitive, bigint, symbol, undefined, or function
        return (transform ? transform(item) : item) as T;
    }

    // A Date has no children, so it needs no place in the ancestor chain.
    if (item instanceof Date) {
        return new Date(item) as T;
    }

    const container = item as object;
    if (ancestors.has(container)) {
        throw new Error('ERR_CLONE_CIRCULAR');
    }
    ancestors.add(container);

    let cloned: unknown;
    if (Array.isArray(item)) {
        cloned = item.map((element) => cloneValue(element, transform, ancestors));
    } else if (item instanceof Set) {
        cloned = new Set([...item].map((element) => cloneValue(element, transform, ancestors)));
    } else if (item instanceof Map) {
        cloned = new Map(
            [...item].map(([key, value]) => [
                cloneValue(key, transform, ancestors),
                cloneValue(value, transform, ancestors),
            ]),
        );
    } else {
        const source = item as Record<string, unknown>;
        const output: Record<string, unknown> = {};
        for (const key in source) {
            if (Object.hasOwn(source, key)) {
                output[key] = cloneValue(source[key], transform, ancestors);
            }
        }
        cloned = output;
    }

    ancestors.delete(container);
    return cloned as T;
}
