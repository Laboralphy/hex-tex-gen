import { Rainbow } from '@laboralphy/rainbow';
import { Texture } from '../core/Texture';
import { Random } from '../core/Random';
import { createNoise } from '../core/noise';
import { createGradient, sample, shade } from '../core/palette';
import { z } from 'zod';
import { color, palette, ratio, size } from '../core/schema';
import { defineGenerator } from './define';

export const bricksSchema = z.strictObject({
    size: size().default([64, 64]).describe('own size of the patch, in pixels'),
    brickWidth: z.number().int().min(1).default(32).describe('brick width, in pixels'),
    brickHeight: z.number().int().min(1).default(16).describe('brick height, in pixels'),
    mortar: z.number().int().min(0).default(2).describe('mortar thickness, in pixels'),
    mortarColor: color().default('#2a2520').describe('mortar color'),
    colors: palette()
        .default(['#3b1f16', '#6e3a26', '#8f5236', '#a8694a'])
        .describe('brick colors, from darkest to lightest'),
    variation: ratio()
        .default(0.25)
        .describe('random brightness variation between bricks, in [0, 1]'),
});

export type BricksParams = z.output<typeof bricksSchema>;

/**
 * Staggered brick wall with bevelled edges and per-brick shade variation.
 */
export const bricks = defineGenerator({
    name: 'bricks',
    description: 'Staggered brick wall with mortar joints',
    schema: bricksSchema,
    render(p, { width, height, seed }) {
        const { brickWidth, brickHeight, mortar } = p;
        const random = new Random(seed);
        const texture = new Texture(width, height);
        const palette = createGradient(p.colors);
        const mortarColor = Rainbow.parse(p.mortarColor);
        const noise = createNoise(width, height, random);

        const rows = Math.ceil(height / brickHeight);
        const cols = Math.ceil(width / brickWidth) + 1;
        const brightness: number[][] = [];
        for (let r = 0; r < rows; ++r) {
            brightness.push(
                Array.from({ length: cols }, () => 1 + random.float(-p.variation, p.variation)),
            );
        }

        for (let y = 0; y < height; ++y) {
            const row = Math.floor(y / brickHeight);
            const by = y % brickHeight;
            const offset = row % 2 === 0 ? 0 : brickWidth >> 1;
            for (let x = 0; x < width; ++x) {
                const sx = x + offset;
                const col = Math.floor(sx / brickWidth) % cols;
                const bx = sx % brickWidth;
                const n = noise[y][x];
                if (bx < mortar || by < mortar) {
                    texture.setPixel(x, y, shade(mortarColor, 0.8 + n * 0.4));
                    continue;
                }
                let color = sample(palette, n);
                // bevel: light on top/left edges, dark on bottom/right edges
                if (bx === mortar || by === mortar) {
                    color = shade(color, 1.3);
                } else if (bx === brickWidth - 1 || by === brickHeight - 1) {
                    color = shade(color, 0.7);
                }
                texture.setPixel(x, y, shade(color, brightness[row][col]));
            }
        }
        return texture;
    },
});
