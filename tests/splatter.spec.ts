import { describe, expect, it } from 'vitest';
import { splatter, type Texture } from '../src';

const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;

/** covered pixels, and their centroid */
function coverage(t: Texture): { count: number; x: number; y: number } {
    let [count, sx, sy] = [0, 0, 0];
    for (let y = 0; y < t.height; ++y) {
        for (let x = 0; x < t.width; ++x) {
            if (alpha(t, x, y) > 0) {
                ++count;
                sx += x;
                sy += y;
            }
        }
    }
    return { count, x: sx / count, y: sy / count };
}

describe('splatter', () => {
    it('is an overlay of stains of a single alpha', () => {
        const t = splatter.generate({ seed: 1 });
        const alphas = new Set<number>();
        for (let i = 3; i < t.data.length; i += 4) {
            alphas.add(t.data[i]);
        }
        expect([...alphas].sort((a, b) => a - b)).toEqual([0, Math.round(0.9 * 255)]);
        const { count } = coverage(t);
        expect(count).toBeGreaterThan(0.1 * t.width * t.height);
        expect(count).toBeLessThan(0.6 * t.width * t.height);
    });

    it('is blood by default, any liquid with another color and alpha', () => {
        const t = splatter.generate({ seed: 1, liquid: { grain: 0, rim: 0, gloss: 0 } });
        const c = t.getPixel(16, 16);
        const [r, g, b] = [c >>> 24, (c >>> 16) & 0xff, (c >>> 8) & 0xff];
        expect(r).toBeGreaterThan(2 * g);
        expect(g).toBeGreaterThanOrEqual(b);
        const water = splatter.generate({ seed: 1, liquid: { color: '#1d2530', alpha: 0.4 } });
        expect(alpha(water, 16, 16)).toBe(Math.round(0.4 * 255));
    });

    it('stays inside the patch, even with an oversized pool', () => {
        const t = splatter.generate({ seed: 2, impact: { radius: 100 }, direction: { bias: 0 } });
        // the pool is clamped: it fills the patch but for its edges
        expect(alpha(t, 16, 16)).toBeGreaterThan(0);
        expect(coverage(t).count).toBeLessThan(t.width * t.height);
    });

    it('leans towards the direction of the throw', () => {
        /** horizontal centroid of the stains farther than 8 pixels from a point */
        const spray = (t: Texture, cx: number, cy: number) => {
            let [n, sx] = [0, 0];
            for (let y = 0; y < t.height; ++y) {
                for (let x = 0; x < t.width; ++x) {
                    if (alpha(t, x, y) > 0 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > 8) {
                        ++n;
                        sx += x + 0.5;
                    }
                }
            }
            return sx / n;
        };
        // the pool is pushed back against the throw by 0.2 × 0.9 × 32 pixels
        const recoil = 0.2 * 0.9 * 32;
        for (const seed of [1, 2, 3, 4]) {
            const right = splatter.generate({ seed, direction: { angle: 0, bias: 0.9 } });
            const left = splatter.generate({ seed, direction: { angle: 180, bias: 0.9 } });
            expect(alpha(right, Math.floor(16 - recoil), 16)).toBeGreaterThan(0);
            expect(alpha(left, Math.floor(16 + recoil), 16)).toBeGreaterThan(0);
            // the streaks and droplets fly along it
            expect(spray(right, 16 - recoil, 16)).toBeGreaterThan(16 - recoil + 4);
            expect(spray(left, 16 + recoil, 16)).toBeLessThan(16 + recoil - 4);
        }
    });

    it('scales with the patch, the same seed giving the same splash', () => {
        const small = coverage(splatter.generate({ seed: 4 }));
        const large = coverage(splatter.generate({ seed: 4, width: 64, height: 64 }));
        expect(large.count).toBeGreaterThan(3 * small.count);
        expect(large.count).toBeLessThan(5 * small.count);
        expect(large.x / 2).toBeCloseTo(small.x, 0);
        expect(large.y / 2).toBeCloseTo(small.y, 0);
    });
});
