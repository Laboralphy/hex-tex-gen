import { z } from 'zod';
import {
    ageParam,
    color,
    DETAIL,
    FROM_AGE,
    LAYOUT,
    palette,
    range,
    ratio,
    size,
} from '../../core/schema';
import { MOSS_PALETTE } from '../common/palettes';
import { panelGroup, checkPanelFits } from './panel';

/**
 * Default values of the parameters of a wall template that are not wear parameters.
 */
export type WallDefaults = {
    size: [number, number];
    rows: { count: number; heightVariation: number };
    blocks: {
        width: [number, number];
        minJointOffset: number;
        bond: 'random' | 'running' | 'stack';
    };
    panel: {
        enabled: boolean;
        width: number;
        height: number;
        snap: boolean;
        bevel: number;
        shade: number;
    };
    mortar: { size: number; color: string };
    bevel: { size: number; light: number; dark: number };
    stone: {
        palette: string[];
        contrast: number;
        paletteShift: number;
        noise: { period: number; octaves: number; persistence: number };
    };
};

/** panel defaults of walls without a panel */
export const NO_PANEL: WallDefaults['panel'] = {
    enabled: false,
    width: 32,
    height: 24,
    snap: true,
    bevel: 2,
    shade: 1,
};

/**
 * The `moss` parameter group of stone walls: moss growing along the top edges of the
 * stones, following their shape, with vines hanging down their faces.
 */
export function mossGroup() {
    return z
        .strictObject({
            coverage: ratio()
                .default(0)
                .describe('share of the stone tops covered with moss, in [0, 1]; 0 for none'),
            depth: z
                .number()
                .min(0)
                .default(2)
                .describe('thickness of the moss along the top edges, in pixels')
                .meta(DETAIL),
            vines: ratio()
                .default(0.25)
                .describe('chance of a vine hanging from each column of moss, in [0, 1]'),
            length: range(z.number().min(0))
                .default([2, 7])
                .describe('[min, max] length of the vines, in pixels')
                .meta(DETAIL),
            joints: ratio()
                .default(0.3)
                .describe('moss in the joints where the stones are mossy, in [0, 1]'),
            palette: palette()
                .default(MOSS_PALETTE)
                .describe('moss colors, from darkest to lightest'),
        })
        .prefault({})
        .describe('moss growing along the top edges of the stones');
}

/**
 * Parameters of a wall, with the given defaults: `ashlar` and `bricks` share them.
 */
export function wallSchema(d: WallDefaults) {
    return z
        .strictObject({
            size: size()
                .default(d.size)
                .describe(
                    'own size of the patch in pixels; layout values are expressed at this size',
                ),
            rows: z
                .strictObject({
                    count: z
                        .number()
                        .int()
                        .min(1)
                        .default(d.rows.count)
                        .describe('number of horizontal courses of stones')
                        .meta(LAYOUT),
                    heightVariation: z
                        .number()
                        .min(0)
                        .lt(1)
                        .default(d.rows.heightVariation)
                        .describe('random height variation between rows, in [0, 1)')
                        .meta(LAYOUT),
                })
                .prefault({})
                .describe('horizontal courses of stones'),
            blocks: z
                .strictObject({
                    width: range(z.number().positive())
                        .default(d.blocks.width)
                        .describe('[min, max] stone width')
                        .meta(LAYOUT),
                    minJointOffset: z
                        .number()
                        .min(0)
                        .default(d.blocks.minJointOffset)
                        .describe(
                            'minimum horizontal distance between a joint and the joints of adjacent rows (random bond only)',
                        )
                        .meta(LAYOUT),
                    bond: z
                        .enum(['random', 'running', 'stack'])
                        .default(d.blocks.bond)
                        .describe(
                            'random: stones of random width; running: equal bricks, rows offset by half a brick; stack: equal bricks, joints aligned',
                        ),
                })
                .prefault({})
                .describe('stones within a row'),
            panel: panelGroup(d.panel),
            mortar: z
                .strictObject({
                    size: z
                        .number()
                        .int()
                        .min(0)
                        .default(d.mortar.size)
                        .describe('joint thickness, in pixels')
                        .meta(DETAIL),
                    color: color().default(d.mortar.color).describe('mortar color'),
                    noise: ratio()
                        .optional()
                        .describe(`brightness variation of the mortar, in [0, 1];${FROM_AGE}`),
                    erosion: ratio()
                        .optional()
                        .describe(
                            `hollowed joints: darker, pitted mortar shadowed by the stones, in [0, 1];${FROM_AGE}`,
                        ),
                })
                .prefault({})
                .describe('joints between stones'),
            bevel: z
                .strictObject({
                    size: z
                        .number()
                        .int()
                        .min(0)
                        .default(d.bevel.size)
                        .describe('bevel width, in pixels')
                        .meta(DETAIL),
                    light: z
                        .number()
                        .min(0)
                        .default(d.bevel.light)
                        .describe('brightness factor of the top and left edges'),
                    dark: z
                        .number()
                        .min(0)
                        .default(d.bevel.dark)
                        .describe('brightness factor of the bottom and right edges'),
                })
                .prefault({})
                .describe('stone edges lit from the top-left'),
            edges: z
                .strictObject({
                    roughness: z
                        .number()
                        .min(0)
                        .optional()
                        .describe(
                            `maximum displacement of the stone outlines, in pixels;${FROM_AGE}`,
                        )
                        .meta(DETAIL),
                })
                .prefault({})
                .describe('irregularity of stone outlines'),
            chips: z
                .strictObject({
                    ratio: ratio()
                        .optional()
                        .describe(`ratio of chipped stones, in [0, 1];${FROM_AGE}`),
                    size: range(z.number().min(0))
                        .optional()
                        .describe(`[min, max] chip size, in pixels;${FROM_AGE}`)
                        .meta(DETAIL),
                })
                .prefault({})
                .describe('broken stone corners'),
            cracks: z
                .strictObject({
                    ratio: ratio()
                        .optional()
                        .describe(`ratio of cracked stones, in [0, 1];${FROM_AGE}`),
                    length: range(z.number().min(0))
                        .optional()
                        .describe(`[min, max] crack length, in pixels;${FROM_AGE}`)
                        .meta(DETAIL),
                })
                .prefault({})
                .describe('cracks running across stones'),
            erosion: z
                .strictObject({
                    corners: z
                        .number()
                        .min(0)
                        .optional()
                        .describe(`radius of the rounded stone corners, in pixels;${FROM_AGE}`)
                        .meta(DETAIL),
                    edges: z
                        .number()
                        .min(0)
                        .optional()
                        .describe(`maximum depth worn into the stone edges, in pixels;${FROM_AGE}`)
                        .meta(DETAIL),
                })
                .prefault({})
                .describe('stones worn down by time: rounded corners, uneven edges'),
            stains: z
                .strictObject({
                    ratio: ratio()
                        .optional()
                        .describe(
                            `chance of a streak running down from the top of each stone;${FROM_AGE}`,
                        ),
                    length: range(z.number().min(0))
                        .optional()
                        .describe(`[min, max] streak length;${FROM_AGE}`)
                        .meta(LAYOUT),
                    width: z
                        .number()
                        .min(1)
                        .optional()
                        .describe(`streak width, in pixels;${FROM_AGE}`)
                        .meta(DETAIL),
                    darkness: ratio()
                        .optional()
                        .describe(`darkening at the top of a streak, in [0, 1];${FROM_AGE}`),
                    grime: ratio()
                        .optional()
                        .describe(`blotchy darkening of the whole wall, in [0, 1];${FROM_AGE}`),
                })
                .prefault({})
                .describe('dirt: streaks of rainwater and soot, grime'),
            spalling: z
                .strictObject({
                    ratio: ratio()
                        .optional()
                        .describe(
                            `ratio of stones with a flaked, recessed patch, in [0, 1];${FROM_AGE}`,
                        ),
                    size: range(z.number().min(0))
                        .optional()
                        .describe(`[min, max] patch radius, in pixels;${FROM_AGE}`)
                        .meta(DETAIL),
                    depth: ratio()
                        .optional()
                        .describe(`darkening of the flaked patches, in [0, 1];${FROM_AGE}`),
                })
                .prefault({})
                .describe('flaked stone faces'),
            moss: mossGroup(),
            age: ageParam(),
            stone: z
                .strictObject({
                    palette: palette()
                        .default(d.stone.palette)
                        .describe('stone colors, from darkest to lightest'),
                    contrast: z
                        .number()
                        .min(0)
                        .default(d.stone.contrast)
                        .describe('spread of the surface noise over the palette'),
                    shadeVariation: ratio()
                        .optional()
                        .describe(
                            `random brightness variation between stones, in [0, 1];${FROM_AGE}`,
                        ),
                    paletteShift: ratio()
                        .default(d.stone.paletteShift)
                        .describe('random shift of each stone along the palette, in [0, 1]'),
                    grain: ratio()
                        .optional()
                        .describe(
                            `random brightness variation between pixels, in [0, 1];${FROM_AGE}`,
                        )
                        .meta(DETAIL),
                    noise: z
                        .strictObject({
                            period: z
                                .number()
                                .int()
                                .min(1)
                                .default(d.stone.noise.period)
                                .describe('noise cells across the patch at the first octave')
                                .meta(LAYOUT),
                            octaves: z
                                .number()
                                .int()
                                .min(1)
                                .max(16)
                                .default(d.stone.noise.octaves)
                                .describe('number of noise octaves, each one twice as fine'),
                            persistence: z
                                .number()
                                .gt(0)
                                .max(1)
                                .default(d.stone.noise.persistence)
                                .describe('weight ratio between an octave and the previous one'),
                        })
                        .prefault({})
                        .describe('surface noise'),
                })
                .prefault({})
                .describe('stone surface'),
        })
        .superRefine((p, ctx) => {
            checkPanelFits(p, ctx);
            if (p.blocks.bond === 'running' && p.rows.count % 2 === 1) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['rows', 'count'],
                    message: 'a running bond needs an even number of rows to tile vertically',
                });
            }
        });
}
