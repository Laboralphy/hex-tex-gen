import { describe, expect, it } from 'vitest';
import { moss } from '../src';

const alphaAt = (data: Uint8ClampedArray, width: number, x: number, y: number) =>
    data[(y * width + x) * 4 + 3];

describe('moss', () => {
    it('renders at its own size by default', () => {
        const t = moss.generate({ seed: 1 });
        expect([t.width, t.height]).toEqual(moss.defaults.size);
    });

    it('is a transparent overlay with semi-transparent moss', () => {
        const t = moss.generate({ seed: 1, width: 128, height: 32 });
        const alphas = new Set<number>();
        for (let i = 3; i < t.data.length; i += 4) {
            alphas.add(t.data[i]);
        }
        expect(alphas.has(0)).toBe(true);
        expect([...alphas].some((a) => a > 0 && a < 255)).toBe(true);
        expect(Math.max(...alphas)).toBeLessThanOrEqual(Math.round(moss.defaults.moss.alpha * 255));
    });

    it('grows from the top edge and gets sparser downwards', () => {
        const width = 128;
        const height = 32;
        const t = moss.generate({ seed: 3, width, height });
        const covered = (y: number) =>
            Array.from({ length: width }, (_, x) => alphaAt(t.data, width, x, y)).filter(
                (a) => a > 0,
            ).length;
        expect(covered(0)).toBeGreaterThan(covered(height - 1));
        expect(covered(0)).toBeGreaterThan(width / 4);
    });

    it('keeps vines within the patch height', () => {
        const t = moss.generate({ seed: 5, size: [64, 16], vines: { length: [100, 100] } });
        expect(t.height).toBe(16);
        // full length vines reach the bottom row, and nothing wraps back onto the top
        expect(t.data.some((v, i) => i % 4 === 3 && i >= 15 * 64 * 4 && v > 0)).toBe(true);
    });

    it('draws nothing but the cushion without vines', () => {
        const t = moss.generate({ seed: 1, vines: { count: 0 }, ledge: { size: 2, coverage: 1 } });
        for (let y = 2; y < t.height; ++y) {
            for (let x = 0; x < t.width; ++x) {
                expect(alphaAt(t.data, t.width, x, y)).toBe(0);
            }
        }
    });
});
