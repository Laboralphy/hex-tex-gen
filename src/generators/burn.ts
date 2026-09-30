import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { hash, hashSeed } from '../core/hash';
import { clamp, smoothstep } from '../core/math';
import { mixRGBA } from '../core/palette';
import { color, DETAIL, ESSENTIAL, LAYOUT, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { defineGenerator } from './define';

/**
 * Parameters of the burn template. Shapes are shares of the patch, so that they follow
 * its size; the mark always fades out before the edges of the patch.
 */
export const burnSchema = z.strictObject({
    size: size()
        .default([48, 64])
        .describe('own size of the patch in pixels; layout values are expressed at this size'),
    base: z
        .strictObject({
            x: ratio()
                .default(0.5)
                .describe('where the fire stood, across the patch, in [0, 1]: 0.5 in the middle'),
            y: ratio()
                .default(0.85)
                .describe('height of the fire, down the patch, in [0, 1]: 1 at the bottom edge'),
            width: ratio()
                .default(0.35)
                .describe('width of the mark where the fire stood, as a share of the patch width'),
        })
        .prefault({})
        .describe('where the fire burned, against the wall'),
    plume: z
        .strictObject({
            height: ratio()
                .default(0.9)
                .describe(
                    'how high the soot rises, as a share of the room above the fire, in [0, 1]',
                )
                .meta(ESSENTIAL),
            spread: ratio()
                .default(1)
                .describe('width of the mark at its top, as a share of the patch width, in [0, 1]')
                .meta(ESSENTIAL),
            lean: z
                .number()
                .min(-1)
                .max(1)
                .default(0)
                .describe(
                    'draft pushing the smoke sideways, in [-1, 1]: negative to the left, positive to the right',
                ),
            tongues: ratio()
                .default(0.5)
                .describe('flame licks: vertical streaks of darker and lighter soot, in [0, 1]'),
        })
        .prefault({})
        .describe('the soot rising from the fire'),
    soot: z
        .strictObject({
            color: color().default('#100c0a').describe('soot color'),
            opacity: ratio().default(0.85).describe('opacity of the densest soot, in [0, 1]'),
            mottling: ratio()
                .default(0.5)
                .describe('ragged outline and uneven soot, in [0, 1]: 0 gives a smooth plume'),
        })
        .prefault({})
        .describe('the soot deposit'),
    char: z
        .strictObject({
            color: color().default('#050404').describe('color of the charred crust'),
            amount: ratio()
                .default(0.35)
                .describe(
                    'share of the densest soot charred into a black crust, near the fire, in [0, 1]; 0 for none',
                ),
            grain: ratio()
                .default(0.2)
                .describe('random brightness variation of the crust, in [0, 1]')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('the crust where the flames licked the wall'),
    singe: z
        .strictObject({
            color: color().default('#6b4424').describe('color of the singed stone'),
            width: ratio()
                .default(0.35)
                .describe(
                    'how far the singed fringe reaches beyond the soot, as a share of the mark, in [0, 1]',
                ),
            strength: ratio()
                .default(0.6)
                .describe('how brown the fringe turns, in [0, 1]; 0 for none'),
        })
        .prefault({})
        .describe('the brown fringe of stone scorched by the heat, around the soot'),
    noise: z
        .strictObject({
            period: z
                .number()
                .int()
                .min(1)
                .default(5)
                .describe('noise cells across the patch at the first octave')
                .meta(LAYOUT),
            octaves: z
                .number()
                .int()
                .min(1)
                .max(16)
                .default(4)
                .describe('number of noise octaves, each one twice as fine'),
        })
        .prefault({})
        .describe('noise shaping the outline and the soot'),
    margin: z
        .number()
        .min(1)
        .default(3)
        .describe('distance from the patch edges over which the mark fades out, in pixels')
        .meta(DETAIL),
});

export type BurnParams = z.output<typeof burnSchema>;

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_TONGUES = 2;
const SALT_GRAIN = 3;

/**
 * A burn mark: the soot left on a wall by a fire that burned against it. The soot rises
 * from where the fire stood and widens into a plume, charred into a black crust near the
 * fire, fading upwards, with a fringe of brown singed stone around it. The mark fades out
 * before the edges of the patch, and the patch is transparent elsewhere.
 */
export const burn = defineGenerator({
    name: 'burn',
    description: 'Burn mark: soot and charred crust left on a wall by a fire',
    category: 'dungeon',
    schema: burnSchema,
    overlay: true,
    render(p, { width, height, seed }) {
        const noise = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE),
            period: p.noise.period,
            octaves: p.noise.octaves,
        });
        // tall, narrow cells: streaks rising from the fire
        const tongues = new FractalNoise({
            seed: hashSeed(seed, SALT_TONGUES),
            period: [Math.max(1, p.noise.period * 2), 1],
            octaves: 2,
        });
        const soot = Rainbow.convertToRGBA(Rainbow.parse(p.soot.color));
        const char = Rainbow.convertToRGBA(Rainbow.parse(p.char.color));
        const singe = Rainbow.convertToRGBA(Rainbow.parse(p.singe.color));
        const baseWidth = Math.max(0.02, p.base.width) / 2;
        const topWidth = Math.max(baseWidth, p.plume.spread / 2);
        // top of the plume, down the patch
        const top = p.base.y * (1 - p.plume.height);
        const charFrom = 1 - p.char.amount;

        // soot density at a point, in [0, 1]: 1 at the fire, fading upwards and outwards
        // across: distance from the axis of the plume, in half widths
        // t: height above the fire, 0 at the fire and 1 at the top of the plume
        // cut: lowering of the top of the plume, where the flames licked higher or lower
        const density = (across: number, t: number, cut: number) => {
            const up = t < 0 ? 1 : 1 - 0.7 * clamp(t);
            const top = 1 - smoothstep(0.6, 1, t + cut);
            return clamp((1 - smoothstep(0.3, 1, across)) * up * top);
        };
        // half width of the mark, as a share of the patch width: widening as the soot
        // rises, rounded under the fire
        const halfWidth = (t: number) =>
            t < 0
                ? baseWidth * Math.sqrt(Math.max(0, 1 - (t * 3) ** 2))
                : baseWidth + (topWidth - baseWidth) * clamp(t) ** 0.4;
        const halo = 1 + p.singe.width;

        const texture = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                // fades out before the edges of the patch
                const edge = clamp(Math.min(x, y, width - 1 - x, height - 1 - y) / p.margin);
                if (edge <= 0) {
                    continue;
                }
                const u = (x + 0.5) / width;
                const v = (y + 0.5) / height;
                const n = (noise.sample(u, v) - 0.5) * p.soot.mottling;
                const lick = (tongues.sample(u, v) - 0.5) * p.plume.tongues;
                const t = (p.base.y - v) / Math.max(0.01, p.base.y - top) + n * 0.3;
                // the plume leans with the draft as it rises
                const offset = Math.abs(u - p.base.x - p.plume.lean * clamp(t) ** 2 * 0.3);
                const across = (w: number) => {
                    const half = halfWidth(t / w) * w;
                    return half > 0 ? offset / half + n * 0.6 : Infinity;
                };
                const sootDensity = clamp(density(across(1), t, -lick) * (1 + lick * 0.6 + n));
                const singeDensity = density(across(halo), t / halo, -lick);
                const sootAlpha = p.soot.opacity * smoothstep(0, 0.7, sootDensity);
                const singeAlpha = p.singe.strength * 0.55 * smoothstep(0, 0.5, singeDensity);
                // the soot laid over the singed stone
                const alpha = sootAlpha + singeAlpha * (1 - sootAlpha);
                if (alpha <= 0) {
                    continue;
                }
                let c = soot;
                if (p.char.amount > 0 && sootDensity > charFrom) {
                    c = mixRGBA(c, char, smoothstep(charFrom, charFrom + 0.1, sootDensity));
                }
                c = mixRGBA(singe, c, sootAlpha / alpha);
                const grain = 1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.char.grain;
                texture.setPixel(
                    x,
                    y,
                    Rainbow.fromRGBA({
                        r: clamp(c.r * grain),
                        g: clamp(c.g * grain),
                        b: clamp(c.b * grain),
                        a: alpha * edge,
                    }),
                );
            }
        }
        return texture;
    },
});
