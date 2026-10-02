import { hashSeed } from '../../core/hash';
import { CHURCH_TRIM as TRIM } from '../ambiances/church';
import { pickOne } from '../pick';
import { SALT_ALCOVE_ARCH, SALT_ALCOVE_ORDER, SALT_CHURCH_ALCOVE, SALT_PLAIN_WALL } from '../salts';
import type { TextureRecipe } from '../types';
import { wallPatches } from './plain-wall';

/** the columns, at both sides between the entablatures, in percent of the texture width */
const COLUMN = 15;

/** the opening between them, from under the top entablature to the floor, in percent */
const OPENING = { x: 20, y: TRIM, width: 60, height: 100 - TRIM };

/**
 * The alcove of churches: the plain wall, same stones and entablatures included, cut by an
 * arched opening from under the top entablature to the floor, fully transparent, through
 * the bottom entablature, between two columns of the stone of the wall standing on the
 * bottom entablature, under the top one. It has the name of the alcove of dungeons.
 */
export const churchAlcove: TextureRecipe = {
    name: 'arch-alcove',
    description:
        'the plain wall, cut by an arched opening between two columns, between its entablatures',
    ambiances: ['church'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_CHURCH_ALCOVE);
        const stone = theme.wall.stone as { palette?: string[] } | undefined;
        const column = (x: number, k: number) => ({
            patch: {
                template: 'column',
                order: pickOne(['doric', 'ionic', 'tuscan'] as const, own, SALT_ALCOVE_ORDER),
                // the stone of the wall, not marble
                ...(stone?.palette ? { marble: { palette: stone.palette } } : {}),
                ...(typeof theme.wall.age === 'number' ? { age: theme.wall.age } : {}),
            },
            x,
            y: TRIM,
            width: COLUMN,
            height: 100 - 2 * TRIM,
            wrap: false,
            seed: hashSeed(own, k),
        });
        return {
            size,
            // the seed of the plain wall: the same stones around the opening
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                // the entablatures first: the opening cuts through the bottom one
                ...wallPatches(theme),
                {
                    id: 'alcove',
                    patch: {
                        template: 'opening',
                        // down to the floor: no reveal at the bottom
                        open: ['bottom'],
                        arch: {
                            shape: pickOne(['round', 'pointed'] as const, own, SALT_ALCOVE_ARCH),
                        },
                        // cut through: transparent, for the engine to show what lies behind
                        back: { mode: 'cut' },
                    },
                    ...OPENING,
                    wrap: false,
                },
                column(0, 0),
                column(100 - COLUMN, 1),
            ],
        };
    },
};
