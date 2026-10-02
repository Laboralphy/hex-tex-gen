import { hashSeed } from '../../core/hash';
import { pickInt, pickWeighted } from '../pick';
import { SALT_CHURCH_WINDOW, SALT_GLASS_CELLS, SALT_PLAIN_WALL, SALT_WINDOW_ARCH } from '../salts';
import type { TextureRecipe } from '../types';
import { wallPatches } from './plain-wall';

/** the window, between the entablatures, in percent of the texture */
const WINDOW = { x: 30, y: 20, width: 40, height: 60 };

/**
 * The window of churches: the plain wall, same stones and entablatures included, with a
 * stained glass window in its middle, cutting its own hole, its translucent glass showing
 * what lies behind the wall. It has the name of the small window of dungeons.
 */
export const churchWindow: TextureRecipe = {
    name: 'small-window',
    description: 'the plain wall, pierced by a stained glass window under an arch',
    ambiances: ['church'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_CHURCH_WINDOW);
        return {
            size,
            // the seed of the plain wall: the same stones around the window
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                ...wallPatches(theme),
                {
                    id: 'window',
                    patch: {
                        template: 'stainedglass',
                        arch: {
                            shape: pickWeighted(
                                [
                                    ['pointed', 3],
                                    ['round', 1],
                                ] as const,
                                own,
                                SALT_WINDOW_ARCH,
                            ),
                        },
                        cells: { count: pickInt(10, 24, own, SALT_GLASS_CELLS) },
                    },
                    ...WINDOW,
                    wrap: false,
                    seed: hashSeed(own, 0),
                },
            ],
        };
    },
};
