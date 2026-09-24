import { Rainbow } from '@laboralphy/rainbow';
import { Texture } from '../core/Texture';
import { Random } from '../core/Random';
import { createNoise } from '../core/noise';
import { createGradient, sample, shade } from '../core/palette';
import type { TextureGenerator } from './types';

export type BricksParams = {
    size: [number, number];
    brickWidth: number;
    brickHeight: number;
    /** mortar thickness in pixels */
    mortar: number;
    mortarColor: string;
    /** CSS colors, from darkest to lightest */
    colors: string[];
    /** random brightness variation between bricks, in [0, 1] */
    variation: number;
};

/**
 * Staggered brick wall with bevelled edges and per-brick shade variation.
 */
export const bricks: TextureGenerator<BricksParams> = {
    name: 'bricks',
    description: 'Staggered brick wall with mortar joints',
    defaults: {
        size: [64, 64],
        brickWidth: 32,
        brickHeight: 16,
        mortar: 2,
        mortarColor: '#2a2520',
        colors: ['#3b1f16', '#6e3a26', '#8f5236', '#a8694a'],
        variation: 0.25,
    },
    generate(options) {
        const p = { ...this.defaults, ...options };
        const { width = p.size[0], height = p.size[1], brickWidth, brickHeight, mortar } = p;
        const random = new Random(p.seed);
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
};
