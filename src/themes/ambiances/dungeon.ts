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

/** stone colors of dungeons, from darkest to lightest: cold greys and dull tints */
const DUNGEON_PALETTES = [
    ['#34322e', '#5a5751', '#7e7a72', '#a39e94'], // grey
    ['#1b2d2e', '#3d5a5b', '#608888', '#82b5b5'], // teal
    ['#23272e', '#434a55', '#656e7b', '#8a93a0'], // blue grey
    ['#262b22', '#454c3d', '#666e5a', '#8a927b'], // green grey
    ['#2e241b', '#54432f', '#7a6446', '#a08660'], // ochre
    ['#1a1a1c', '#333336', '#4d4d52', '#6b6b70'], // basalt
    ['#2f1f1b', '#553a31', '#7a5548', '#9f7463'], // rust
];

/**
 * Dungeons: dressed stone walls, in any bond, cold and worn.
 */
export const dungeon: Ambiance = {
    name: 'dungeon',
    description: 'dressed stone walls, cold greys and dull tints, worn',
    theme(seed) {
        const bond = pickWeighted(
            [
                ['random', 5],
                ['running', 3],
                ['stack', 2],
            ] as const,
            seed,
            SALT_BOND,
        );
        let rows = pickInt(3, 6, seed, SALT_ROW_COUNT);
        if (bond === 'running' && rows % 2 === 1) {
            // a running bond tiles vertically with an even number of rows only
            rows++;
        }
        // stones at least about as wide as high: the ashlar is 64 pixels high at own size
        const rowHeight = 64 / rows;
        const blockWidth = pickInt(
            Math.round(rowHeight * 0.9),
            Math.round(rowHeight * 1.5),
            seed,
            SALT_BLOCK_WIDTH,
        );
        const mortarSize = pickInt(1, 3, seed, SALT_MORTAR_SIZE);
        const palette = varyPalette(pickOne(DUNGEON_PALETTES, seed, SALT_PALETTE), {
            hue: pickFloat(-0.03, 0.03, seed, SALT_HUE),
            saturation: pickFloat(0.7, 1.2, seed, SALT_SATURATION),
            lightness: pickFloat(0.85, 1.1, seed, SALT_LIGHTNESS),
        });
        return {
            wall: {
                template: 'ashlar',
                rows: {
                    count: rows,
                    heightVariation: pickFloat(
                        0,
                        bond === 'random' ? 0.6 : 0.3,
                        seed,
                        SALT_ROW_HEIGHT,
                    ),
                },
                blocks: {
                    width: [blockWidth, blockWidth + pickInt(6, 24, seed, SALT_BLOCK_SPREAD)],
                    bond,
                },
                mortar: {
                    size: mortarSize,
                    color: darken(palette[0], pickFloat(0.55, 0.85, seed, SALT_MORTAR_COLOR)),
                },
                bevel: { size: pickInt(1, Math.min(3, mortarSize + 1), seed, SALT_BEVEL_SIZE) },
                stone: {
                    palette,
                    contrast: pickFloat(0.7, 1.6, seed, SALT_CONTRAST),
                },
                age: pickFloat(0.15, 0.75, seed, SALT_AGE),
            },
            liquid: drawLiquid(
                [
                    ['blood', 5],
                    ['oldBlood', 4],
                    ['slime', 1],
                    ['ichor', 1],
                ],
                seed,
            ),
        };
    },
};
