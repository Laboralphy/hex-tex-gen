import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { Texture } from '../core/Texture';
import { hash, hashRange } from '../core/hash';
import { createGradient, sample } from '../core/palette';
import { deepMerge } from '../core/object-fusion';
import type { TextureGenerator } from './types';

/**
 * Parameters of the moss template. "Layout" values are expressed in pixels at the
 * patch's own `size` and scale with it; "detail" values are real pixels and never scale.
 */
export type MossParams = {
    /** own size of the patch, in pixels */
    size: [number, number];
    /** vines hanging from the top edge */
    vines: {
        /** layout: vines across the patch */
        count: number;
        /** layout: [min, max] vine length, clamped to the patch height */
        length: [number, number];
        /** layout: maximum horizontal wander of a vine */
        sway: number;
        /** detail: vine width at the top, in pixels; vines taper towards their tip */
        thickness: number;
    };
    /** detail: leaves sprouting from the vines */
    leaves: {
        /** chance of a leaf at each pixel of a vine, in [0, 1] */
        ratio: number;
        /** [min, max] leaf length */
        size: [number, number];
    };
    /** detail: moss cushion along the top edge */
    ledge: {
        /** maximum cushion thickness */
        size: number;
        /** ratio of the edge covered by the cushion, in [0, 1]; vines always grow a clump */
        coverage: number;
        /** half width of the clump at the top of each vine */
        clump: number;
    };
    /** moss color */
    moss: {
        /** CSS colors, from darkest to lightest */
        palette: string[];
        /** alpha of the moss, in [0, 1] */
        alpha: number;
        /** alpha lost from the top of a vine to its tip, in [0, 1] */
        fade: number;
        /** detail: random brightness variation between pixels, in [0, 1] */
        grain: number;
    };
};

// each random decision draws from its own sequence
const SALT_VINE = 1;
const SALT_LEAF = 2;
const SALT_NOISE = 3;
const SALT_GRAIN = 4;

// palette positions of each part: the cushion is lit from above, leaves catch the light
const TONE_LEDGE_TOP = 0.85;
const TONE_LEDGE_BOTTOM = 0.3;
const TONE_VINE = 0.45;
const TONE_LEAF = 0.7;
/** tone added to the leftmost pixel of a vine and removed from the rightmost one */
const TONE_BEVEL = 0.15;

function mod(a: number, n: number): number {
    return ((a % n) + n) % n;
}

/**
 * Hanging moss: a mossy cushion along the top edge with vines falling from it. The
 * patch is transparent elsewhere, and is meant to be laid over a wall, one patch per
 * row of stones.
 */
export const moss: TextureGenerator<MossParams> = {
    name: 'moss',
    description: 'Transparent overlay of greenish vines hanging from the top edge',
    defaults: {
        size: [64, 16],
        vines: { count: 9, length: [3, 16], sway: 1.5, thickness: 1 },
        leaves: { ratio: 0.3, size: [1, 2] },
        ledge: { size: 3, coverage: 0.5, clump: 3 },
        moss: {
            palette: ['#17230f', '#2f441b', '#4f6d2c', '#86a24a'],
            alpha: 0.9,
            fade: 0.6,
            grain: 0.1,
        },
    },
    generate(options) {
        const p = deepMerge(this.defaults, options) as MossParams & typeof options;
        const seed = p.seed;
        const width = p.width ?? p.size[0];
        const height = p.height ?? p.size[1];
        const sx = width / p.size[0];
        const sy = height / p.size[1];
        const palette = createGradient(p.moss.palette);

        // coverage in [0, 1] and palette position of each pixel; the most opaque part wins
        const cover = new Float32Array(width * height);
        const tone = new Float32Array(width * height);
        const plot = (x: number, y: number, alpha: number, t: number) => {
            if (y < 0 || y >= height || alpha <= 0) {
                return;
            }
            const k = y * width + mod(x, width);
            if (alpha > cover[k]) {
                cover[k] = alpha;
                tone[k] = t;
            }
        };

        // vines: evenly spread with some jitter, so that they never clump together
        const count = Math.max(0, Math.round(p.vines.count));
        const vineX = Array.from(
            { length: count },
            (_, i) => ((i + hashRange(-0.4, 0.4, seed, SALT_VINE, i, 0)) / count) * width,
        );

        // cushion: patches of moss along the edge, in real pixels, and a clump at the top
        // of each vine
        const ledgeNoise = new FractalNoise({
            seed: Math.floor(hash(seed, SALT_NOISE) * 4294967296),
            period: [Math.max(1, Math.round(width / 6)), 1],
            octaves: 2,
        });
        const threshold = 1 - p.ledge.coverage;
        for (let x = 0; x < width; ++x) {
            const n = ledgeNoise.sample(x / width, 0);
            let amount = n > threshold ? (n - threshold) / (1 - threshold) : 0;
            for (const vx of vineX) {
                const d = Math.abs(mod(x - vx + width / 2, width) - width / 2);
                amount = Math.max(amount, 1 - d / (p.ledge.clump + 1));
            }
            const thickness = Math.round(amount * p.ledge.size);
            for (let y = 0; y < thickness; ++y) {
                const t = y / thickness;
                plot(x, y, 1, TONE_LEDGE_TOP + t * (TONE_LEDGE_BOTTOM - TONE_LEDGE_TOP));
            }
        }

        for (let i = 0; i < count; ++i) {
            const x0 = vineX[i];
            const length = Math.min(
                height,
                hashRange(p.vines.length[0], p.vines.length[1], seed, SALT_VINE, i, 1) * sy,
            );
            const frequency = hashRange(0.5, 1.5, seed, SALT_VINE, i, 2);
            const phase = hash(seed, SALT_VINE, i, 3) * 2 * Math.PI;
            const amplitude = hash(seed, SALT_VINE, i, 4) * p.vines.sway * sx;
            const shift = hashRange(-0.1, 0.1, seed, SALT_VINE, i, 5);
            // the curve is expressed in patch height units, so it scales with the patch
            const xAt = (y: number) =>
                Math.round(
                    x0 + amplitude * Math.sin(2 * Math.PI * frequency * (y / height) + phase),
                );

            let prev = xAt(0);
            for (let y = 0; y < length; ++y) {
                const t = y / length;
                const alpha = 1 - p.moss.fade * t;
                const thickness = Math.max(1, Math.round(p.vines.thickness * (1 - t / 2)));
                // a horizontal span joins this pixel to the previous one, so the vine
                // never breaks on steep bends
                const cur = xAt(y);
                const left = Math.min(prev, cur) - ((thickness - 1) >> 1);
                const right = Math.max(prev, cur) + (thickness >> 1);
                for (let x = left; x <= right; ++x) {
                    const bevel = right > left ? (x === left ? 1 : x === right ? -1 : 0) : 0;
                    plot(x, y, alpha, TONE_VINE + shift + bevel * TONE_BEVEL);
                }
                prev = cur;

                // leaves: short diagonal strokes going up and away from the vine
                if (hash(seed, SALT_LEAF, i, y, 0) < p.leaves.ratio) {
                    const side = hash(seed, SALT_LEAF, i, y, 1) < 0.5 ? -1 : 1;
                    const size = Math.round(
                        hashRange(p.leaves.size[0], p.leaves.size[1], seed, SALT_LEAF, i, y, 2),
                    );
                    const from = side < 0 ? left : right;
                    for (let s = 1; s <= size; ++s) {
                        plot(from + side * s, y - (s - 1), alpha, TONE_LEAF + shift);
                    }
                }
            }
        }

        const texture = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const k = y * width + x;
                if (cover[k] === 0) {
                    continue;
                }
                const grain = (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.moss.grain;
                const color = Rainbow.convertToRGBA(sample(palette, tone[k] + grain));
                texture.setPixel(x, y, Rainbow.fromRGBA({ ...color, a: cover[k] * p.moss.alpha }));
            }
        }
        return texture;
    },
};
