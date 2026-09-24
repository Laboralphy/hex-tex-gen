/**
 * Murmur3 finalizer: scrambles the bits of a 32-bit integer.
 */
function fmix(h: number): number {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

/**
 * Position-based randomness: a pseudo-random value in [0, 1) derived from a seed and
 * any number of integers (a row, a column, a salt...). Unlike a sequential generator,
 * the value of an element does not depend on how many values were drawn before it,
 * so resizing a texture does not reshuffle it.
 */
export function hash(seed: number, ...values: number[]): number {
    let h = fmix((seed >>> 0) + 0x9e3779b9);
    for (const v of values) {
        h = fmix((h ^ (v | 0)) + 0x9e3779b9);
    }
    return h / 4294967296;
}

/**
 * {@link hash} mapped to a float in [min, max).
 */
export function hashRange(min: number, max: number, seed: number, ...values: number[]): number {
    return min + hash(seed, ...values) * (max - min);
}
