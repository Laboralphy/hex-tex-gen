import { Perlin } from '@laboralphy/algorithms';
import type { Random } from './Random';

/**
 * Builds a tileable Perlin noise grid, values in [0, 1].
 * @param octaves number of octaves; defaults to the optimal count for the size
 */
export function createNoise(
    width: number,
    height: number,
    random: Random,
    octaves: number = Perlin.computeOptimalOctaves(Math.min(width, height)),
): Float32Array[] {
    const base: Float32Array[] = [];
    for (let y = 0; y < height; ++y) {
        const row = new Float32Array(width);
        for (let x = 0; x < width; ++x) {
            row[x] = random.next();
        }
        base.push(row);
    }
    return Perlin.generate(base, octaves);
}
