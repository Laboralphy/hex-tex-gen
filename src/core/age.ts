/** a wear value at age 0 (new), 0.3 (the default) and 1 (ruined) */
export type AgeCurve = [number, number, number];

/** a [min, max] wear range at age 0, 0.3 and 1 */
export type AgeRangeCurve = [[number, number], [number, number], [number, number]];

/** the default age: curves pass through their middle value there */
export const AGE_REFERENCE = 0.3;

/**
 * A wear value at a given age, interpolated linearly between age 0, 0.3 and 1.
 */
export function atAge(age: number, [young, reference, old]: AgeCurve): number {
    return age <= AGE_REFERENCE
        ? young + (reference - young) * (age / AGE_REFERENCE)
        : reference + (old - reference) * ((age - AGE_REFERENCE) / (1 - AGE_REFERENCE));
}

/**
 * A [min, max] wear range at a given age, each bound interpolated like {@link atAge}.
 */
export function rangeAtAge(age: number, curve: AgeRangeCurve): [number, number] {
    return [
        atAge(age, [curve[0][0], curve[1][0], curve[2][0]]),
        atAge(age, [curve[0][1], curve[1][1], curve[2][1]]),
    ];
}
