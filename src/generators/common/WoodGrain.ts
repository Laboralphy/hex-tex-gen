import { FractalNoise } from '@laboralphy/algorithms';

/**
 * Grain of wooden members, such as the frame of a window or the boards of a shelf: a noise
 * stretched along each member, horizontal or vertical. It scales with the texture.
 */
export class WoodGrain {
    private readonly noise: FractalNoise;

    /**
     * @param seed seed of the noise
     * @param width width of the texture, in pixels
     * @param height height of the texture, in pixels
     */
    constructor(
        seed: number,
        private readonly width: number,
        private readonly height: number,
    ) {
        this.noise = new FractalNoise({
            seed,
            period: [2, Math.max(1, Math.round(Math.max(width, height) / 3))],
            octaves: 3,
        });
    }

    /**
     * The grain at a pixel, in [0, 1).
     * @param horizontal the member runs horizontally
     */
    sample(x: number, y: number, horizontal: boolean): number {
        const u = x / this.width;
        const v = y / this.height;
        return horizontal ? this.noise.sample(v, u) : this.noise.sample(u, v);
    }

    /**
     * Palette position of the wood at a pixel: the grain spread around the middle.
     * @param horizontal the member runs horizontally
     */
    tone(x: number, y: number, horizontal: boolean): number {
        return 0.5 + 0.9 * (this.sample(x, y, horizontal) - 0.5);
    }
}
