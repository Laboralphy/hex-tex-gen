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
 * Smooth Hermite step: 0 below `edge0`, 1 above `edge1`, a smooth S curve between them.
 */
export function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = clamp((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

/**
 * The signed shortest offset from `b` to `a` on a circle of the given length: in
 * [-length / 2, length / 2), so that positions wrapping around a tile stay close.
 */
export function wrapOffset(a: number, b: number, length: number): number {
    return mod(a - b + length / 2, length) - length / 2;
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
