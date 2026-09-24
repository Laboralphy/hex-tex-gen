/**
 * Shallowly transform an object's values (no recursion). The transformer receives
 * each `(value, key)` and returns the replacement; keys are preserved.
 *
 * @param object object whose values are transformed
 * @param transform called with each `(value, key)`
 * @returns a new object with the same keys and transformed values
 */
export function shallowMap<T, R>(
    object: Record<string, T>,
    transform: (value: T, key: string) => R,
): Record<string, R> {
    return Object.fromEntries(
        Object.entries(object).map(([key, value]) => [key, transform(value, key)]),
    );
}
