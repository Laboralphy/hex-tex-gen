import { hashSeed } from '../../core/hash';
import { SALT_PLAIN_WALL } from '../salts';
import type { TextureRecipe } from '../types';

/**
 * The plain wall of the set, same stones included, set back and darkened as a whole: an
 * opening covering the whole texture, its back the wall in shadow, its reveals along the
 * edges. It is the back wall of an alcove.
 */
export const alcoveBackground: TextureRecipe = {
    name: 'alcove-background',
    description: 'the plain wall, darkened as a whole: the back wall of an alcove',
    ambiances: ['dungeon', 'cave', 'interior'],
    build(theme, seed, size) {
        return {
            size,
            // the seed of the plain wall: the same stones, in shadow
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                { id: 'wall', patch: theme.wall, width: 100, height: 100 },
                {
                    id: 'inset',
                    patch: { template: 'opening', back: { mode: 'shade' } },
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                    wrap: false,
                },
            ],
        };
    },
};
