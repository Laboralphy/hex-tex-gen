import { FractalNoise } from '@laboralphy/algorithms';
import { z } from 'zod';
import { hash, hashSeed } from '../core/hash';
import { createGradient, sample, shade } from '../core/palette';
import { DETAIL, LAYOUT, palette, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { defineGenerator } from './define';

/**
 * Parameters of the sand template.
 */
export const sandSchema = z.strictObject({
    size: size().default([64, 64]).describe('own size of the patch, in pixels'),
    palette: palette()
        .default(['#8a744e', '#ab9266', '#c7ae80', '#ddc79a'])
        .describe('colors of the sand, from darkest to lightest'),
    ripples: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(0)
                .default(5)
                .describe('ripples down the patch; 0 for flat sand')
                .meta(LAYOUT),
            slant: z
                .number()
                .int()
                .default(1)
                .describe(
                    'ripples the crests shift by across the width: tilts them while the sand keeps tiling; 0 for level crests',
                ),
            depth: ratio().default(0.35).describe('shading of the ripples, in [0, 1]'),
            warp: ratio().default(0.4).describe('waviness of the crests, in [0, 1]'),
        })
        .prefault({})
        .describe('ripples left by the wind: a long lit slope, a short shadowed one'),
    specks: z
        .number()
        .min(0)
        .default(12)
        .describe('dark grains and bits of shell per 32 × 32 pixels'),
    grain: ratio()
        .default(0.08)
        .describe('random brightness variation between pixels, in [0, 1]')
        .meta(DETAIL),
    wetness: ratio().default(0).describe('damp sand, darker, in [0, 1]'),
});

export type SandParams = z.output<typeof sandSchema>;

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_GRAIN = 2;
const SALT_SPECK = 3;

/** share of a ripple taken by its long lit slope, facing the wind */
const LIT_SLOPE = 0.7;

/**
 * Sand for floors: fine grains rippled by the wind, strewn with darker specks. It tiles:
 * the ripples cross it a whole number of times along each axis.
 */
export const sand = defineGenerator({
    name: 'sand',
    description: 'Sand for floors: fine grains rippled by the wind',
    category: 'ground',
    schema: sandSchema,
    render(p, { width, height, seed }) {
        const colors = createGradient(p.palette);
        const warp = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 0),
            period: 3,
            octaves: 3,
        });
        const drifts = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 1),
            period: 2,
            octaves: 3,
        });
        const { count, slant, depth } = p.ripples;
        const texture = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const u = x / width;
                const v = y / height;
                let tone = 0.55 + 0.3 * (drifts.sample(u, v) - 0.5);
                if (count > 0) {
                    // a whole number of ripples along each axis: the sand tiles
                    const phase =
                        count * v + slant * u + p.ripples.warp * 2 * (warp.sample(u, v) - 0.5);
                    const f = phase - Math.floor(phase);
                    tone +=
                        depth *
                        (f < LIT_SLOPE
                            ? 0.3 * (f / LIT_SLOPE)
                            : -0.45 * ((f - LIT_SLOPE) / (1 - LIT_SLOPE)));
                }
                const speck = hash(seed, SALT_SPECK, x, y);
                if (speck < (p.specks / 1024) * 0.7) {
                    tone -= 0.35;
                } else if (speck < p.specks / 1024) {
                    tone += 0.3;
                }
                const grain = 1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.grain;
                const color = shade(sample(colors, tone), grain * (1 - 0.35 * p.wetness));
                texture.setPixel(x, y, color);
            }
        }
        return texture;
    },
});
