import { hashSeed } from '../../core/hash';
import type { Placement } from '../../compose/types';
import { pickOne } from '../pick';
import {
    SALT_BARRED_WAY,
    SALT_BEAM_PROFILE,
    SALT_CAVE_BARRED_WAY,
    SALT_PLAIN_WALL,
} from '../salts';
import type { Theme, TextureRecipe } from '../types';

/** thickness of the beams of a cave, in percent of the texture width */
const BEAM = 15;

/** the whole texture */
const FULL = { x: 0, y: 0, width: 100, height: 100 };

/**
 * The wall, cut through as a whole but for its reveals along the edges, and bars across
 * the whole way: shared by both variants.
 */
function barredWay(theme: Theme, own: number): Placement[] {
    return [
        { id: 'wall', patch: theme.wall, width: 100, height: 100 },
        {
            id: 'way',
            patch: { template: 'opening', back: { mode: 'cut' } },
            ...FULL,
            wrap: false,
        },
        {
            id: 'bars',
            patch: {
                template: 'bars',
                ...(typeof theme.wall.age === 'number' ? { age: theme.wall.age } : {}),
            },
            ...FULL,
            wrap: false,
            seed: hashSeed(own, 0),
        },
    ];
}

/**
 * A way closed by bars in a dungeon: the plain wall, same stones included, cut through as
 * a whole, transparent but for its reveals along the edges, bars running across it from
 * top to bottom.
 */
export const barredWayDungeon: TextureRecipe = {
    name: 'barred-way',
    description: 'the plain wall cut through as a whole, bars across it',
    ambiances: ['dungeon'],
    build(theme, seed, size) {
        return {
            size,
            // the seed of the plain wall: the same stones in its reveals
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: barredWay(theme, hashSeed(seed, SALT_BARRED_WAY)),
        };
    },
};

/**
 * A way closed by bars in a cave: the plain cave wall cut through as a whole, bars across
 * it, and four thick wooden beams along the edges of the texture framing the way, over the
 * ends of the bars. It has the name of the barred way of dungeons.
 */
export const barredWayCave: TextureRecipe = {
    name: 'barred-way',
    description: 'bars across the whole way, framed by four wooden beams along the edges',
    ambiances: ['cave'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_CAVE_BARRED_WAY);
        const [width, height] = size;
        const beam = {
            template: 'woodbeam',
            profile: pickOne(['squared', 'log'] as const, own, SALT_BEAM_PROFILE),
            ...(typeof theme.wall.age === 'number' ? { age: theme.wall.age } : {}),
        };
        // as thick across as along: the same pixels, horizontally and vertically
        const thick = Math.max(1, Math.round((BEAM / 100) * width));
        const across = Math.round((thick / height) * 10000) / 100;
        const post = (x: number, k: number): Placement => ({
            patch: { ...beam, direction: 'vertical', size: [thick, height] },
            x,
            y: 0,
            width: BEAM,
            height: 100,
            wrap: false,
            seed: hashSeed(own, k),
        });
        const rail = (y: number, k: number): Placement => ({
            patch: { ...beam, size: [width, thick] },
            x: 0,
            y,
            width: 100,
            height: across,
            wrap: false,
            seed: hashSeed(own, k),
        });
        return {
            size,
            // the seed of the plain wall: the same stones in its reveals
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                ...barredWay(theme, own),
                // posts at both sides, then rails along the top and the bottom, over them
                post(0, 1),
                post(100 - BEAM, 2),
                rail(0, 3),
                rail(Math.round((100 - across) * 100) / 100, 4),
            ],
        };
    },
};
