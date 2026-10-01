import type { Placement } from '../../compose/types';
import { hashSeed } from '../../core/hash';
import { pickFloat, pickInt, pickOne } from '../pick';
import {
    SALT_CURTAIN_COLOR,
    SALT_CURTAINS,
    SALT_INTERIOR_WINDOW,
    SALT_PLAIN_WALL,
    SALT_WINDOW_COLUMNS,
    SALT_WINDOW_ROWS,
} from '../salts';
import type { TextureRecipe } from '../types';
import { beamWood } from './wood';
import { wallPatches } from './plain-wall';

/** the opening, in percent of the texture */
const OPENING = { x: 15, y: 20, width: 70, height: 60 };

/** width of the reveals of the opening, in pixels: the window fits inside them */
const DEPTH = 4;

/** thickness of the beams framing the opening, in pixels */
const BEAM = 5;

/** the curtains, each as wide as this share of the opening, in percent of the texture */
const CURTAIN = 12;

/** plain colors of curtains */
const CURTAIN_COLORS = [
    '#7a1c1c', // crimson
    '#2a4a2a', // bottle green
    '#1f3560', // navy
    '#8a6a2a', // ochre
    '#4a2450', // plum
    '#5a5550', // grey
    '#c8b89a', // linen
];

/** two decimals, so that the generated files stay readable */
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The window of interiors: the plain wall, same planks included, pierced by an opening cut
 * through, a glazed window in it framed with the wood of the wall, four wooden beams
 * around it, and, one time in two, a plain curtain on each side. It has the name of the
 * small window of dungeons and caves.
 */
export const interiorWindow: TextureRecipe = {
    name: 'small-window',
    description: 'the plain wall, pierced by a glazed window framed by wooden beams',
    ambiances: ['interior'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_INTERIOR_WINDOW);
        const [width, height] = size;
        const age = typeof theme.wall.age === 'number' ? { age: theme.wall.age } : {};
        const wood = (theme.wall.wood as { palette?: string[] } | undefined)?.palette;
        const beams = beamWood(theme);
        // the beams as thick across as along: the same pixels, horizontally and vertically
        const [thickX, thickY] = [round2((BEAM / width) * 100), round2((BEAM / height) * 100)];
        const [left, right] = [round2(OPENING.x - thickX), OPENING.x + OPENING.width];
        const [top, bottom] = [round2(OPENING.y - thickY), OPENING.y + OPENING.height];
        const span = round2(bottom + thickY - top);
        const post = (x: number, k: number): Placement => ({
            patch: {
                template: 'woodbeam',
                direction: 'vertical',
                size: [BEAM, Math.round((span / 100) * height)],
                ...beams,
                ...age,
            },
            x,
            y: top,
            width: thickX,
            height: span,
            wrap: false,
            seed: hashSeed(own, k),
        });
        const rail = (y: number, k: number): Placement => ({
            patch: {
                template: 'woodbeam',
                size: [Math.round(((right + thickX - left) / 100) * width), BEAM],
                ...beams,
                ...age,
            },
            x: left,
            y,
            width: round2(right + thickX - left),
            height: thickY,
            wrap: false,
            seed: hashSeed(own, k),
        });
        const curtain = (x: number, k: number): Placement => ({
            patch: {
                template: 'banner',
                shape: { base: 'flat' },
                fabric: { color: pickOne(CURTAIN_COLORS, own, SALT_CURTAIN_COLOR) },
                border: { stripes: [] },
                pattern: { kind: 'none' },
                folds: { count: 4, depth: 0.4 },
                rod: { enabled: false },
                age: theme.decor.age,
            },
            x,
            y: OPENING.y,
            width: CURTAIN,
            height: OPENING.height,
            wrap: false,
            seed: hashSeed(own, k),
        });
        const curtains = pickFloat(0, 1, own, SALT_CURTAINS) < 0.5;
        return {
            size,
            // the seed of the plain wall: the same planks around the window
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                ...wallPatches(theme),
                {
                    id: 'window',
                    patch: { template: 'opening', depth: DEPTH, back: { mode: 'cut' } },
                    ...OPENING,
                    wrap: false,
                },
                {
                    patch: {
                        template: 'window',
                        panes: {
                            columns: pickInt(2, 3, own, SALT_WINDOW_COLUMNS),
                            rows: pickInt(2, 4, own, SALT_WINDOW_ROWS),
                        },
                        frame: { material: 'wood', ...(wood ? { wood } : {}) },
                        ...age,
                    },
                    anchor: { to: 'window', at: 'opening' },
                    // inside the reveals
                    width: round2(OPENING.width - ((2 * DEPTH) / width) * 100),
                    height: round2(OPENING.height - ((2 * DEPTH) / height) * 100),
                    wrap: false,
                    seed: hashSeed(own, 0),
                },
                // posts on both sides, then a lintel and a sill across them
                post(left, 1),
                post(right, 2),
                rail(top, 3),
                rail(bottom, 4),
                // plain curtains drawn over both sides of the window, one time in two
                ...(curtains
                    ? [curtain(OPENING.x, 5), curtain(OPENING.x + OPENING.width - CURTAIN, 6)]
                    : []),
            ],
        };
    },
};
