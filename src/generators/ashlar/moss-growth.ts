import { FractalNoise } from '@laboralphy/algorithms';
import { hash, hashSeed } from '../../core/hash';
import { createGradient, sample } from '../../core/palette';
import { Texture } from '../../core/Texture';
import type { AshlarParams } from './ashlar';
import { SALT_NOISE, SALT_MOSS } from './salts';

/**
 * Moss along the top edges of the stones, in patches, following their shape, with vines
 * hanging down the stone faces, and moss in the joints below mossy stones.
 */
export function growMoss(
    texture: Texture,
    moss: AshlarParams['moss'],
    ids: Int32Array,
    dist: Float32Array,
    tops: Uint8Array,
    seed: number,
): void {
    const { width, height } = texture;
    const palette = createGradient(moss.palette);
    // patches scale with the wall; their outline has a grain in real pixels
    const patches = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 8),
        period: 4,
        octaves: 3,
    });
    const threshold = 1 - moss.coverage;
    const covered = (x: number, y: number) => patches.sample(x / width, y / height) > threshold;
    const grain = (x: number, y: number) => (hash(seed, SALT_MOSS, x, y, 0) - 0.5) * 0.25;
    const mossy = new Uint8Array(width * height);
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const k = y * width + x;
            if (ids[k] < 0) {
                // the joints: speckles of dark moss, where the stones around are mossy
                if (covered(x, y) && hash(seed, SALT_MOSS, x, y, 1) < moss.joints) {
                    texture.setPixel(x, y, sample(palette, 0.15 + grain(x, y)));
                }
                continue;
            }
            if (!tops[k] || !covered(x, y)) {
                continue;
            }
            // thicker where the patch is denser
            const n = patches.sample(x / width, y / height);
            const depth = moss.depth * (0.5 + (n - threshold) / Math.max(0.01, moss.coverage));
            if (dist[k] < depth) {
                mossy[k] = 1;
                // lit on top, darker towards the stone
                const t = 0.85 - (0.5 * dist[k]) / Math.max(1, depth);
                texture.setPixel(x, y, sample(palette, t + grain(x, y)));
            }
        }
    }
    // vines: from the lowest moss of a column, down the face of the stone
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const k = y * width + x;
            const below = ((y + 1) % height) * width + x;
            if (!mossy[k] || mossy[below] || hash(seed, SALT_MOSS, x, y, 2) >= moss.vines) {
                continue;
            }
            const [min, max] = moss.length;
            const length = min + hash(seed, SALT_MOSS, x, y, 3) * (max - min);
            for (let t = 1; t <= length; ++t) {
                const vy = (y + t) % height;
                if (ids[vy * width + x] !== ids[k]) {
                    break;
                }
                const tone = 0.45 - (0.25 * t) / length + grain(x, vy);
                texture.setPixel(x, vy, sample(palette, tone));
            }
        }
    }
}
