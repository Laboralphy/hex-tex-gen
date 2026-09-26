import { FractalNoise } from '@laboralphy/algorithms';
import { z } from 'zod';
import { hashSeed } from '../../core/hash';
import { palette, ratio } from '../../core/schema';

/** white marble, from its darkest veins to its lightest stone */
export const MARBLE_PALETTE = ['#5e5a55', '#a39e95', '#d8d3c8', '#f1ede4'];

/** the marble of a classical template */
export const marbleGroup = () =>
    z
        .strictObject({
            palette: palette()
                .default(MARBLE_PALETTE)
                .describe('marble colors, from its veins to its lightest stone'),
            veins: z.number().min(0).default(3).describe('veins across the patch; 0 for none'),
            contrast: ratio().default(0.5).describe('darkness of the veins, in [0, 1]'),
        })
        .prefault({})
        .describe('veined marble');

export type MarbleParams = z.output<ReturnType<typeof marbleGroup>>;

/**
 * Veined marble: a pale, slightly clouded stone crossed by thin dark veins, which wander
 * along a diagonal. It scales with the texture.
 */
export class Marble {
    private readonly cloud: FractalNoise;
    private readonly warp: FractalNoise;

    /**
     * @param seed seed of the marble
     * @param width width of the texture, in pixels
     * @param height height of the texture, in pixels
     */
    constructor(
        seed: number,
        private readonly width: number,
        private readonly height: number,
        private readonly params: MarbleParams,
    ) {
        this.cloud = new FractalNoise({ seed: hashSeed(seed, 0), period: 3, octaves: 3 });
        this.warp = new FractalNoise({ seed: hashSeed(seed, 1), period: 2, octaves: 4 });
    }

    /**
     * Palette position of the marble at a pixel, in [0, 1]: veins are dark, the stone
     * light.
     */
    tone(x: number, y: number): number {
        const u = x / this.width;
        const v = y / this.height;
        const stone = 0.78 + 0.25 * (this.cloud.sample(u, v) - 0.5);
        if (this.params.veins <= 0) {
            return stone;
        }
        // a vein where a warped diagonal wave crosses zero: sharp, thin lines
        const phase = (u * 0.6 + v + 0.8 * this.warp.sample(u, v)) * this.params.veins;
        const vein = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(Math.PI * phase)) * 6), 2);
        return stone - vein * this.params.contrast;
    }
}
