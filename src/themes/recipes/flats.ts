import { createMemoryLoader, renderTexture } from '../../compose';
import { hashSeed } from '../../core/hash';
import { DIRT_PALETTE } from '../../generators/common/Dirt';
import { blendPalette, darken } from '../color';
import { pickFloat, pickInt, pickOne } from '../pick';
import {
    SALT_CAVE_CEILING_BREACH,
    SALT_CEILING,
    SALT_CEILING_BREACH_CRACKS,
    SALT_CEILING_BREACH_JAGGEDNESS,
    SALT_CEILING_BREACH_SHAPE,
    SALT_CEILING_BREACH_SIZE,
    SALT_CEILING_OPENING,
    SALT_FLOOR,
    SALT_FLOOR_SPLATTERED,
    SALT_PLAIN_WALL,
} from '../salts';
import type { Theme, ThemePatch, TextureRecipe } from '../types';
import { splashes } from './splattered-wall';

/** lightness of the floor, and of the ceiling, as a share of the lightness of the wall */
const FLOOR = 0.8;
const CEILING = 0.6;

/** the opening in a ceiling, in percent of the texture */
const HATCH = { x: 25, y: 25, width: 50, height: 50 };

/** how far the floor of a cave leans from the hue of its stones to brown earth, in [0, 1] */
const EARTH = 0.85;

/** the breach in the ceiling of a cave, in percent of the texture */
const BREACH = { x: 20, y: 20, width: 60, height: 60 };

/** a floor or a ceiling */
type Part = 'floor' | 'ceiling';

/** the colors of a palette, each darkened to a share of its lightness */
const darker = (palette: string[], factor: number) => palette.map((c) => darken(c, factor));

/** the mean brightness of the pixels of a texture, its red, green and blue summed */
function lightness(patch: ThemePatch, size: [number, number], seed: number): number {
    const texture = renderTexture(
        { size, seed, patches: [{ patch, width: 100, height: 100 }] },
        createMemoryLoader({}),
    );
    let sum = 0;
    for (let i = 0; i < texture.data.length; i += 4) {
        sum += texture.data[i] + texture.data[i + 1] + texture.data[i + 2];
    }
    return sum / (texture.width * texture.height);
}

/** width of the renders measuring a lightness, in pixels: small, so that they are quick */
const PROBE = 32;

/** a size brought down to the width of a probe, its proportions kept */
const probe = ([width, height]: [number, number]): [number, number] =>
    width <= PROBE ? [width, height] : [PROBE, Math.max(1, Math.round((height * PROBE) / width))];

/** the grounds already worked out, and the lightness of walls, by theme, then by key */
const grounds = new WeakMap<Theme, Map<string, ThemePatch>>();
const walls = new WeakMap<Theme, Map<string, number>>();

/** the lightness of the plain wall of a set, measured once for its floor and its ceiling */
function wallLightness(theme: Theme, seed: number, size: [number, number]): number {
    const known = walls.get(theme) ?? new Map<string, number>();
    walls.set(theme, known);
    const key = `${seed} ${size.join('x')}`;
    const value = known.get(key) ?? lightness(theme.wall, probe(size), seed);
    known.set(key, value);
    return value;
}

/**
 * The ground of a theme, as a floor or a ceiling: the material of the wall, as light as a
 * share of the wall. How light a texture looks depends on more than its palette, on its
 * mortar, its gaps, its relief, so the ground is rendered and its palette corrected until
 * it is as light as asked, measured against the wall as rendered, both at a small size.
 * @param factor the lightness, as a share of that of the wall
 * @param seed the seed of the floor or the ceiling
 * @param size its size, in pixels
 * @param wall the seed and the size of the plain wall of the set, to measure it
 * @param part whether the ground is a floor or a ceiling: the floor of a cave is of brown
 * earth; the material of the wall when unset
 */
export function ground(
    theme: Theme,
    factor: number,
    seed: number,
    size: [number, number],
    wall: { seed: number; size: [number, number] },
    part?: Part,
): ThemePatch {
    const key = `${factor} ${seed} ${size.join('x')} ${wall.seed} ${wall.size.join('x')} ${part}`;
    const known = grounds.get(theme) ?? new Map<string, ThemePatch>();
    grounds.set(theme, known);
    const found = known.get(key);
    if (found) {
        return found;
    }
    const target = factor * wallLightness(theme, wall.seed, wall.size);
    // a lightness scales with the palette, nearly: two corrections land on the target
    let shade = factor;
    for (let pass = 0; pass < 2; ++pass) {
        const measured = lightness(material(theme, shade, part), probe(size), seed);
        shade = measured > 0 ? Math.min(2, shade * (target / measured)) : shade;
    }
    const patch = material(theme, shade, part);
    known.set(key, patch);
    return patch;
}

/**
 * The material of the ground of a theme, its palette darkened to a share of its lightness:
 * large stones over a wall of stones, earth in a cave, planks under a wall of planks.
 */
function material(theme: Theme, factor: number, part?: Part): ThemePatch {
    const wall = theme.wall as ThemePatch & {
        stone?: { palette?: string[] };
        wood?: { palette?: string[] };
    };
    const stone = wall.stone?.palette;
    const wood = wall.wood?.palette;
    if (wall.template === 'cavewall' && stone) {
        // the earth of the cave, of the hue of its stones; its floor a natural brown earth,
        // tinted by the stones
        const earth = part === 'floor' ? blendPalette(stone, DIRT_PALETTE, EARTH) : stone;
        return { template: 'dirt', palette: darker(earth, factor) };
    }
    if (wood) {
        return { ...wall, wood: { ...wall.wood, palette: darker(wood, factor) } };
    }
    // flagstones: two rows of long stones, of the stone of the wall
    return {
        ...wall,
        template: 'ashlar',
        rows: { count: 2, heightVariation: 0 },
        blocks: { width: [28, 44], minJointOffset: 8, bond: 'random' },
        ...(stone ? { stone: { ...wall.stone, palette: darker(stone, factor) } } : {}),
    };
}

/** the size of a floor or a ceiling: a square as wide as the walls */
const square = (size: [number, number]): [number, number] => [size[0], size[0]];

/**
 * The floor of the set: the ground of the theme, a little darker than the wall, laid out
 * from a seed of its own, so that its stones or planks are not those of the wall.
 */
export const floor: TextureRecipe = {
    name: 'floor',
    description: 'the ground of the theme, a little darker than the wall, as wide as long',
    ambiances: ['dungeon', 'cave', 'interior', 'church'],
    build(theme, seed, size) {
        return {
            size: square(size),
            seed: hashSeed(seed, SALT_FLOOR),
            patches: [
                {
                    id: 'floor',
                    patch: ground(
                        theme,
                        FLOOR,
                        hashSeed(seed, SALT_FLOOR),
                        square(size),
                        { seed: hashSeed(seed, SALT_PLAIN_WALL), size },
                        'floor',
                    ),
                    width: 100,
                    height: 100,
                },
            ],
        };
    },
};

/** the floor, same stones included, with one to three splashes kept inside it */
export const floorSplattered: TextureRecipe = {
    name: 'floor-splattered',
    description: 'the floor, splashed with the liquid of the theme',
    ambiances: ['dungeon', 'cave', 'interior', 'church'],
    build(theme, seed, size) {
        return {
            size: square(size),
            // the seed of the floor: the same stones under the splashes
            seed: hashSeed(seed, SALT_FLOOR),
            patches: [
                {
                    id: 'floor',
                    patch: ground(
                        theme,
                        FLOOR,
                        hashSeed(seed, SALT_FLOOR),
                        square(size),
                        { seed: hashSeed(seed, SALT_PLAIN_WALL), size },
                        'floor',
                    ),
                    width: 100,
                    height: 100,
                },
                ...splashes(theme, hashSeed(seed, SALT_FLOOR_SPLATTERED), square(size)),
            ],
        };
    },
};

/**
 * The ceiling of the set: the ground of the theme, darker still than the floor, laid out
 * from a seed of its own.
 */
export const ceiling: TextureRecipe = {
    name: 'ceiling',
    description: 'the ground of the theme, darker than the floor, as wide as long',
    ambiances: ['dungeon', 'cave', 'interior', 'church'],
    build(theme, seed, size) {
        return {
            size: square(size),
            seed: hashSeed(seed, SALT_CEILING),
            patches: [
                {
                    id: 'ceiling',
                    patch: ground(theme, CEILING, hashSeed(seed, SALT_CEILING), square(size), {
                        seed: hashSeed(seed, SALT_PLAIN_WALL),
                        size,
                    }),
                    width: 100,
                    height: 100,
                },
            ],
        };
    },
};

/** the ceiling, same stones included, with a dark square opening in its middle */
export const ceilingOpening: TextureRecipe = {
    name: 'ceiling-opening',
    description: 'the ceiling, with a dark square opening in its middle',
    ambiances: ['dungeon', 'interior', 'church'],
    build(theme, seed, size) {
        return {
            size: square(size),
            // the seed of the ceiling: the same stones around the opening
            seed: hashSeed(seed, SALT_CEILING),
            patches: [
                {
                    id: 'ceiling',
                    patch: ground(theme, CEILING, hashSeed(seed, SALT_CEILING), square(size), {
                        seed: hashSeed(seed, SALT_PLAIN_WALL),
                        size,
                    }),
                    width: 100,
                    height: 100,
                },
                {
                    id: 'hatch',
                    patch: { template: 'opening', back: { mode: 'color' } },
                    ...HATCH,
                    wrap: false,
                    seed: hashSeed(seed, SALT_CEILING_OPENING),
                },
            ],
        };
    },
};

/** the shapes of the breach in the ceiling of a cave: none falls from an edge */
const BREACH_SHAPES = ['burst', 'bore', 'pocks', 'fissure'] as const;

/**
 * The opening in the ceiling of a cave: no opening cut square, but the ceiling, same earth
 * included, broken through by a breach in its middle, earth behind it. It has the name of
 * the ceiling opening of the other ambiances.
 */
export const ceilingBreach: TextureRecipe = {
    name: 'ceiling-opening',
    description: 'the ceiling, broken through by a breach in its middle',
    ambiances: ['cave'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_CAVE_CEILING_BREACH);
        const shape = pickOne(BREACH_SHAPES, own, SALT_CEILING_BREACH_SHAPE);
        return {
            size: square(size),
            // the seed of the ceiling: the same earth around the breach
            seed: hashSeed(seed, SALT_CEILING),
            patches: [
                {
                    id: 'ceiling',
                    patch: ground(theme, CEILING, hashSeed(seed, SALT_CEILING), square(size), {
                        seed: hashSeed(seed, SALT_PLAIN_WALL),
                        size,
                    }),
                    width: 100,
                    height: 100,
                },
                {
                    id: 'breach',
                    patch: {
                        template: 'breach',
                        hole: {
                            shape,
                            size: pickFloat(0.75, 0.95, own, SALT_CEILING_BREACH_SIZE),
                            jaggedness: pickFloat(0.2, 0.6, own, SALT_CEILING_BREACH_JAGGEDNESS),
                            ...(shape === 'fissure' ? { width: 0.3 } : {}),
                        },
                        cracks: { count: pickInt(4, 8, own, SALT_CEILING_BREACH_CRACKS) },
                        // nothing rests on a ceiling
                        rubble: { amount: 0 },
                    },
                    ...BREACH,
                    wrap: false,
                    seed: own,
                },
            ],
        };
    },
};
