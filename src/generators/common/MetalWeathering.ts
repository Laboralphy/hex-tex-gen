import type { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow, type Color32 } from '@laboralphy/rainbow';
import { hash, hashRange } from '../../core/hash';
import { clamp } from '../../core/math';
import { createGradient, mixRGBA, sample } from '../../core/palette';
import type { MetalWearBase } from './metal-wear';

/**
 * Rust and tarnish of a metal surface: rust patches where a noise exceeds the coverage,
 * streaks running down from rivets, and a blotchy darkening.
 */
export class MetalWeathering {
    /** strength of the rust streaks at each pixel, in [0, 1] */
    private readonly streaks: Float32Array;
    private readonly rust: Color32[];

    /**
     * @param width width of the texture, in pixels
     * @param height height of the texture, in pixels
     * @param tarnishNoise blotches of the tarnish
     */
    constructor(
        private readonly width: number,
        height: number,
        private readonly wear: Pick<MetalWearBase, 'rust' | 'tarnish'>,
        palette: string[],
        private readonly tarnishNoise: FractalNoise,
    ) {
        this.streaks = new Float32Array(width * height);
        this.rust = createGradient(palette);
    }

    /**
     * Runs a streak down from some of the rivets.
     * @param salt random sequence of the streaks
     * @param pixel index of a pixel of the surface, or -1 where a streak stops
     */
    addStreaks(
        rivets: { x: number; y: number }[],
        seed: number,
        salt: number,
        pixel: (x: number, y: number) => number,
    ): void {
        const rust = this.wear.rust;
        rivets.forEach(({ x, y }, k) => {
            if (hash(seed, salt, k, 0) >= rust.streaks) {
                return;
            }
            const length = hashRange(rust.length[0], rust.length[1], seed, salt, k, 1);
            for (let t = 2; t < length + 2; ++t) {
                const i = pixel(x, y + t);
                if (i < 0) {
                    break;
                }
                this.streaks[i] = Math.max(this.streaks[i], 0.7 * (1 - (t - 2) / length));
            }
        });
    }

    /**
     * Weathers a pixel.
     * @param n rust noise at the pixel, in [0, 1]: rust appears where it is high
     * @param u horizontal position, in [0, 1), for the tarnish noise
     * @param v vertical position, in [0, 1), for the tarnish noise
     */
    apply(color: Color32, x: number, y: number, n: number, u: number, v: number): Color32 {
        let rgba = Rainbow.convertToRGBA(color);
        const coverage = this.wear.rust.coverage;
        let amount = coverage > 0 ? clamp((n - (1 - coverage)) / 0.12) : 0;
        amount = Math.max(amount, this.streaks[y * this.width + x]);
        if (amount > 0) {
            const r = Rainbow.convertToRGBA(sample(this.rust, n + 0.1));
            rgba = { ...mixRGBA(rgba, r, amount), a: 1 };
        }
        const tarnish = this.wear.tarnish;
        if (tarnish > 0) {
            const f = 1 - tarnish * (0.5 + 0.5 * this.tarnishNoise.sample(u, v));
            rgba = { r: rgba.r * f, g: rgba.g * f, b: rgba.b * f, a: 1 };
        }
        return Rainbow.fromRGBA(rgba);
    }
}
