import type { Placement } from '../../compose/types';
import { hashSeed } from '../../core/hash';
import { pickFloat, pickOne } from '../pick';
import {
    SALT_COBWEB,
    SALT_COBWEB_SHELF,
    SALT_COBWEB_SIDE,
    SALT_METAL_SHELVES,
    SALT_METAL_TABLE,
    SALT_PLAIN_WALL,
    SALT_STONE_ALTAR,
    SALT_WOODEN_SHELVES,
    SALT_WOODEN_TABLE,
} from '../salts';
import type { Theme, TextureRecipe } from '../types';
import { beamWood } from './wood';

/** top of every piece of furniture, in percent of the texture height */
const TOP = 50;

/** thickness of a table top, and of a leg, in percent of the texture width */
const TABLETOP = 15;
const LEG = 8;

/** distance of the legs from the sides, in percent of the texture width */
const INSET = 10;

/** height of the apron of a wooden table, under its top, in percent of the texture width */
const APRON = 18;

/** margin of the panel inset in the apron, in pixels */
const PANEL_MARGIN = 2;

/** darkening of the panel inset in the apron, in [0, 1]: a slightly darker tint */
const PANEL_SHADE = 0.18;

/** the altar cloth, in percent of the texture */
const CLOTH = { x: 30, y: TOP, width: 40, height: 40 };

/** the colors of the altar cloth: crimson, bordered with red */
const CRIMSON = '#8c1028';
const RED = '#c42020';

/** two decimals, so that the generated files stay readable */
const round2 = (value: number) => Math.round(value * 100) / 100;

/** own size of a cobweb, in pixels */
const WEB = 16;

/**
 * A cobweb in a corner of a piece of furniture, as likely as the decorations of the theme
 * are worn: none when the draw misses. It is placed before the beams, which cover its
 * edges, so that it hangs from them.
 * @param corner the corner point it radiates from, on the given side, in percent of the
 * texture
 */
function cobweb(
    own: number,
    age: number,
    size: [number, number],
    corner: (side: 'left' | 'right') => { x: number; y: number },
): Placement[] {
    if (pickFloat(0, 1, own, SALT_COBWEB) >= age) {
        return [];
    }
    const side = pickOne(['left', 'right'] as const, own, SALT_COBWEB_SIDE);
    const [w, h] = [(WEB / size[0]) * 100, (WEB / size[1]) * 100];
    const { x, y } = corner(side);
    return [
        {
            id: 'cobweb',
            patch: { template: 'cobweb', corner: side === 'left' ? 'top-left' : 'top-right', age },
            x: round2(side === 'left' ? x : x - w),
            y: round2(y),
            width: round2(w),
            height: round2(h),
            wrap: false,
            seed: hashSeed(own, SALT_COBWEB),
        },
    ];
}

/**
 * A table: a top running the whole width from the middle of the texture down, two legs
 * standing under it a little in from the sides, beams of a template, alone on a
 * transparent texture. With an apron, a thick plank runs between the legs under the top,
 * a panel inset in it, slightly darker.
 * @param beam the template of the beams and their parameters
 * @param legs extra parameters of the legs
 * @param apron whether a plank runs between the legs, under the top
 */
function table(
    name: string,
    description: string,
    salt: number,
    beam: Record<string, unknown>,
    legs: Record<string, unknown> = {},
    apron = false,
): TextureRecipe {
    return {
        name,
        description,
        ambiances: ['dungeon', 'cave', 'interior', 'church'],
        build(theme, seed, size) {
            const own = hashSeed(seed, salt);
            const [width, height] = size;
            const age = { age: theme.decor.age };
            // as thick across as along: the same pixels, horizontally and vertically
            const top = Math.max(1, Math.round((TABLETOP / 100) * width));
            const leg = Math.max(1, Math.round((LEG / 100) * width));
            const topHeight = round2((top / height) * 100);
            // the legs go up under the middle of the top, which hides their ends
            const legTop = round2(TOP + topHeight / 2);
            const upright = (x: number, k: number): Placement => ({
                patch: {
                    ...beam,
                    ...legs,
                    ...age,
                    direction: 'vertical',
                    size: [leg, Math.round(((100 - legTop) / 100) * height)],
                },
                x: round2(x),
                y: legTop,
                width: round2((leg / width) * 100),
                height: round2(100 - legTop),
                wrap: false,
                seed: hashSeed(own, k),
            });
            const legWidth = (leg / width) * 100;
            // the apron, right under the top, its ends joined into the legs, which hide them
            const plank = Math.max(1, Math.round((APRON / 100) * width));
            const plankHeight = round2((plank / height) * 100);
            const [plankLeft, plankRight] = [INSET + legWidth / 2, 100 - INSET - legWidth / 2];
            // the panel, between the legs
            const [panelLeft, panelRight] = [INSET + legWidth, 100 - INSET - legWidth];
            const plankTop = round2(TOP + topHeight);
            const [marginX, marginY] = [
                (PANEL_MARGIN / width) * 100,
                (PANEL_MARGIN / height) * 100,
            ];
            const aprons: Placement[] = apron
                ? [
                      {
                          id: 'apron',
                          patch: {
                              ...beam,
                              ...age,
                              size: [Math.round(((plankRight - plankLeft) / 100) * width), plank],
                          },
                          x: round2(plankLeft),
                          y: plankTop,
                          width: round2(plankRight - plankLeft),
                          height: plankHeight,
                          wrap: false,
                          seed: hashSeed(own, 3),
                      },
                      {
                          // the panel, recessed: the plank a little darker, bevelled
                          id: 'panel',
                          patch: {
                              template: 'opening',
                              depth: 1,
                              back: { mode: 'shade', shade: PANEL_SHADE },
                          },
                          x: round2(panelLeft + marginX),
                          y: round2(plankTop + marginY),
                          width: round2(panelRight - panelLeft - 2 * marginX),
                          height: round2(plankHeight - 2 * marginY),
                          wrap: false,
                      },
                  ]
                : [];
            return {
                size,
                // nothing but the furniture: the engine draws the wall behind it
                background: '#0000',
                seed: own,
                patches: [
                    // under the top, or the apron, against the inner side of a leg, towards
                    // the center
                    ...cobweb(own, theme.decor.age, size, (side) => ({
                        x: side === 'left' ? INSET + legWidth / 2 : 100 - INSET - legWidth / 2,
                        y: apron ? TOP + topHeight + plankHeight : TOP + topHeight / 2,
                    })),
                    ...aprons,
                    upright(INSET, 0),
                    upright(100 - INSET - legWidth, 1),
                    {
                        patch: { ...beam, ...age, size: [width, top] },
                        x: 0,
                        y: TOP,
                        width: 100,
                        height: topHeight,
                        wrap: false,
                        seed: hashSeed(own, 2),
                    },
                ],
            };
        },
    };
}

/** a wooden table: a sawn top on two legs, a thick apron between them, a panel inset in it */
export const woodenTable = table(
    'wooden-table',
    'a wooden table, its top across the whole width, on two legs joined by a panelled apron, on a transparent texture',
    SALT_WOODEN_TABLE,
    { template: 'woodbeam', profile: 'squared' },
    {},
    true,
);

/** a metal table: a riveted girder on two straps */
export const metalTable = table(
    'metal-table',
    'a metal table, a girder across the whole width, on two straps, on a transparent texture',
    SALT_METAL_TABLE,
    { template: 'beam', profile: 'girder' },
    { profile: 'flat' },
);

/**
 * A stone altar: a slab from the middle of the texture to the floor, across the whole
 * width, a crimson cloth bordered with red draped over its front, ending in a point, alone
 * on a transparent texture.
 */
export const stoneAltar: TextureRecipe = {
    name: 'stone-altar',
    description: 'a stone altar under a crimson cloth ending in a point, on a transparent texture',
    ambiances: ['dungeon', 'cave', 'interior', 'church'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_STONE_ALTAR);
        const [width, height] = size;
        const age = { age: theme.decor.age };
        return {
            size,
            // nothing but the altar: the engine draws the wall behind it
            background: '#0000',
            seed: own,
            patches: [
                {
                    id: 'altar',
                    patch: {
                        template: 'stoneslab',
                        size: [width, Math.round(((100 - TOP) / 100) * height)],
                        ...age,
                    },
                    x: 0,
                    y: TOP,
                    width: 100,
                    height: 100 - TOP,
                    wrap: false,
                    seed: hashSeed(own, 0),
                },
                {
                    id: 'cloth',
                    patch: {
                        template: 'banner',
                        shape: { base: 'point', depth: 0.25 },
                        fabric: { color: CRIMSON },
                        border: { stripes: [{ color: RED, width: 2 }] },
                        // draped over the altar, not hung from a rod
                        rod: { enabled: false },
                        ...age,
                    },
                    ...CLOTH,
                    wrap: false,
                    seed: hashSeed(own, 1),
                },
            ],
        };
    },
};

/** the beams across, by the height of their top, in percent of the texture height: one
 * along the top edge, then the shelves */
const SHELVES = [0, 30, 60, 90];

/** thickness of a shelf, in percent of the texture height */
const SHELF = 10;

/** thickness of the sides, in percent of the texture width */
const SIDE = 15;

/** darkening of the wall at the back of the shelves: a little darker than an alcove */
const BACK_SHADE = 0.75;

/**
 * Full-height shelves against the wall: the plain wall of the set, same stones or planks
 * included, set back and darkened as a whole, a beam along the top edge and three shelves
 * across the whole width, and two sides along the left and right edges over their ends,
 * beams of a template.
 * @param beam the template of the beams and their parameters
 * @param material extra parameters of the beams drawn from the theme, such as a wood
 */
function shelves(
    name: string,
    description: string,
    salt: number,
    beam: Record<string, unknown>,
    material: (theme: Theme) => Record<string, unknown> = () => ({}),
): TextureRecipe {
    return {
        name,
        description,
        ambiances: ['dungeon', 'cave', 'interior', 'church'],
        build(theme, seed, size) {
            const own = hashSeed(seed, salt);
            const [width, height] = size;
            const made = { ...beam, ...material(theme), age: theme.decor.age };
            const thick = Math.max(1, Math.round((SHELF / 100) * height));
            const side = Math.max(1, Math.round((SIDE / 100) * width));
            const shelf = (y: number, k: number): Placement => ({
                patch: { ...made, size: [width, thick] },
                x: 0,
                y,
                width: 100,
                height: SHELF,
                wrap: false,
                seed: hashSeed(own, k),
            });
            const upright = (x: number, k: number): Placement => ({
                patch: { ...made, direction: 'vertical', size: [side, height] },
                x,
                y: 0,
                width: SIDE,
                height: 100,
                wrap: false,
                seed: hashSeed(own, k),
            });
            return {
                size,
                // the seed of the plain wall: the same stones, in the shade of the shelves
                seed: hashSeed(seed, SALT_PLAIN_WALL),
                patches: [
                    { id: 'wall', patch: theme.wall, width: 100, height: 100 },
                    {
                        id: 'back',
                        patch: { template: 'opening', back: { mode: 'shade', shade: BACK_SHADE } },
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 100,
                        wrap: false,
                    },
                    // the shelves, then the sides over their ends
                    // in an upper corner of a compartment, under a beam, against a side
                    ...cobweb(own, theme.decor.age, size, (side) => ({
                        x: side === 'left' ? SIDE / 2 : 100 - SIDE / 2,
                        y: pickOne(SHELVES.slice(0, -1), own, SALT_COBWEB_SHELF) + SHELF / 2,
                    })),
                    ...SHELVES.map((y, k) => shelf(y, k)),
                    upright(0, SHELVES.length),
                    upright(100 - SIDE, SHELVES.length + 1),
                ],
            };
        },
    };
}

/** wooden shelves: sawn planks, of the wood of the wall on a wall of planks */
export const woodenShelves = shelves(
    'wooden-shelves',
    'full-height wooden shelves, three across the darkened wall between two sides',
    SALT_WOODEN_SHELVES,
    { template: 'woodbeam', profile: 'squared' },
    beamWood,
);

/** metal shelves: riveted girders */
export const metalShelves = shelves(
    'metal-shelves',
    'full-height metal shelves, three girders across the darkened wall between two sides',
    SALT_METAL_SHELVES,
    { template: 'beam', profile: 'girder' },
);
