import { hashSeed } from '../../core/hash';
import { pickFloat, pickInt, pickWeighted } from '../pick';
import {
    SALT_BREACH_ANGLE,
    SALT_BREACH_COUNT,
    SALT_BREACH_CRACKS,
    SALT_BREACH_JAGGEDNESS,
    SALT_BREACH_SEED,
    SALT_BREACH_SHAPE,
    SALT_BREACH_SIZE,
    SALT_BREACH_SPAN,
    SALT_BREACH_SPIKES,
    SALT_BREACH_X,
    SALT_BREACH_Y,
    SALT_BREACHED_WALL,
    SALT_PLAIN_WALL,
} from '../salts';
import type { TextureRecipe } from '../types';

/** the shapes of the hole, and how often each is drawn */
const SHAPES = [
    ['burst', 4],
    ['gash', 2],
    ['fissure', 1.5],
    ['pocks', 1.5],
    ['collapse', 1.5],
    ['bore', 1],
    ['slits', 1],
] as const;

/** a percentage of the texture, rounded to two decimals */
const percent = (share: number) => Math.round(share * 10000) / 100;

/**
 * The plain wall of the set, same stones included, broken through by a hole with earth
 * behind it, of any shape: a burst, claw gashes, a fissure, pocks of shots, a collapse
 * from the top of the wall, a bored tunnel or arrow slits: laid next to the plain wall, it looks like the same wall. The hole stays
 * inside the texture, so that it is not cut by the walls around it.
 */
export const breachedWall: TextureRecipe = {
    name: 'breached-wall',
    description: 'the plain wall, broken through by a hole with earth behind it',
    ambiances: ['dungeon', 'cave'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_BREACHED_WALL);
        const [width, height] = size;
        // a square breach, from 60 to 90 percent of the texture width, away from the top
        // and the bottom of the wall
        const side = pickFloat(0.6, 0.9, own, SALT_BREACH_SIZE) * width;
        const w = side / width;
        const h = Math.min(1, side / height);
        const top = Math.min(0.15, (1 - h) / 2);
        const shape = pickWeighted(SHAPES, own, SALT_BREACH_SHAPE);
        // strokes lean either way; a fissure runs mostly downwards
        const lean = pickInt(0, 1, own, SALT_BREACH_ANGLE) === 0 ? 1 : -1;
        const strokes = {
            gash: {
                count: pickInt(3, 4, own, SALT_BREACH_COUNT),
                angle: 90 + lean * pickInt(25, 45, own, SALT_BREACH_ANGLE),
            },
            fissure: { angle: 90 + lean * pickInt(0, 20, own, SALT_BREACH_ANGLE), width: 0.25 },
            pocks: { count: pickInt(3, 6, own, SALT_BREACH_COUNT) },
            burst: { spikes: pickInt(5, 9, own, SALT_BREACH_SPIKES) },
            collapse: {},
            bore: {},
            slits: {
                count: pickInt(1, 3, own, SALT_BREACH_COUNT),
                width: 0.1,
                cross: pickInt(0, 2, own, SALT_BREACH_ANGLE) === 0,
            },
        }[shape];
        return {
            size,
            // the seed of the plain wall: the same stones around the hole
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                { id: 'wall', patch: theme.wall, width: 100, height: 100 },
                {
                    patch: {
                        template: 'breach',
                        hole: {
                            shape,
                            size: pickFloat(0.8, 0.95, own, SALT_BREACH_SPAN),
                            jaggedness: pickFloat(0, 0.6, own, SALT_BREACH_JAGGEDNESS),
                            ...strokes,
                        },
                        cracks: { count: pickInt(3, 7, own, SALT_BREACH_CRACKS) },
                    },
                    x: percent(pickFloat(0, 1, own, SALT_BREACH_X) * (1 - w)),
                    // a collapse falls from the top of the wall
                    y:
                        shape === 'collapse'
                            ? 0
                            : percent(
                                  top + pickFloat(0, 1, own, SALT_BREACH_Y) * (1 - h - 2 * top),
                              ),
                    width: percent(w),
                    height: percent(h),
                    wrap: false,
                    seed: hashSeed(own, SALT_BREACH_SEED),
                },
            ],
        };
    },
};
