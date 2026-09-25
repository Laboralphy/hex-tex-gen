/**
 * Modulo with a result of the sign of the divisor, in [0, n) for a positive `n`, so that
 * negative coordinates wrap around like tiles.
 */
export function mod(a: number, n: number): number {
    return ((a % n) + n) % n;
}

/**
 * Clamps a value to [min, max], [0, 1] by default.
 */
export function clamp(value: number, min = 0, max = 1): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Distance between two positions on a circle of the given circumference.
 */
export function circularDistance(a: number, b: number, circumference: number): number {
    const d = mod(a - b, circumference);
    return Math.min(d, circumference - d);
}

/**
 * First pixel whose center lies at or after a position: the first pixel row (or column)
 * of a face starting at `edge`, after a joint or a gap of `offset` pixels.
 */
export function firstPixel(edge: number, offset = 0): number {
    return Math.ceil(edge + offset - 0.5);
}
