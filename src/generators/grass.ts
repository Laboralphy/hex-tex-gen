import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge } from '../core/age';
import { hash, hashRange, hashSeed } from '../core/hash';
import { clamp, mod } from '../core/math';
import { createGradient, mixRGBA, sample } from '../core/palette';
import {
    ageParam,
    color,
    DETAIL,
    FROM_AGE,
    LAYOUT,
    palette,
    range,
    ratio,
    size,
} from '../core/schema';
import { Texture } from '../core/Texture';
import { Dirt, dirtGroup } from './common/Dirt';
import { defineGenerator } from './define';

/**
 * Parameters of the grass template.
 */
export const grassSchema = z.strictObject({
    size: size().default([64, 64]).describe('own size of the patch, in pixels'),
    blades: z
        .strictObject({
            density: z.number().min(0).default(360).describe('blades per 32 × 32 pixels'),
            length: range(z.number().min(1))
                .default([2, 4])
                .describe('[min, max] length of a blade, in pixels')
                .meta(DETAIL),
            palette: palette()
                .default(['#15240d', '#2b4519', '#4a6d27', '#7a9a3c'])
                .describe('greens, from the roots to the lit tips'),
        })
        .prefault({})
        .describe('blades of grass, seen from above, their tips catching the light'),
    patches: z
        .number()
        .positive()
        .default(3)
        .describe('patches of lighter and darker grass, and of bare earth, across the patch')
        .meta(LAYOUT),
    dirt: dirtGroup(),
    flowers: z
        .strictObject({
            density: z.number().min(0).default(0).describe('flowers per 32 × 32 pixels'),
            colors: z
                .array(color())
                .min(1)
                .default(['#ece6d2', '#e2c93c', '#b8466a'])
                .describe('colors of the flowers, picked at random'),
        })
        .prefault({})
        .describe('small flowers strewn in the grass'),
    age: ageParam({ noun: 'wear', young: 'lush', old: 'trampled and dry' }),
    bare: ratio()
        .optional()
        .describe(`share of the ground worn down to bare earth, in [0, 1];${FROM_AGE}`),
    dryness: ratio()
        .optional()
        .describe(`share of the blades dried to straw, in [0, 1];${FROM_AGE}`),
});

export type GrassParams = z.output<typeof grassSchema>;

/**
 * Wear values of grass, every one resolved.
 */
export type GrassWear = { bare: number; dryness: number };

/**
 * Resolves the wear values of grass: values set in the parameters win, the others are
 * derived from `age`.
 */
export function grassWear(p: GrassParams): GrassWear {
    return {
        bare: p.bare ?? atAge(p.age, [0.02, 0.12, 0.55]),
        dryness: p.dryness ?? atAge(p.age, [0, 0.1, 0.5]),
    };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_BLADE = 2;
const SALT_FLOWER = 3;

/** color of dried blades */
const STRAW = Rainbow.convertToRGBA(Rainbow.parse('#a8955a'));

/** blades of a tuft */
const BLADES_PER_TUFT = 5;

/** width, in noise values, of the edge of a bare patch, where blades thin out */
const EDGE = 0.08;

/**
 * Grass seen from above, for floors: blades in every direction over a dark ground, in
 * patches of lighter and darker green. With age, it wears down to patches of bare earth,
 * and its blades dry to straw.
 */
export const grass = defineGenerator({
    name: 'grass',
    description: 'Grass for floors: blades over a dark ground, worn to bare earth with age',
    category: 'ground',
    schema: grassSchema,
    render(p, { width, height, seed }) {
        const wear = grassWear(p);
        const area = (width * height) / 1024;
        const cells = Math.max(1, Math.round(p.patches));
        const greens = createGradient(p.blades.palette);
        const field = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 0),
            period: cells,
            octaves: 3,
        });
        const worn = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 1),
            period: cells,
            octaves: 4,
        });
        const earth = new Dirt(hashSeed(seed, SALT_NOISE, 2), width, height, p.dirt);
        // bare where the noise rises above a threshold: none at 0, nearly all at 1
        const threshold = 0.95 - 0.9 * wear.bare;
        const bareness = (x: number, y: number) =>
            worn.sample(mod(x, width) / width, mod(y, height) / height) - threshold;

        // the ground: dark grass, or bare earth
        const texture = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const rgba =
                    bareness(x, y) > 0
                        ? earth.color(x, y)
                        : Rainbow.convertToRGBA(
                              sample(greens, 0.18 + 0.3 * field.sample(x / width, y / height)),
                          );
                texture.setPixel(x, y, Rainbow.fromRGBA({ ...rgba, a: 1 }));
            }
        }

        // tufts: blades from a dark root to a lit tip, fanning out from a clump, thinning
        // out at the edge of bare patches
        const blades = Math.round(p.blades.density * area);
        const tufts = Math.max(1, Math.round(blades / BLADES_PER_TUFT));
        const [minLength, maxLength] = p.blades.length;
        for (let k = 0; k < blades; ++k) {
            const tuft = k % tufts;
            const tx = hash(seed, SALT_BLADE, tuft, 0) * width;
            const ty = hash(seed, SALT_BLADE, tuft, 1) * height;
            const b = bareness(tx, ty);
            if (b > 0 || (b > -EDGE && hash(seed, SALT_BLADE, tuft, 2) < (b + EDGE) / EDGE)) {
                continue;
            }
            // the root, near the middle of the tuft; the blade leans away from it
            const spread = hash(seed, SALT_BLADE, k, 3) * 2 * Math.PI;
            const offset = hash(seed, SALT_BLADE, k, 4) * 1.8;
            const x0 = tx + Math.cos(spread) * offset;
            const y0 = ty + Math.sin(spread) * offset;
            const angle = spread + (hash(seed, SALT_BLADE, k, 5) - 0.5) * 1.2;
            const length = hashRange(minLength, maxLength, seed, SALT_BLADE, k, 6);
            const lush = field.sample(tx / width, ty / height);
            const dry = hash(seed, SALT_BLADE, k, 7) < wear.dryness;
            for (let t = 0; t < length; ++t) {
                const tone = 0.3 + 0.45 * (t / Math.max(1, length - 1)) + 0.25 * (lush - 0.5);
                let rgba = Rainbow.convertToRGBA(sample(greens, clamp(tone)));
                if (dry) {
                    rgba = mixRGBA(rgba, STRAW, 0.75);
                }
                texture.setPixel(
                    Math.floor(x0 + Math.cos(angle) * t),
                    Math.floor(y0 + Math.sin(angle) * t),
                    Rainbow.fromRGBA({ ...rgba, a: 1 }),
                );
            }
        }

        // flowers: a colored dot over the grass
        const flowers = Math.round(p.flowers.density * area);
        const petals = p.flowers.colors.map((c) => Rainbow.parse(c));
        for (let k = 0; k < flowers; ++k) {
            const x = Math.floor(hash(seed, SALT_FLOWER, k, 0) * width);
            const y = Math.floor(hash(seed, SALT_FLOWER, k, 1) * height);
            if (bareness(x, y) > 0) {
                continue;
            }
            const petal = petals[Math.floor(hash(seed, SALT_FLOWER, k, 2) * petals.length)];
            texture.setPixel(x, y, petal);
            texture.setPixel(x + 1, y, petal);
        }
        return texture;
    },
});
