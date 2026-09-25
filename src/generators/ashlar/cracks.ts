import { Bresenham } from '@laboralphy/algorithms';
import { hash, hashRange } from '../../core/hash';
import { mod } from '../../core/math';
import { shade } from '../../core/palette';
import { Texture } from '../../core/Texture';
import type { StoneBox } from './masonry';
import { SALT_CRACK } from './salts';
import type { AshlarWear } from './wear';

// pixel marks of the crack pass
const CRACK = 1;
const HIGHLIGHT = 2;

/**
 * Cracks: random walks drawn inside their stone, with a highlight below-right.
 * @param ids stone index of each pixel, -1 for mortar
 */
export function drawCracks(
    texture: Texture,
    stones: StoneBox[],
    ids: Int32Array,
    cracks: AshlarWear['cracks'],
    seed: number,
): void {
    const { width, height } = texture;
    const cracked = new Uint8Array(width * height);
    stones.forEach(({ row: r, block: i, x, y, w, h }, id) => {
        if (hash(seed, SALT_CRACK, r, i, 0) >= cracks.ratio) {
            return;
        }
        let cx = x + w * hashRange(0.3, 0.7, seed, SALT_CRACK, r, i, 1);
        let cy = y + h * hashRange(0.3, 0.7, seed, SALT_CRACK, r, i, 2);
        let angle = hash(seed, SALT_CRACK, r, i, 3) * 2 * Math.PI;
        const [min, max] = cracks.length;
        let remaining = hashRange(min, max, seed, SALT_CRACK, r, i, 4);
        for (let step = 0; remaining > 0; ++step) {
            const segment = Math.min(remaining, hashRange(2, 4, seed, SALT_CRACK, r, i, 5, step));
            angle += (hash(seed, SALT_CRACK, r, i, 6, step) - 0.5) * 1.2;
            const nx = cx + Math.cos(angle) * segment;
            const ny = cy + Math.sin(angle) * segment;
            const complete = Bresenham.line(
                Math.round(cx),
                Math.round(cy),
                Math.round(nx),
                Math.round(ny),
                (px, py) => {
                    const k = mod(py, height) * width + mod(px, width);
                    if (ids[k] !== id) {
                        return false;
                    }
                    if (!cracked[k]) {
                        cracked[k] = CRACK;
                        texture.setPixel(px, py, shade(texture.getPixel(px, py), 0.55));
                    }
                    return true;
                },
            );
            if (!complete) {
                break;
            }
            cx = nx;
            cy = ny;
            remaining -= segment;
        }
    });
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            if (cracked[y * width + x] !== CRACK) {
                continue;
            }
            const k = mod(y + 1, height) * width + mod(x + 1, width);
            if (cracked[k] === 0 && ids[k] === ids[y * width + x]) {
                cracked[k] = HIGHLIGHT;
                texture.setPixel(x + 1, y + 1, shade(texture.getPixel(x + 1, y + 1), 1.2));
            }
        }
    }
}
