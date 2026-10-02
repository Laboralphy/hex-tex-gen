import type { Placement } from '../../compose/types';
import { hashSeed } from '../../core/hash';
import { SALT_PLAIN_WALL } from '../salts';
import type { Theme, TextureRecipe } from '../types';

/**
 * The plain wall of a theme, as the first patches of a texture: the wall, then its trim
 * when the theme has one, such as the entablature along the floor of interiors.
 */
export function wallPatches(theme: Theme): Placement[] {
    return [{ id: 'wall', patch: theme.wall, width: 100, height: 100 }, ...(theme.trim ?? [])];
}

/**
 * The wall of the theme, alone, with its trim.
 */
export const plainWall: TextureRecipe = {
    name: 'plain-wall',
    description: 'the wall of the theme, alone',
    ambiances: ['dungeon', 'cave', 'interior', 'church'],
    build(theme, seed, size) {
        return {
            size,
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: wallPatches(theme),
        };
    },
};
