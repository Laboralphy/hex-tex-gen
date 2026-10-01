import { hashSeed } from '../../core/hash';
import { pickFloat } from '../pick';
import {
    SALT_BURN_BASE,
    SALT_BURN_BASE_WIDTH,
    SALT_BURN_CHAR,
    SALT_BURN_HEIGHT,
    SALT_BURN_LEAN,
    SALT_BURN_PLUME,
    SALT_BURN_SEED,
    SALT_BURN_SOOT,
    SALT_BURN_TONGUES,
    SALT_BURN_WIDTH,
    SALT_BURN_X,
    SALT_BURNT_WALL,
    SALT_PLAIN_WALL,
} from '../salts';
import type { TextureRecipe } from '../types';
import { wallPatches } from './plain-wall';

/** a percentage of the texture, rounded to two decimals */
const percent = (share: number) => Math.round(share * 10000) / 100;

/** [min, max] of the soot of a fire, drawn by the seed */
type Soot = { opacity: [number, number]; char: [number, number] };

/**
 * The plain wall of the set, same stones included, with the soot of a fire that burned at
 * its foot: laid next to the plain wall, it looks like the same wall. The mark fades out
 * inside the texture, so that it never reaches an edge where the wall meets another
 * texture.
 */
function burntWall(ambiance: string, soot: Soot, description: string): TextureRecipe {
    return {
        name: 'burnt-wall',
        description,
        ambiances: [ambiance],
        build(theme, seed, size) {
            const own = hashSeed(seed, SALT_BURNT_WALL);
            const w = pickFloat(0.6, 0.95, own, SALT_BURN_WIDTH);
            const h = pickFloat(0.5, 0.85, own, SALT_BURN_HEIGHT);
            return {
                size,
                // the seed of the plain wall: the same stones under the soot
                seed: hashSeed(seed, SALT_PLAIN_WALL),
                patches: [
                    ...wallPatches(theme),
                    {
                        patch: {
                            template: 'burn',
                            base: {
                                y: pickFloat(0.8, 0.92, own, SALT_BURN_BASE),
                                width: pickFloat(0.25, 0.5, own, SALT_BURN_BASE_WIDTH),
                            },
                            plume: {
                                height: pickFloat(0.7, 1, own, SALT_BURN_PLUME),
                                lean: pickFloat(-0.4, 0.4, own, SALT_BURN_LEAN),
                                tongues: pickFloat(0.3, 0.7, own, SALT_BURN_TONGUES),
                            },
                            soot: { opacity: pickFloat(...soot.opacity, own, SALT_BURN_SOOT) },
                            char: { amount: pickFloat(...soot.char, own, SALT_BURN_CHAR) },
                        },
                        // standing on the floor, the fire at the foot of the wall
                        x: percent(pickFloat(0, 1, own, SALT_BURN_X) * (1 - w)),
                        y: percent(1 - h),
                        width: percent(w),
                        height: percent(h),
                        wrap: false,
                        seed: hashSeed(own, SALT_BURN_SEED),
                    },
                ],
            };
        },
    };
}

/** the burnt wall of dungeons */
export const burntWallDungeon = burntWall(
    'dungeon',
    { opacity: [0.7, 0.9], char: [0.2, 0.5] },
    'the plain wall, blackened by a fire that burned at its foot',
);

/**
 * The burnt wall of caves: denser soot and more charring, which the dark and earthy rock
 * of caves would hide otherwise.
 */
export const burntWallCave = burntWall(
    'cave',
    { opacity: [0.92, 1], char: [0.4, 0.65] },
    'the plain wall, blackened by the dense soot of a fire that burned at its foot',
);

/** the burnt wall of interiors: planks blackened like the stones of dungeons */
export const burntWallInterior = burntWall(
    'interior',
    { opacity: [0.7, 0.9], char: [0.2, 0.5] },
    'the plain wall, blackened by a fire that burned at its foot',
);
