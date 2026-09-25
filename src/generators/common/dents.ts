import { z } from 'zod';
import { hash, hashRange } from '../../core/hash';
import { mod } from '../../core/math';
import { shade } from '../../core/palette';
import { DETAIL, FROM_AGE, range } from '../../core/schema';
import type { Texture } from '../../core/Texture';

/** dents of a metal template */
export const dentsGroup = () =>
    z
        .strictObject({
            density: z.number().min(0).optional().describe(`dents per 32 × 32 pixels;${FROM_AGE}`),
            size: range(z.number().min(0))
                .optional()
                .describe(`[min, max] dent radius, in pixels;${FROM_AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('dents, shaded against the light');

/** dent wear values, every one resolved */
export type DentsWear = { density: number; size: [number, number] };

/**
 * Dents: depressions, their top-left side in shadow, their bottom-right side lit. A dent
 * stays within the part it falls on, and is skipped where it falls on none.
 * @param ids part index of each pixel, -1 where there is no metal
 * @param salt random sequence of the dents
 */
export function drawDents(
    texture: Texture,
    ids: Int32Array,
    dents: DentsWear,
    seed: number,
    salt: number,
): void {
    const { width, height } = texture;
    const count = Math.round((dents.density * width * height) / 1024);
    for (let k = 0; k < count; ++k) {
        const cx = hash(seed, salt, k, 0) * width;
        const cy = hash(seed, salt, k, 1) * height;
        const radius = hashRange(dents.size[0], dents.size[1], seed, salt, k, 2);
        const id = ids[Math.floor(cy) * width + Math.floor(cx)];
        if (id < 0) {
            continue;
        }
        for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); ++y) {
            for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); ++x) {
                const dx = x + 0.5 - cx;
                const dy = y + 0.5 - cy;
                const s = Math.hypot(dx, dy) / radius;
                const i = mod(y, height) * width + mod(x, width);
                if (s >= 1 || ids[i] !== id) {
                    continue;
                }
                const side = (dx + dy) / Math.max(0.001, Math.hypot(dx, dy));
                const f = 1 + 0.35 * side * (1 - s * s);
                texture.setPixel(x, y, shade(texture.getPixel(x, y), f));
            }
        }
    }
}
