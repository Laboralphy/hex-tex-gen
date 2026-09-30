import { hashSeed } from '../../core/hash';
import { pickOne } from '../pick';
import { SALT_BEAM_PROFILE, SALT_CAVE_WINDOW, SALT_PLAIN_WALL } from '../salts';
import type { TextureRecipe } from '../types';

/** the window, in percent of the texture */
const WINDOW = { x: 25, y: 33, width: 50, height: 33 };

/** thickness of the beams framing it, in percent of the texture width */
const BEAM = 15;

/** two decimals, so that the generated files stay readable */
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The window of a cave: the plain cave wall, same stones included, pierced by a small
 * barred window, cut through and fully transparent behind its bars, framed by four wooden
 * beams around it. It has the name of the small window of dungeons.
 */
export const caveWindow: TextureRecipe = {
    name: 'small-window',
    description: 'the plain wall, pierced by a small barred window framed by wooden beams',
    ambiances: ['cave'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_CAVE_WINDOW);
        const [width, height] = size;
        const age = typeof theme.wall.age === 'number' ? { age: theme.wall.age } : {};
        const beam = {
            template: 'woodbeam',
            profile: pickOne(['squared', 'log'] as const, own, SALT_BEAM_PROFILE),
            ...age,
        };
        // the beams as thick across as along: the same pixels, horizontally and vertically
        const thick = Math.max(1, Math.round((BEAM / 100) * width));
        const across = round2((thick / height) * 100);
        const [left, right] = [WINDOW.x - BEAM, WINDOW.x + WINDOW.width];
        const [top, bottom] = [round2(WINDOW.y - across), WINDOW.y + WINDOW.height];
        const span = round2(bottom + across - top);
        const post = (x: number, k: number) => ({
            patch: {
                ...beam,
                direction: 'vertical',
                size: [thick, Math.round((span / 100) * height)],
            },
            x,
            y: top,
            width: BEAM,
            height: span,
            wrap: false,
            seed: hashSeed(own, k),
        });
        const rail = (y: number, k: number) => ({
            patch: {
                ...beam,
                size: [Math.round(((WINDOW.width + 2 * BEAM) / 100) * width), thick],
            },
            x: left,
            y,
            width: WINDOW.width + 2 * BEAM,
            height: across,
            wrap: false,
            seed: hashSeed(own, k),
        });
        return {
            size,
            // the seed of the plain wall: the same stones around the window
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                { id: 'wall', patch: theme.wall, width: 100, height: 100 },
                {
                    id: 'window',
                    patch: { template: 'opening', back: { mode: 'cut' } },
                    ...WINDOW,
                    wrap: false,
                },
                {
                    id: 'bars',
                    patch: { template: 'bars', ...age },
                    ...WINDOW,
                    wrap: false,
                    seed: hashSeed(own, 0),
                },
                // posts on both sides, then a cap and a sill across them
                post(left, 1),
                post(right, 2),
                rail(top, 3),
                rail(bottom, 4),
            ],
        };
    },
};
