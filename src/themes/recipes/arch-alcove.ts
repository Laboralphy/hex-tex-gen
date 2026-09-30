import { hashSeed } from '../../core/hash';
import { pickOne } from '../pick';
import { SALT_ALCOVE_ARCH, SALT_ALCOVE_ORDER, SALT_ARCH_ALCOVE, SALT_PLAIN_WALL } from '../salts';
import type { TextureRecipe } from '../types';

/** the columns, full height at both sides, in percent of the texture width */
const COLUMN = 15;

/** the opening between them, in percent of the texture */
const OPENING = { x: 20, y: 5, width: 60, height: 95 };

/**
 * The plain wall of the set, same stones included, with an arched opening cut through it
 * from the floor, fully transparent, between two columns of the stone of the wall
 * standing at both sides of the texture.
 */
export const archAlcove: TextureRecipe = {
    name: 'arch-alcove',
    description: 'the plain wall, cut by an arched opening, between two columns at its sides',
    ambiances: ['dungeon'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_ARCH_ALCOVE);
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
            y: 0,
            width: COLUMN,
            height: 100,
            wrap: false,
            seed: hashSeed(own, k),
        });
        return {
            size,
            // the seed of the plain wall: the same stones around the opening
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                { id: 'wall', patch: theme.wall, width: 100, height: 100 },
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
