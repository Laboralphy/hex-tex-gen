import type { Placement } from '../../compose/types';
import { hashSeed } from '../../core/hash';
import { pickFloat, pickInt } from '../pick';
import {
    SALT_PLAIN_WALL,
    SALT_SPLATTER_ANGLE,
    SALT_SPLATTER_BIAS,
    SALT_SPLATTER_COUNT,
    SALT_SPLATTER_SEED,
    SALT_SPLATTER_SIZE,
    SALT_SPLATTER_X,
    SALT_SPLATTER_Y,
    SALT_SPLATTERED_WALL,
} from '../salts';
import type { TextureRecipe } from '../types';

/**
 * The plain wall of the set, same stones included, with one to three splashes of the
 * liquid of the theme: laid next to the plain wall, it looks like the same wall.
 */
export const splatteredWall: TextureRecipe = {
    name: 'splattered-wall',
    description: 'the plain wall, splashed with the liquid of the theme',
    ambiances: ['dungeon', 'cave'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_SPLATTERED_WALL);
        const [width, height] = size;
        const splashes = Array.from(
            { length: pickInt(1, 3, own, SALT_SPLATTER_COUNT) },
            (_, i): Placement => {
                const splash = hashSeed(own, i);
                // square splashes, from half the texture width to the whole of it
                const side = pickFloat(0.5, 1, splash, SALT_SPLATTER_SIZE) * width;
                return {
                    patch: {
                        template: 'splatter',
                        direction: {
                            angle: pickInt(0, 359, splash, SALT_SPLATTER_ANGLE),
                            bias: pickFloat(0.1, 0.8, splash, SALT_SPLATTER_BIAS),
                        },
                        liquid: theme.liquid,
                    },
                    x: pickFloat(0, 100, splash, SALT_SPLATTER_X),
                    y: pickFloat(0, 100, splash, SALT_SPLATTER_Y),
                    width: Math.round((side / width) * 10000) / 100,
                    height: Math.round((side / height) * 10000) / 100,
                    seed: hashSeed(splash, SALT_SPLATTER_SEED),
                };
            },
        );
        return {
            size,
            // the seed of the plain wall: the same stones under the splashes
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [{ id: 'wall', patch: theme.wall, width: 100, height: 100 }, ...splashes],
        };
    },
};
