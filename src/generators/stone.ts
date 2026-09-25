import { Texture } from '../core/Texture';
import { Random } from '../core/Random';
import { createNoise } from '../core/noise';
import { createGradient, sample } from '../core/palette';
import { z } from 'zod';
import { palette, size } from '../core/schema';
import { defineGenerator } from './define';

export const stoneSchema = z.strictObject({
    size: size().default([64, 64]).describe('own size of the patch, in pixels'),
    colors: palette()
        .default(['#1c1a17', '#4a443b', '#7a7064', '#a39888'])
        .describe('rock colors, from darkest to lightest'),
});

export type StoneParams = z.output<typeof stoneSchema>;

/**
 * Rough, mottled rock surface: Perlin noise mapped through a color gradient.
 */
export const stone = defineGenerator({
    name: 'stone',
    description: 'Mottled rock surface made of Perlin noise',
    schema: stoneSchema,
    render({ colors }, { width, height, seed }) {
        const texture = new Texture(width, height);
        const palette = createGradient(colors);
        const noise = createNoise(width, height, new Random(seed));
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                texture.setPixel(x, y, sample(palette, noise[y][x]));
            }
        }
        return texture;
    },
});
