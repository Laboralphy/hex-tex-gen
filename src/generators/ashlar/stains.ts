import { FractalNoise } from '@laboralphy/algorithms';
import { hash, hashRange, hashSeed } from '../../core/hash';
import { clamp, firstPixel, mod } from '../../core/math';
import { shade } from '../../core/palette';
import { Texture } from '../../core/Texture';
import type { StoneBox } from './masonry';
import { SALT_NOISE, SALT_STAIN } from './salts';
import type { AshlarWear } from './wear';

/**
 * Stains: streaks running down from the top of stones, over joints and the stones below,
 * fading along their length; the darkest streak wins where they overlap. Then grime, a
 * blotchy darkening of the whole wall.
 * @param mortarAfter mortar pixels above the face of a stone
 * @param sy vertical scale of the patch: stain lengths are layout values
 */
export function drawStains(
    texture: Texture,
    stones: StoneBox[],
    stains: AshlarWear['stains'],
    mortarAfter: number,
    sy: number,
    seed: number,
): void {
    const { width, height } = texture;
    const grimeNoise = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 7),
        period: 3,
        octaves: 3,
    });
    const stain = new Float32Array(width * height);
    const halfWidth = stains.width / 2;
    stones.forEach(({ row: r, block: i, x, y, w }) => {
        if (hash(seed, SALT_STAIN, r, i, 0) >= stains.ratio) {
            return;
        }
        const x0 = x + w * hashRange(0.1, 0.9, seed, SALT_STAIN, r, i, 1);
        const y0 = firstPixel(y, mortarAfter);
        const [min, max] = stains.length;
        const length = hashRange(min, max, seed, SALT_STAIN, r, i, 2) * sy;
        const phase = hash(seed, SALT_STAIN, r, i, 3) * 2 * Math.PI;
        for (let t = 0; t < length; ++t) {
            const xc = x0 + Math.sin(phase + t / 5) * 0.7;
            const darkness = stains.darkness * (1 - t / length);
            for (let px = Math.floor(xc - halfWidth); px <= Math.ceil(xc + halfWidth); ++px) {
                const cover = clamp(halfWidth + 0.5 - Math.abs(px + 0.5 - xc));
                const k = mod(y0 + t, height) * width + mod(px, width);
                stain[k] = Math.max(stain[k], darkness * cover);
            }
        }
    });
    const grime = stains.grime;
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const g =
                grime > 0
                    ? Math.max(0, (grimeNoise.sample(x / width, y / height) - 0.35) / 0.65)
                    : 0;
            const darkening = 1 - (1 - stain[y * width + x]) * (1 - grime * g);
            if (darkening > 0) {
                texture.setPixel(x, y, shade(texture.getPixel(x, y), 1 - darkening));
            }
        }
    }
}
