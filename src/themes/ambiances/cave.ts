import { darken, varyPalette } from '../color';
import { drawLiquid } from '../liquids';
import { pickFloat, pickInt, pickOne } from '../pick';
import {
    SALT_AGE,
    SALT_CONTRAST,
    SALT_HUE,
    SALT_LIGHTNESS,
    SALT_MORTAR_COLOR,
    SALT_MORTAR_SIZE,
    SALT_PALETTE,
    SALT_PALETTE_SHIFT,
    SALT_SATURATION,
    SALT_STONE_COLUMNS,
    SALT_STONE_RELIEF,
    SALT_STONE_ROWS,
    SALT_STONE_VARIATION,
} from '../salts';
import type { Ambiance } from '../types';

/** rock colors of caves, from darkest to lightest: earths, slates and limestones */
const CAVE_PALETTES = [
    ['#2b2723', '#4f4840', '#776d60', '#9d917f'], // brown
    ['#33230f', '#5e4320', '#8a6633', '#b38a4d'], // ochre
    ['#1f2226', '#3b4047', '#5a6069', '#7d848d'], // slate
    ['#301a14', '#5a3024', '#824836', '#a8634c'], // red earth
    ['#3a3833', '#66625a', '#908b80', '#b9b3a6'], // limestone
    ['#1c211a', '#363f31', '#525d4a', '#717d67'], // damp green
];

/**
 * Caves: heaps of rounded boulders, in earthy colors, old.
 */
export const cave: Ambiance = {
    name: 'cave',
    description: 'heaps of rounded boulders, earths, slates and limestones, old',
    theme(seed) {
        const palette = varyPalette(pickOne(CAVE_PALETTES, seed, SALT_PALETTE), {
            hue: pickFloat(-0.03, 0.03, seed, SALT_HUE),
            saturation: pickFloat(0.7, 1.2, seed, SALT_SATURATION),
            lightness: pickFloat(0.85, 1.1, seed, SALT_LIGHTNESS),
        });
        return {
            wall: {
                template: 'cavewall',
                stones: {
                    cells: [
                        pickInt(3, 6, seed, SALT_STONE_COLUMNS),
                        pickInt(3, 6, seed, SALT_STONE_ROWS),
                    ],
                    variation: pickFloat(0.4, 0.9, seed, SALT_STONE_VARIATION),
                    relief: pickFloat(0.6, 1, seed, SALT_STONE_RELIEF),
                },
                mortar: {
                    size: pickInt(1, 3, seed, SALT_MORTAR_SIZE),
                    color: darken(palette[0], pickFloat(0.4, 0.65, seed, SALT_MORTAR_COLOR)),
                },
                stone: {
                    palette,
                    contrast: pickFloat(0.6, 1.2, seed, SALT_CONTRAST),
                    paletteShift: pickFloat(0.15, 0.35, seed, SALT_PALETTE_SHIFT),
                },
                age: pickFloat(0.4, 1, seed, SALT_AGE),
            },
            liquid: drawLiquid(
                [
                    ['slime', 3],
                    ['water', 3],
                    ['blood', 2],
                    ['ichor', 1],
                ],
                seed,
            ),
        };
    },
};
