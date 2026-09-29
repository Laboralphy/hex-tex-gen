import { hash, hashRange } from '../core/hash';

/**
 * A float in [min, max) drawn from a seed and a salt, rounded to two decimals so that the
 * generated files stay readable.
 */
export function pickFloat(min: number, max: number, seed: number, salt: number): number {
    return Math.round(hashRange(min, max, seed, salt) * 100) / 100;
}

/**
 * An integer in [min, max], bounds included, drawn from a seed and a salt.
 */
export function pickInt(min: number, max: number, seed: number, salt: number): number {
    return Math.min(max, Math.floor(hashRange(min, max + 1, seed, salt)));
}

/**
 * One of the items, drawn from a seed and a salt.
 */
export function pickOne<T>(items: readonly T[], seed: number, salt: number): T {
    return items[Math.min(items.length - 1, Math.floor(hash(seed, salt) * items.length))];
}

/**
 * One of the items, drawn from a seed and a salt, each item as likely as its weight.
 */
export function pickWeighted<T>(
    items: readonly (readonly [T, number])[],
    seed: number,
    salt: number,
): T {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let t = hash(seed, salt) * total;
    for (const [item, weight] of items) {
        t -= weight;
        if (t < 0) {
            return item;
        }
    }
    return items[items.length - 1][0];
}
