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
 * liquid of the theme, kept inside the texture: laid next to the plain wall, it looks like
 * the same wall.
 */
export const splatteredWall: TextureRecipe = {
    name: 'splattered-wall',
    description: 'the plain wall, splashed with the liquid of the theme',
    ambiances: ['dungeon', 'cave', 'interior'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_SPLATTERED_WALL);
        const [width, height] = size;
        const splashes = Array.from(
            { length: pickInt(1, 3, own, SALT_SPLATTER_COUNT) },
            (_, i): Placement => {
                const splash = hashSeed(own, i);
                // square splashes, from half the texture width to the whole of it but for a
                // pixel on each side, placed a pixel away from the edges at least: no drop
                // reaches an edge where the wall meets another texture
                const side = Math.min(
                    pickFloat(0.5, 1, splash, SALT_SPLATTER_SIZE) * width,
                    width - 2,
                    height - 2,
                );
                const w = Math.round((side / width) * 10000) / 100;
                const h = Math.round((side / height) * 10000) / 100;
                const [mx, my] = [100 / width, 100 / height];
                const place = (share: number, span: number, margin: number) =>
                    Math.round((margin + share * Math.max(0, 100 - span - 2 * margin)) * 100) / 100;
                return {
                    patch: {
                        template: 'splatter',
                        direction: {
                            angle: pickInt(0, 359, splash, SALT_SPLATTER_ANGLE),
                            bias: pickFloat(0.1, 0.8, splash, SALT_SPLATTER_BIAS),
                        },
                        liquid: theme.liquid,
                    },
                    x: place(pickFloat(0, 1, splash, SALT_SPLATTER_X), w, mx),
                    y: place(pickFloat(0, 1, splash, SALT_SPLATTER_Y), h, my),
                    width: w,
                    height: h,
                    // never wrapped around, should rounding push it past an edge
                    wrap: false,
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
