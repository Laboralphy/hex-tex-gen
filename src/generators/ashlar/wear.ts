import { atAge, rangeAtAge } from '../../core/age';
import type { AshlarParams } from './ashlar';

/**
 * Wear values of an ashlar wall, every one resolved.
 */
export type AshlarWear = {
    chips: { ratio: number; size: [number, number] };
    cracks: { ratio: number; length: [number, number] };
    roughness: number;
    grain: number;
    shadeVariation: number;
    mortar: { noise: number; erosion: number };
    erosion: { corners: number; edges: number };
    stains: {
        ratio: number;
        length: [number, number];
        width: number;
        darkness: number;
        grime: number;
    };
    spalling: { ratio: number; size: [number, number]; depth: number };
};

/** stone height, in own pixels, that the derived pixel sizes are given for */
const REFERENCE_STONE_HEIGHT = 16;

/** the parameters the wear of a wall is derived from */
export type WearParams = Pick<
    AshlarParams,
    | 'size'
    | 'rows'
    | 'age'
    | 'chips'
    | 'cracks'
    | 'edges'
    | 'stone'
    | 'mortar'
    | 'erosion'
    | 'stains'
    | 'spalling'
>;

/**
 * Resolves the wear values of a wall: values set in the parameters win, the others are
 * derived from `age`. Derived sizes in pixels are given for stones 16 pixels high at own
 * size, and are proportional to the actual stone height: the bricks of `bricks`, 8 pixels
 * high, get chips, cracks and erosion half as large.
 */
export function ashlarWear(p: WearParams): AshlarWear {
    const a = p.age;
    // derived sizes in pixels are proportional to the stone height at own size
    const k = p.size[1] / Math.max(1, Math.round(p.rows.count)) / REFERENCE_STONE_HEIGHT;
    const px = (value: number) => value * k;
    const pxRange = ([min, max]: [number, number]): [number, number] => [min * k, max * k];
    return {
        chips: {
            ratio: p.chips.ratio ?? atAge(a, [0, 0.25, 0.8]),
            size:
                p.chips.size ??
                pxRange(
                    rangeAtAge(a, [
                        [1, 2],
                        [2, 4],
                        [3, 8],
                    ]),
                ),
        },
        cracks: {
            ratio: p.cracks.ratio ?? atAge(a, [0, 0.2, 0.75]),
            length:
                p.cracks.length ??
                pxRange(
                    rangeAtAge(a, [
                        [3, 6],
                        [5, 12],
                        [10, 26],
                    ]),
                ),
        },
        roughness: p.edges.roughness ?? px(atAge(a, [0.3, 0.8, 1.4])),
        grain: p.stone.grain ?? atAge(a, [0.03, 0.06, 0.14]),
        shadeVariation: p.stone.shadeVariation ?? atAge(a, [0.05, 0.1, 0.22]),
        mortar: {
            noise: p.mortar.noise ?? atAge(a, [0.1, 0.25, 0.55]),
            erosion: p.mortar.erosion ?? atAge(a, [0, 0.2, 0.8]),
        },
        erosion: {
            corners: p.erosion.corners ?? px(atAge(a, [0, 1, 4])),
            edges: p.erosion.edges ?? px(atAge(a, [0, 0.5, 2.5])),
        },
        stains: {
            ratio: p.stains.ratio ?? atAge(a, [0, 0.15, 0.7]),
            length:
                p.stains.length ??
                pxRange(
                    rangeAtAge(a, [
                        [4, 10],
                        [6, 16],
                        [12, 40],
                    ]),
                ),
            width: p.stains.width ?? Math.max(1, px(atAge(a, [1, 2, 3]))),
            darkness: p.stains.darkness ?? atAge(a, [0.15, 0.25, 0.5]),
            grime: p.stains.grime ?? atAge(a, [0, 0.1, 0.4]),
        },
        spalling: {
            ratio: p.spalling.ratio ?? atAge(a, [0, 0.08, 0.5]),
            size:
                p.spalling.size ??
                pxRange(
                    rangeAtAge(a, [
                        [2, 3],
                        [2, 5],
                        [4, 10],
                    ]),
                ),
            depth: p.spalling.depth ?? atAge(a, [0.2, 0.25, 0.45]),
        },
    };
}
