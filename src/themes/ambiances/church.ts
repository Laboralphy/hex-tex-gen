import type { Placement } from '../../compose/types';
import { darken, varyPalette } from '../color';
import { drawLiquid } from '../liquids';
import { pickFloat, pickInt, pickOne, pickWeighted } from '../pick';
import {
    SALT_AGE,
    SALT_BEVEL_SIZE,
    SALT_BLOCK_SPREAD,
    SALT_BLOCK_WIDTH,
    SALT_BOND,
    SALT_CONTRAST,
    SALT_DECOR_AGE,
    SALT_HUE,
    SALT_LIGHTNESS,
    SALT_MORTAR_COLOR,
    SALT_MORTAR_SIZE,
    SALT_PALETTE,
    SALT_ROW_COUNT,
    SALT_ROW_HEIGHT,
    SALT_SATURATION,
} from '../salts';
import type { Ambiance } from '../types';

/** height of the entablatures along the top and the bottom, in percent of the texture */
export const CHURCH_TRIM = 12.5;

/** stone colors of churches, from darkest to lightest: pale limestones and sandstones */
const CHURCH_PALETTES = [
    ['#5e5a52', '#8a857a', '#b3ad9f', '#d6d0c2'], // limestone
    ['#6a5638', '#977d55', '#bfa476', '#ddc69a'], // sandstone
    ['#4a4a4c', '#727274', '#9a9a9b', '#bfbfbe'], // grey granite
    ['#6b4a3e', '#93695a', '#b88b7a', '#d6ab98'], // pink sandstone
    ['#6c6656', '#958e7a', '#bab39d', '#dbd5c0'], // tuffeau
    ['#3e3a33', '#625c52', '#888073', '#aca393'], // old grey
];

/**
 * Churches: large dressed stones of pale limestone or sandstone, in regular courses
 * between carved entablatures along the top and the bottom of the walls, little worn.
 */
export const church: Ambiance = {
    name: 'church',
    description: 'large dressed stones, pale limestones and sandstones, between entablatures',
    theme(seed) {
        const bond = pickWeighted(
            [
                ['running', 3],
                ['random', 1],
            ] as const,
            seed,
            SALT_BOND,
        );
        let rows = pickInt(3, 4, seed, SALT_ROW_COUNT);
        if (bond === 'running' && rows % 2 === 1) {
            // a running bond tiles vertically with an even number of rows only
            rows++;
        }
        // long stones, about twice as wide as high: the ashlar is 64 pixels high at own size
        const rowHeight = 64 / rows;
        const blockWidth = pickInt(
            Math.round(rowHeight * 1.5),
            Math.round(rowHeight * 2),
            seed,
            SALT_BLOCK_WIDTH,
        );
        const palette = varyPalette(pickOne(CHURCH_PALETTES, seed, SALT_PALETTE), {
            hue: pickFloat(-0.02, 0.02, seed, SALT_HUE),
            saturation: pickFloat(0.8, 1.1, seed, SALT_SATURATION),
            lightness: pickFloat(0.9, 1.05, seed, SALT_LIGHTNESS),
        });
        const decorAge = pickFloat(0.05, 0.35, seed, SALT_DECOR_AGE);
        // an entablature of the stone of the wall, along the top or the bottom
        const entablature = (id: string, y: number): Placement => ({
            id,
            patch: { template: 'entablature', marble: { palette }, age: decorAge },
            x: 0,
            y,
            width: 100,
            height: CHURCH_TRIM,
            wrap: false,
        });
        return {
            wall: {
                template: 'ashlar',
                rows: {
                    count: rows,
                    heightVariation: pickFloat(0, 0.15, seed, SALT_ROW_HEIGHT),
                },
                blocks: {
                    width: [blockWidth, blockWidth + pickInt(4, 12, seed, SALT_BLOCK_SPREAD)],
                    bond,
                },
                mortar: {
                    size: pickInt(1, 2, seed, SALT_MORTAR_SIZE),
                    color: darken(palette[0], pickFloat(0.75, 0.95, seed, SALT_MORTAR_COLOR)),
                },
                bevel: { size: pickInt(1, 2, seed, SALT_BEVEL_SIZE) },
                stone: {
                    palette,
                    contrast: pickFloat(0.5, 1, seed, SALT_CONTRAST),
                },
                age: pickFloat(0.05, 0.35, seed, SALT_AGE),
            },
            liquid: drawLiquid(
                [
                    ['blood', 3],
                    ['oldBlood', 2],
                    ['wine', 2],
                    ['water', 1],
                ],
                seed,
            ),
            decor: { age: decorAge },
            // carved entablatures along the top and the bottom, so that the walls stand out
            // of the floor and the ceiling
            trim: [entablature('trim', 0), entablature('trim-bottom', 100 - CHURCH_TRIM)],
        };
    },
};
