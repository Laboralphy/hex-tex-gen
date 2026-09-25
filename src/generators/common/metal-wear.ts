import { z } from 'zod';
import { atAge, rangeAtAge, type AgeCurve } from '../../core/age';
import { DETAIL, FROM_AGE, palette, range, ratio } from '../../core/schema';
import { RUST_PALETTE } from './palettes';

/**
 * Rust parameters of a metal template: patches and streaks running down from rivets.
 * @param coverage description of the rusted share of the surface
 */
export const rustGroup = (coverage = 'share of the surface rusted') =>
    z
        .strictObject({
            coverage: ratio().optional().describe(`${coverage};${FROM_AGE}`),
            palette: palette()
                .default(RUST_PALETTE)
                .describe('rust colors, from darkest to lightest'),
            streaks: ratio()
                .optional()
                .describe(`ratio of rivets with a rust streak running down;${FROM_AGE}`),
            length: range(z.number().min(0))
                .optional()
                .describe(`[min, max] length of the rust streaks, in pixels;${FROM_AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('rust');

/** scratches on a metal surface */
export const scratchesParam = () =>
    z.number().min(0).optional().describe(`scratches per 32 × 32 pixels;${FROM_AGE}`);

/** dulled metal */
export const tarnishParam = () =>
    ratio().optional().describe(`dulled, darkened metal, in [0, 1];${FROM_AGE}`);

/** rust wear values, every one resolved */
export type RustWear = { coverage: number; streaks: number; length: [number, number] };

/** wear values shared by metal templates, every one resolved */
export type MetalWearBase = { rust: RustWear; scratches: number; tarnish: number };

/** age curves of the metal wear values that differ between templates */
export type MetalAgeCurves = { coverage: AgeCurve; streaks: AgeCurve };

/**
 * Resolves the wear values shared by metal templates: values set in the parameters win,
 * the others are derived from `age`.
 */
export function metalWearBase(
    p: {
        age: number;
        rust: Partial<RustWear>;
        scratches?: number;
        tarnish?: number;
    },
    curves: MetalAgeCurves,
): MetalWearBase {
    const a = p.age;
    return {
        rust: {
            coverage: p.rust.coverage ?? atAge(a, curves.coverage),
            streaks: p.rust.streaks ?? atAge(a, curves.streaks),
            length:
                p.rust.length ??
                rangeAtAge(a, [
                    [2, 4],
                    [3, 8],
                    [6, 18],
                ]),
        },
        scratches: p.scratches ?? atAge(a, [0, 0.5, 2.5]),
        tarnish: p.tarnish ?? atAge(a, [0, 0.1, 0.35]),
    };
}
