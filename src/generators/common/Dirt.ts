import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow, type ColorRGBAStruct } from '@laboralphy/rainbow';
import { z } from 'zod';
import { hash, hashRange, hashSeed } from '../../core/hash';
import { clamp, mod } from '../../core/math';
import { createGradient, sample, shadeRGBA } from '../../core/palette';
import { DETAIL, LAYOUT, palette, ratio } from '../../core/schema';

/** bare earth, from its darkest to its lightest */
export const DIRT_PALETTE = ['#2e2217', '#4a3726', '#654b33', '#80623f'];

/** pebbles strewn on dirt, from their darkest to their lightest */
const PEBBLE_PALETTE = ['#3a342c', '#5a5248', '#7a7064', '#968b7c'];

/** the parameters of dirt, to spread into a template or to group */
export const dirtFields = () => ({
    palette: palette()
        .default(DIRT_PALETTE)
        .describe('colors of the earth, from darkest to lightest'),
    blotches: z
        .number()
        .positive()
        .default(4)
        .describe('large blotches across the patch')
        .meta(LAYOUT),
    contrast: ratio().default(0.6).describe('spread of the blotches over the palette'),
    clods: z.number().min(0).default(8).describe('lighter lumps of earth per 32 × 32 pixels'),
    pebbles: z.number().min(0).default(3).describe('pebbles per 32 × 32 pixels'),
    grain: ratio()
        .default(0.14)
        .describe('random brightness variation between pixels, in [0, 1]')
        .meta(DETAIL),
    wetness: ratio().default(0).describe('damp earth, darker, in [0, 1]'),
});

/** the dirt of a ground template, as a parameter group */
export const dirtGroup = () =>
    z.strictObject(dirtFields()).prefault({}).describe('bare earth: blotches, clods and pebbles');

export type DirtParams = z.output<ReturnType<typeof dirtGroup>>;

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_GRAIN = 2;
const SALT_CLOD = 3;
const SALT_PEBBLE = 4;

/**
 * Bare earth seen from above: blotches of darker and lighter soil, lighter clods, pebbles
 * lit from the top-left. It tiles; its blotches scale with the texture, its clods and
 * pebbles are real pixels.
 */
export class Dirt {
    private readonly palette: ReturnType<typeof createGradient>;
    private readonly blotches: FractalNoise;
    /** fine crumbs, of a few pixels whatever the size */
    private readonly crumbs: FractalNoise;
    /** tone added by the clods, at each pixel */
    private readonly lift: Float32Array;
    /** pebble colors, or undefined where there is none */
    private readonly pebbles: (ColorRGBAStruct | undefined)[];
    /** darkening of the earth around the pebbles, their shadow */
    private readonly shadow: Float32Array;

    constructor(
        private readonly seed: number,
        private readonly width: number,
        private readonly height: number,
        private readonly params: DirtParams,
    ) {
        this.palette = createGradient(params.palette);
        const cells = Math.max(1, Math.round(params.blotches));
        this.blotches = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE),
            period: cells,
            octaves: 4,
        });
        this.crumbs = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 1),
            period: [Math.max(1, Math.round(width / 3)), Math.max(1, Math.round(height / 3))],
            octaves: 2,
        });
        this.lift = new Float32Array(width * height);
        this.shadow = new Float32Array(width * height);
        this.pebbles = new Array(width * height);
        const area = (width * height) / 1024;
        const at = (x: number, y: number) => mod(y, height) * width + mod(x, width);

        // clods: small lighter lumps, a little darker on their lower-right side
        const clods = Math.round(params.clods * area);
        for (let k = 0; k < clods; ++k) {
            const cx = hash(seed, SALT_CLOD, k, 0) * width;
            const cy = hash(seed, SALT_CLOD, k, 1) * height;
            const r = hashRange(0.8, 1.9, seed, SALT_CLOD, k, 2);
            this.disc(cx, cy, r, (x, y, dx, dy) => {
                this.lift[at(x, y)] = dx + dy > 0.5 ? -0.12 : 0.24;
            });
        }

        // pebbles: small grey stones, lit on their top-left, casting a shadow
        const stones = createGradient(PEBBLE_PALETTE);
        const pebbles = Math.round(params.pebbles * area);
        for (let k = 0; k < pebbles; ++k) {
            const cx = hash(seed, SALT_PEBBLE, k, 0) * width;
            const cy = hash(seed, SALT_PEBBLE, k, 1) * height;
            const r = hashRange(0.9, 2.2, seed, SALT_PEBBLE, k, 2);
            const tone = hashRange(0.35, 0.8, seed, SALT_PEBBLE, k, 3);
            this.disc(cx + 1, cy + 1, r, (x, y) => {
                this.shadow[at(x, y)] = 0.3;
            });
            this.disc(cx, cy, r, (x, y, dx, dy) => {
                const light = clamp(tone - (0.25 * (dx + dy)) / r);
                this.pebbles[at(x, y)] = Rainbow.convertToRGBA(sample(stones, light));
            });
        }
    }

    /**
     * Calls `draw` on each pixel of a disc, with the offset of the pixel from its center.
     */
    private disc(
        cx: number,
        cy: number,
        r: number,
        draw: (x: number, y: number, dx: number, dy: number) => void,
    ): void {
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); ++y) {
            for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); ++x) {
                const dx = x + 0.5 - cx;
                const dy = y + 0.5 - cy;
                if (dx * dx + dy * dy <= r * r) {
                    draw(x, y, dx, dy);
                }
            }
        }
    }

    /**
     * Color of the dirt at a pixel.
     */
    color(x: number, y: number): ColorRGBAStruct {
        const i = mod(y, this.height) * this.width + mod(x, this.width);
        const pebble = this.pebbles[i];
        const p = this.params;
        const grain = 1 + (hash(this.seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.grain;
        if (pebble) {
            return shadeRGBA(pebble, grain);
        }
        const u = x / this.width;
        const v = y / this.height;
        const n = this.blotches.sample(u, v);
        // crumbs, and single specks of darker and lighter soil
        const speck = hash(this.seed, SALT_GRAIN, x, y, 1);
        const specks = speck < 0.05 ? -0.18 : speck > 0.95 ? 0.14 : 0;
        const tone =
            0.5 +
            (n - 0.5) * 2 * p.contrast +
            0.3 * (this.crumbs.sample(u, v) - 0.5) +
            specks +
            this.lift[i];
        const damp = 1 - 0.4 * p.wetness;
        const color = Rainbow.convertToRGBA(sample(this.palette, tone));
        return shadeRGBA(color, grain * damp * (1 - this.shadow[i]));
    }
}
