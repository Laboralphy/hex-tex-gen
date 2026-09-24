import { Texture } from '../core/Texture';
import { Random } from '../core/Random';
import { createNoise } from '../core/noise';
import { createGradient, sample } from '../core/palette';
import type { TextureGenerator } from './types';

export type StoneParams = {
    size: [number, number];
    /** CSS colors, from darkest to lightest */
    colors: string[];
};

/**
 * Rough, mottled rock surface: Perlin noise mapped through a color gradient.
 */
export const stone: TextureGenerator<StoneParams> = {
    name: 'stone',
    description: 'Mottled rock surface made of Perlin noise',
    defaults: {
        size: [64, 64],
        colors: ['#1c1a17', '#4a443b', '#7a7064', '#a39888'],
    },
    generate(options) {
        const { size, seed, colors, ...p } = { ...this.defaults, ...options };
        const { width = size[0], height = size[1] } = p;
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
};
