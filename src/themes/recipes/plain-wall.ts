import { hashSeed } from '../../core/hash';
import { SALT_PLAIN_WALL } from '../salts';
import type { TextureRecipe } from '../types';

/**
 * The wall of the theme, alone.
 */
export const plainWall: TextureRecipe = {
    name: 'plain-wall',
    description: 'the wall of the theme, alone',
    ambiances: ['dungeon', 'cave'],
    build(theme, seed, size) {
        return {
            size,
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [{ id: 'wall', patch: theme.wall, width: 100, height: 100 }],
        };
    },
};
