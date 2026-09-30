import { hashSeed } from '../../core/hash';
import { pickOne } from '../pick';
import { SALT_PLAIN_WALL, SALT_SMALL_WINDOW, SALT_WINDOW_ARCH } from '../salts';
import type { TextureRecipe } from '../types';

/** the window, in percent of the texture */
const WINDOW = { x: 33, y: 10, width: 33, height: 60 };

/** the slab beneath it, overlapping its foot as a sill, in percent of the texture */
const SILL = { x: 30, y: 66, width: 40, height: 15 };

/**
 * The plain wall of the set, same stones included, pierced by a small arched window, cut
 * through and fully transparent, a slab of the stone of the wall beneath it as a sill.
 */
export const smallWindow: TextureRecipe = {
    name: 'small-window',
    description: 'the plain wall, pierced by a small arched window above a stone sill',
    ambiances: ['dungeon'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_SMALL_WINDOW);
        const stone = theme.wall.stone as { palette?: string[] } | undefined;
        const age = typeof theme.wall.age === 'number' ? { age: theme.wall.age } : {};
        return {
            size,
            // the seed of the plain wall: the same stones around the window
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                { id: 'wall', patch: theme.wall, width: 100, height: 100 },
                {
                    id: 'window',
                    patch: {
                        template: 'opening',
                        arch: {
                            shape: pickOne(['round', 'pointed'] as const, own, SALT_WINDOW_ARCH),
                        },
                        // cut through: transparent, for the engine to show what lies behind
                        back: { mode: 'cut' },
                    },
                    ...WINDOW,
                    wrap: false,
                },
                {
                    id: 'sill',
                    patch: {
                        template: 'stoneslab',
                        // the stone of the wall
                        ...(stone?.palette ? { stone: { palette: stone.palette } } : {}),
                        ...age,
                    },
                    ...SILL,
                    wrap: false,
                    seed: hashSeed(own, 0),
                },
            ],
        };
    },
};
