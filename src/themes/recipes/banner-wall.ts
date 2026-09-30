import type { Placement } from '../../compose/types';
import { hashSeed } from '../../core/hash';
import { darken } from '../color';
import { pickFloat, pickInt, pickOne, pickWeighted } from '../pick';
import {
    SALT_BANNER_COLORS,
    SALT_BANNER_DEPTH,
    SALT_BANNER_FOLDS,
    SALT_BANNER_FRINGE,
    SALT_BANNER_PATTERN,
    SALT_BANNER_SHAPE,
    SALT_BANNER_STRIPE,
    SALT_BANNER_TAILS,
    SALT_BANNER_WALL,
    SALT_PLAIN_WALL,
} from '../salts';
import type { TextureRecipe, Theme } from '../types';

/** the banner, in percent of the texture */
const BANNER = { x: 20, y: 15, width: 60, height: 70 };

/** the patterns of the fabric, and how often each is drawn */
const PATTERNS = [
    ['none', 3],
    ['lozenge', 1],
    ['checky', 1],
    ['semy', 1],
    ['stripes', 1],
] as const;

/** heraldic colors: a fabric and the metal or color of its trim */
export const BANNER_COLORS: readonly (readonly [string, string])[] = [
    ['#8a1a1a', '#d4a53a'], // red and gold
    ['#1f5a2a', '#c4c8cc'], // green and silver
    ['#1c1a1c', '#d4a53a'], // black and gold
    ['#e6e1d3', '#2a4a9a'], // white and blue
    ['#1d3f8a', '#d4a53a'], // blue and gold
    ['#4a1a5a', '#c4c8cc'], // purple and silver
    ['#8a1a1a', '#c4c8cc'], // red and silver
    ['#1c1a1c', '#c4c8cc'], // black and silver
    ['#e6e1d3', '#8a1a1a'], // white and red
    ['#c8962e', '#1c1a1c'], // gold and black
];

/**
 * The colors of the banners of a set: a pair of the list for each banner, never the same
 * pair for two banners of a set.
 */
function bannerColors(seed: number, index: number): readonly [string, string] {
    const own = hashSeed(seed, SALT_BANNER_WALL);
    const drawn: number[] = [];
    for (let i = 0; i <= index; ++i) {
        // among the pairs not drawn yet, in the order of the list
        const left = BANNER_COLORS.map((_, k) => k).filter((k) => !drawn.includes(k));
        drawn.push(pickOne(left, hashSeed(own, i), SALT_BANNER_COLORS));
    }
    return BANNER_COLORS[drawn[index]];
}

/**
 * A banner of a set, at the same place in every texture: its colors, shape and pattern
 * are its own, drawn from the seed of the set and its index.
 */
function banner(theme: Theme, seed: number, index: number): Placement {
    const own = hashSeed(hashSeed(seed, SALT_BANNER_WALL), index);
    const [fabric, metal] = bannerColors(seed, index);
    return {
        patch: {
            template: 'banner',
            shape: {
                base: pickOne(
                    ['flat', 'point', 'swallowtail', 'tails'] as const,
                    own,
                    SALT_BANNER_SHAPE,
                ),
                depth: pickFloat(0.15, 0.35, own, SALT_BANNER_DEPTH),
                tails: pickInt(2, 4, own, SALT_BANNER_TAILS),
            },
            fabric: { color: fabric },
            border: {
                stripes: [{ color: metal, width: pickInt(1, 2, own, SALT_BANNER_STRIPE) }],
            },
            pattern: {
                kind: pickWeighted(PATTERNS, own, SALT_BANNER_PATTERN),
                colors: [metal, darken(fabric, 0.6)],
            },
            fringe: pickOne([0, 0, 2], own, SALT_BANNER_FRINGE),
            folds: { count: pickInt(2, 4, own, SALT_BANNER_FOLDS) },
            age: theme.decor.age,
        },
        ...BANNER,
        wrap: false,
        seed: own,
    };
}

/**
 * The plain wall of the set, same stones or planks included, with a banner hanging in its
 * middle, of its own colors and shape, as worn as the decorations of the theme.
 */
function bannerWall(index: number): TextureRecipe {
    return {
        name: `banner-wall-${index + 1}`,
        description: 'the plain wall, with a banner of heraldic colors hanging in its middle',
        ambiances: ['dungeon', 'cave', 'interior'],
        build(theme, seed, size) {
            return {
                size,
                // the seed of the plain wall: the same stones behind the banner
                seed: hashSeed(seed, SALT_PLAIN_WALL),
                patches: [
                    { id: 'wall', patch: theme.wall, width: 100, height: 100 },
                    banner(theme, seed, index),
                ],
            };
        },
    };
}

/** the plain wall with the first banner of the set */
export const bannerWall1 = bannerWall(0);

/** the plain wall with the second banner of the set, of other colors than the first */
export const bannerWall2 = bannerWall(1);
