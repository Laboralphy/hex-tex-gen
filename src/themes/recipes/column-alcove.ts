import { hashSeed } from '../../core/hash';
import { varyPalette } from '../color';
import { pickFloat, pickOne } from '../pick';
import {
    SALT_ALCOVE_DENTILS,
    SALT_ALCOVE_FRIEZE,
    SALT_ALCOVE_ORDER,
    SALT_COLUMN_ALCOVE,
    SALT_PLAIN_WALL,
} from '../salts';
import type { TextureRecipe } from '../types';

/** the entablature, across the top of the texture, in percent of the texture height */
const ENTABLATURE = 12.5;

/** the columns, at both sides under the entablature, in percent of the texture width */
const COLUMN = 15;

/** the opening between the columns, in percent of the texture */
const OPENING = { x: 20, y: ENTABLATURE, width: 60, height: 100 - ENTABLATURE };

/**
 * The plain wall of the set, same planks included, with a flat-topped opening cut through
 * it from the floor, fully transparent, between two sculpted columns standing at both
 * sides of the texture, under an entablature running across its top: columns and
 * entablature carved in the wood of the wall.
 */
export const columnAlcove: TextureRecipe = {
    name: 'arch-alcove',
    description:
        'the plain wall, cut by an opening between two carved columns, under a carved entablature',
    ambiances: ['interior'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_COLUMN_ALCOVE);
        const wood = theme.wall.wood as { palette?: string[] } | undefined;
        // the wood of the wall, carved and polished: its palette, a little lighter so that
        // the carving stands out of the panelling, in place of the marble
        const polished = wood?.palette
            ? varyPalette(wood.palette, { hue: 0, saturation: 1, lightness: 1.12 })
            : undefined;
        const carved = {
            ...(polished ? { marble: { palette: polished, veins: 0 } } : {}),
            ...(typeof theme.wall.age === 'number' ? { age: theme.wall.age } : {}),
        };
        const column = (x: number, k: number) => ({
            patch: {
                template: 'column',
                order: pickOne(['doric', 'ionic', 'tuscan'] as const, own, SALT_ALCOVE_ORDER),
                ...carved,
            },
            x,
            y: ENTABLATURE,
            width: COLUMN,
            height: 100 - ENTABLATURE,
            wrap: false,
            seed: hashSeed(own, k),
        });
        return {
            size,
            // the seed of the plain wall: the same planks around the opening
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                { id: 'wall', patch: theme.wall, width: 100, height: 100 },
                {
                    id: 'alcove',
                    patch: {
                        template: 'opening',
                        // down to the floor: no reveal at the bottom
                        open: ['bottom'],
                        // cut through: transparent, for the engine to show what lies behind
                        back: { mode: 'cut' },
                    },
                    ...OPENING,
                    wrap: false,
                },
                column(0, 0),
                column(100 - COLUMN, 1),
                {
                    patch: {
                        template: 'entablature',
                        frieze: {
                            pattern: pickOne(
                                ['meander', 'triglyph', 'plain'] as const,
                                own,
                                SALT_ALCOVE_FRIEZE,
                            ),
                        },
                        dentils: pickFloat(0, 1, own, SALT_ALCOVE_DENTILS) < 0.5,
                        ...carved,
                    },
                    x: 0,
                    y: 0,
                    width: 100,
                    height: ENTABLATURE,
                    wrap: false,
                    seed: hashSeed(own, 2),
                },
            ],
        };
    },
};
