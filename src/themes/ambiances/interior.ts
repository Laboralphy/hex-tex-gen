import { darken, varyPalette } from '../color';
import { drawLiquid } from '../liquids';
import { pickFloat, pickInt, pickOne, pickWeighted } from '../pick';
import {
    SALT_AGE,
    SALT_BEVEL_SIZE,
    SALT_CONTRAST,
    SALT_DECOR_AGE,
    SALT_HUE,
    SALT_LIGHTNESS,
    SALT_MORTAR_COLOR,
    SALT_PALETTE,
    SALT_PALETTE_SHIFT,
    SALT_PLANK_DIRECTION,
    SALT_PLANK_FULL,
    SALT_PLANK_GAP,
    SALT_PLANK_GRAIN,
    SALT_PLANK_KNOTS,
    SALT_PLANK_LENGTH,
    SALT_PLANK_LINES,
    SALT_PLANK_NAILS,
    SALT_SATURATION,
} from '../salts';
import type { Ambiance } from '../types';

/** height of the entablature along the floor, in percent of the texture */
const TRIM = 15;

/** wood colors of interiors, from darkest to lightest */
const WOOD_PALETTES = [
    ['#3a2412', '#5e3b1f', '#7d5230', '#9c6b40'], // oak
    ['#241610', '#3e271b', '#5a3a28', '#7a5038'], // walnut
    ['#4a3218', '#7a5528', '#a8783c', '#c99a55'], // pine
    ['#2e120c', '#4e2016', '#6e3222', '#8e4630'], // mahogany
    ['#5a4a38', '#857058', '#ab9477', '#cdb899'], // pale ash
    ['#161210', '#2a221c', '#3e332a', '#55473a'], // ebonized
];

/**
 * Wooden urban interiors: rooms panelled with wooden planks, well kept, in any wood.
 */
export const interior: Ambiance = {
    name: 'interior',
    description: 'wooden urban interiors: panelled walls, oak to ebony, well kept',
    theme(seed) {
        const palette = varyPalette(pickOne(WOOD_PALETTES, seed, SALT_PALETTE), {
            hue: pickFloat(-0.02, 0.02, seed, SALT_HUE),
            saturation: pickFloat(0.8, 1.15, seed, SALT_SATURATION),
            lightness: pickFloat(0.9, 1.1, seed, SALT_LIGHTNESS),
        });
        // panels running the whole height, or planks of different lengths
        const full = pickFloat(0, 1, seed, SALT_PLANK_FULL) < 0.4;
        const decorAge = pickFloat(0, 0.25, seed, SALT_DECOR_AGE);
        return {
            wall: {
                template: 'planks',
                direction: pickWeighted(
                    [
                        ['vertical', 3],
                        ['horizontal', 1],
                    ] as const,
                    seed,
                    SALT_PLANK_DIRECTION,
                ),
                lines: { count: pickInt(3, 6, seed, SALT_PLANK_LINES) },
                planks: {
                    length: full ? [1, 1] : [pickFloat(0.3, 0.7, seed, SALT_PLANK_LENGTH), 1],
                },
                gap: {
                    size: pickInt(1, 2, seed, SALT_PLANK_GAP),
                    color: darken(palette[0], pickFloat(0.4, 0.6, seed, SALT_MORTAR_COLOR)),
                },
                bevel: { size: pickInt(1, 2, seed, SALT_BEVEL_SIZE) },
                wood: {
                    palette,
                    contrast: pickFloat(0.6, 1, seed, SALT_CONTRAST),
                    grain: pickFloat(3, 8, seed, SALT_PLANK_GRAIN),
                    paletteShift: pickFloat(0.05, 0.2, seed, SALT_PALETTE_SHIFT),
                },
                knots: { ratio: pickFloat(0.05, 0.35, seed, SALT_PLANK_KNOTS) },
                nails: { ratio: pickFloat(0, 0.8, seed, SALT_PLANK_NAILS) },
                age: pickFloat(0.05, 0.4, seed, SALT_AGE),
            },
            liquid: drawLiquid(
                [
                    ['wine', 3],
                    ['blood', 3],
                    ['oldBlood', 2],
                ],
                seed,
            ),
            decor: { age: decorAge },
            // an entablature along the floor, so that the walls stand out of it, of the
            // colors of the wall
            trim: [
                {
                    id: 'trim',
                    patch: { template: 'entablature', marble: { palette }, age: decorAge },
                    x: 0,
                    y: 100 - TRIM,
                    width: 100,
                    height: TRIM,
                    wrap: false,
                },
            ],
        };
    },
};
