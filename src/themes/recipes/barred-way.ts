import { hashSeed } from '../../core/hash';
import type { Placement } from '../../compose/types';
import { pickOne } from '../pick';
import {
    SALT_BARRED_WAY,
    SALT_BEAM_PROFILE,
    SALT_CAVE_BARRED_WAY,
    SALT_CHURCH_BARRED_WAY,
    SALT_INTERIOR_BARRED_WAY,
    SALT_PLAIN_WALL,
} from '../salts';
import type { Theme, TextureRecipe } from '../types';
import { beamWood } from './wood';

/** thickness of the beams of a cave, in percent of the texture width */
const BEAM = 15;

/** the whole texture */
const FULL = { x: 0, y: 0, width: 100, height: 100 };

/** the wooden posts of interiors, each as wide as this, in percent of the texture width */
const POST = 10;

/** the wooden rail of interiors, across the posts, in percent of the texture */
const RAIL = { x: 0, y: 66, width: 100, height: 10 };

/** the top of the low wall of churches, in percent of the texture height */
const PARAPET = 50;

/**
 * The wall, cut through as a whole but for its reveals along the edges: shared by every
 * variant.
 */
function cutWay(theme: Theme): Placement[] {
    return [
        { id: 'wall', patch: theme.wall, width: 100, height: 100 },
        {
            id: 'way',
            patch: { template: 'opening', back: { mode: 'cut' } },
            ...FULL,
            wrap: false,
        },
    ];
}

/**
 * The wall cut through as a whole, and bars across the whole way: shared by the variants
 * of dungeons and caves.
 */
function barredWay(theme: Theme, own: number): Placement[] {
    return [
        ...cutWay(theme),
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

/**
 * A way closed by wood in an interior: the plain wall, same planks included, cut through as
 * a whole, transparent but for its reveals along the edges, four wooden posts standing
 * across it from top to bottom, and a wooden rail across them. It has the name of the
 * barred way of dungeons.
 */
export const barredWayInterior: TextureRecipe = {
    name: 'barred-way',
    description: 'the plain wall cut through as a whole, four wooden posts and a rail across it',
    ambiances: ['interior'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_INTERIOR_BARRED_WAY);
        const [width, height] = size;
        const beam = {
            template: 'woodbeam',
            ...beamWood(theme),
            ...(typeof theme.wall.age === 'number' ? { age: theme.wall.age } : {}),
        };
        // centered in four equal columns
        const post = (i: number): Placement => ({
            patch: {
                ...beam,
                direction: 'vertical',
                size: [Math.round((POST / 100) * width), height],
            },
            x: 25 * i + (25 - POST) / 2,
            y: 0,
            width: POST,
            height: 100,
            wrap: false,
            seed: hashSeed(own, i),
        });
        return {
            size,
            // the seed of the plain wall: the same planks in its reveals
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                ...cutWay(theme),
                ...[0, 1, 2, 3].map(post),
                // the rail over the posts
                {
                    patch: {
                        ...beam,
                        size: [width, Math.round((RAIL.height / 100) * height)],
                    },
                    ...RAIL,
                    wrap: false,
                    seed: hashSeed(own, 4),
                },
            ],
        };
    },
};

/**
 * A way closed by a low wall in a church: the plain wall, same stones included, cut
 * through above mid-height, transparent, the entablature of the top of the walls moved
 * down to cap the low wall, the one of the bottom kept. It has the name of the barred way
 * of dungeons.
 */
export const barredWayChurch: TextureRecipe = {
    name: 'barred-way',
    description: 'the plain wall cut through above mid-height, a low wall capped by an entablature',
    ambiances: ['church'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_CHURCH_BARRED_WAY);
        return {
            size,
            // the seed of the plain wall: the same stones in the low wall
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                { id: 'wall', patch: theme.wall, width: 100, height: 100 },
                {
                    id: 'way',
                    // no reveals: the entablature caps the cut
                    patch: { template: 'opening', depth: 0, back: { mode: 'cut' } },
                    x: 0,
                    y: 0,
                    width: 100,
                    height: PARAPET,
                    wrap: false,
                    seed: own,
                },
                // the entablature of the top caps the low wall, the one of the bottom stays
                ...(theme.trim ?? []).map((trim) =>
                    trim.y === 0 ? { ...trim, id: 'coping', y: PARAPET } : trim,
                ),
            ],
        };
    },
};
