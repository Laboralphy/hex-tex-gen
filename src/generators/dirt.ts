import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { size } from '../core/schema';
import { Texture } from '../core/Texture';
import { Dirt, dirtFields } from './common/Dirt';
import { defineGenerator } from './define';

/**
 * Parameters of the dirt template: the parameters of the earth itself.
 */
export const dirtSchema = z.strictObject({
    size: size().default([64, 64]).describe('own size of the patch, in pixels'),
    ...dirtFields(),
});

export type DirtTemplateParams = z.output<typeof dirtSchema>;

/**
 * Bare earth for floors and ceilings: blotches of soil, lighter clods, pebbles.
 */
export const dirt = defineGenerator({
    name: 'dirt',
    description: 'Bare earth for floors and ceilings: blotches of soil, clods and pebbles',
    category: 'ground',
    schema: dirtSchema,
    render(p, { width, height, seed }) {
        const earth = new Dirt(seed, width, height, p);
        const texture = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                texture.setPixel(x, y, Rainbow.fromRGBA({ ...earth.color(x, y), a: 1 }));
            }
        }
        return texture;
    },
});
