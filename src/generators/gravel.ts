import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { hash, hashRange, hashSeed } from '../core/hash';
import { mod, wrapOffset } from '../core/math';
import { createGradient, sample, shadeRGBA } from '../core/palette';
import { DETAIL, LAYOUT, palette, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { Dirt, dirtGroup } from './common/Dirt';
import { PowerDiagram } from './common/PowerDiagram';
import { domeLight, roundCorner } from './common/relief';
import { defineGenerator } from './define';

/**
 * Parameters of the gravel template.
 */
export const gravelSchema = z.strictObject({
    size: size().default([64, 64]).describe('own size of the patch, in pixels'),
    stones: z
        .strictObject({
            count: z.number().int().min(1).default(90).describe('stones in the patch').meta(LAYOUT),
            variation: ratio()
                .default(0.6)
                .describe('spread of the stone sizes, in [0, 1]; 0 gives stones of a similar size'),
            palette: palette()
                .default(['#3b3834', '#5d5953', '#837e76', '#a9a399'])
                .describe('colors of the stones, from darkest to lightest'),
            shift: ratio()
                .default(0.35)
                .describe('random shift of each stone along the palette, in [0, 1]'),
            relief: ratio()
                .default(0.85)
                .describe('roundness of the stones, in [0, 1]: domes lit from the top-left'),
            gap: z
                .number()
                .min(0)
                .default(1)
                .describe('earth showing between the stones, in pixels')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('small rounded stones, packed'),
    dirt: dirtGroup(),
    grain: ratio()
        .default(0.06)
        .describe('random brightness variation between pixels, in [0, 1]')
        .meta(DETAIL),
});

export type GravelParams = z.output<typeof gravelSchema>;

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_GRAIN = 2;
const SALT_STONE = 3;

/**
 * Gravel for floors: small rounded stones of every size, packed on earth, lit from the
 * top-left. It tiles.
 */
export const gravel = defineGenerator({
    name: 'gravel',
    description: 'Gravel for floors: small rounded stones packed on earth',
    category: 'ground',
    schema: gravelSchema,
    render(p, { width, height, seed }) {
        const count = p.stones.count;
        const diagram = new PowerDiagram(
            hashSeed(seed, SALT_NOISE, 0),
            [width, height],
            count,
            p.stones.variation,
        );
        const earth = new Dirt(hashSeed(seed, SALT_NOISE, 1), width, height, p.dirt);
        const half = p.stones.gap / 2;
        // the radius of an average stone, and its rounded corners
        const average = Math.sqrt((width * height) / count / Math.PI);
        const corner = p.stones.relief * 0.45 * average;

        // a first pass: each pixel's stone, and each stone's centroid, around which it is
        // rounded; a site may lie off the middle of its stone
        const samples = new Array(width * height);
        const sums = Array.from({ length: count }, () => ({ x: 0, y: 0, n: 0 }));
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const s = diagram.sample(x + 0.5, y + 0.5);
                samples[y * width + x] = s;
                const sum = sums[s.cell];
                sum.x += wrapOffset(x + 0.5, s.center[0], width);
                sum.y += wrapOffset(y + 0.5, s.center[1], height);
                ++sum.n;
            }
        }
        // the offset of each centroid from its site
        const centroids = sums.map((sum) => [
            sum.x / Math.max(1, sum.n),
            sum.y / Math.max(1, sum.n),
        ]);

        const colors = createGradient(p.stones.palette);
        const texture = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const s = samples[y * width + x];
                const d = roundCorner(s.border - half, s.border2 - half, corner);
                const grain = 1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.grain;
                if (d < 0) {
                    // the earth between the stones, in their shadow
                    const rgba = shadeRGBA(earth.color(x, y), 0.7);
                    texture.setPixel(x, y, Rainbow.fromRGBA({ ...rgba, a: 1 }));
                    continue;
                }
                const [ox, oy] = centroids[s.cell];
                const dx = wrapOffset(x + 0.5, mod(s.center[0] + ox, width), width);
                const dy = wrapOffset(y + 0.5, mod(s.center[1] + oy, height), height);
                const radius = Math.sqrt(sums[s.cell].n / Math.PI);
                const light = domeLight(dx, dy, d, radius, p.stones.relief);
                const tone = hashRange(
                    0.5 - p.stones.shift,
                    0.5 + p.stones.shift,
                    seed,
                    SALT_STONE,
                    s.cell,
                );
                const rgba = Rainbow.convertToRGBA(sample(colors, tone));
                texture.setPixel(
                    x,
                    y,
                    Rainbow.fromRGBA({ ...shadeRGBA(rgba, light * grain), a: 1 }),
                );
            }
        }
        return texture;
    },
});
