import type { ColorRGBAStruct } from '@laboralphy/rainbow';
import { z } from 'zod';
import { ratio } from '../../core/schema';
import type { ArchPoint } from './arch';

/** a side of an opening */
export type Side = 'top' | 'left' | 'right' | 'bottom';

/** shading of a reveal: negative darkens, positive lightens */
const shading = () => z.number().min(-1).max(1);

/**
 * Schema of the reveals of an opening, the inner faces of the cut, with the light coming
 * from the top-left.
 */
export const revealsSchema = () =>
    z
        .strictObject({
            top: shading().default(-0.6).describe('shading of the top reveal, in shadow'),
            left: shading().default(-0.45).describe('shading of the left reveal, in shadow'),
            right: shading().default(0.2).describe('shading of the right reveal, lit'),
            bottom: shading().default(0.3).describe('shading of the bottom reveal (the sill), lit'),
            falloff: ratio()
                .default(0.2)
                .describe('extra darkness of the reveals towards the back, in [0, 1]'),
        })
        .prefault({})
        .describe(
            'inner faces of the cut: the wall below, shaded; from -1 (black) to 1 (white), the light coming from the top-left',
        );

export type Reveals = z.output<ReturnType<typeof revealsSchema>>;

/**
 * Translucent black that darkens the wall below, or translucent white that lightens it.
 * @param value in [-1, 1]: negative darkens, positive lightens
 */
export function shadeWith(value: number): ColorRGBAStruct {
    return value < 0
        ? { r: 0, g: 0, b: 0, a: Math.min(1, -value) }
        : { r: 1, g: 1, b: 1, a: Math.min(1, value) };
}

/**
 * Shading of a pixel of the reveals. They meet at mitred corners: the nearest edge gives
 * the face; along an arch, the faces blend with the direction the curve faces.
 * @param sides distance from the pixel to each edge of the opening
 * @param arch the arch at the pixel, when the top is an arch above its springing line
 * @param depth width of the reveals, in pixels
 */
export function revealShade(
    reveals: Reveals,
    sides: Record<Side, number>,
    arch: ArchPoint | undefined,
    depth: number,
): ColorRGBAStruct {
    const d = Math.min(sides.top, sides.left, sides.right, sides.bottom);
    const side = (Object.keys(sides) as Side[]).find((key) => sides[key] === d)!;
    let face: number = reveals[side];
    if (arch && side === 'top') {
        const up = Math.max(0, -arch.ny);
        const across = Math.abs(arch.nx);
        const beside = arch.nx < 0 ? reveals.left : reveals.right;
        face = (up * reveals.top + across * beside) / Math.max(0.001, up + across);
    }
    return shadeWith(face - reveals.falloff * (d / Math.max(1, depth)));
}
