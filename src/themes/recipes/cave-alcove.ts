import { hashSeed } from '../../core/hash';
import { pickOne } from '../pick';
import { SALT_BEAM_PROFILE, SALT_CAVE_ALCOVE } from '../salts';
import type { TextureRecipe } from '../types';

/** the posts, full height at both sides, in percent of the texture width, as the columns of dungeons */
const POST = 15;

/** own thickness of the cap, in pixels */
const CAP = 11;

/**
 * The alcove of a cave: the frame of a mine gallery, alone on a transparent texture, laid
 * over the cave wall by the engine. Two wooden posts stand full height against the left
 * and right edges, like the columns of the dungeon alcove, and a cap runs across the top
 * edge, over their tops. It has the name of the arched alcove of dungeons.
 */
export const caveAlcove: TextureRecipe = {
    name: 'arch-alcove',
    description: 'two wooden posts at the sides and a cap across the top, on a transparent texture',
    ambiances: ['cave'],
    build(theme, seed, size) {
        const own = hashSeed(seed, SALT_CAVE_ALCOVE);
        const [width, height] = size;
        const beam = {
            template: 'woodbeam',
            profile: pickOne(['squared', 'log'] as const, own, SALT_BEAM_PROFILE),
            ...(typeof theme.wall.age === 'number' ? { age: theme.wall.age } : {}),
        };
        const upright = (x: number, k: number) => ({
            patch: {
                ...beam,
                direction: 'vertical',
                size: [Math.max(1, Math.round((POST / 100) * width)), height],
            },
            x,
            y: 0,
            width: POST,
            height: 100,
            wrap: false,
            seed: hashSeed(own, k),
        });
        return {
            size,
            // nothing but the beams: the engine draws the cave wall behind them
            background: '#0000',
            seed: hashSeed(seed, SALT_CAVE_ALCOVE),
            patches: [
                upright(0, 0),
                upright(100 - POST, 1),
                {
                    patch: { ...beam, size: [width, CAP] },
                    x: 0,
                    y: 0,
                    width: 100,
                    height: Math.round((CAP / height) * 10000) / 100,
                    wrap: false,
                    seed: hashSeed(own, 2),
                },
            ],
        };
    },
};
