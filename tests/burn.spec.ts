import { describe, expect, it } from 'vitest';
import { burn, type Texture } from '../src';

const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
const channels = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return { r: c >>> 24, g: (c >>> 16) & 0xff, b: (c >>> 8) & 0xff, a: c & 0xff };
};

/** the largest alpha on a row */
const rowAlpha = (t: Texture, y: number) =>
    Math.max(...Array.from({ length: t.width }, (_, x) => alpha(t, x, y)));

describe('burn', () => {
    it('never reaches the edges of the patch, whatever its shape and size', () => {
        const cases = [
            {},
            { base: { y: 1, width: 1 }, plume: { height: 1, spread: 1 } },
            { base: { x: 0, y: 0 }, plume: { lean: -1 }, margin: 1 },
            { base: { x: 1 }, plume: { lean: 1 }, soot: { mottling: 1 } },
        ];
        for (const params of cases) {
            for (const [width, height] of [
                [48, 64],
                [20, 90],
                [128, 40],
            ]) {
                const t = burn.generate({ ...params, seed: 3, width, height });
                for (let x = 0; x < width; ++x) {
                    expect(alpha(t, x, 0)).toBe(0);
                    expect(alpha(t, x, height - 1)).toBe(0);
                }
                for (let y = 0; y < height; ++y) {
                    expect(alpha(t, 0, y)).toBe(0);
                    expect(alpha(t, width - 1, y)).toBe(0);
                }
            }
        }
    });

    it('fades out over the margin', () => {
        const t = burn.generate({ seed: 1, base: { y: 1, width: 1 }, margin: 6 });
        const inner = alpha(t, 24, t.height - 7);
        expect(inner).toBeGreaterThan(0);
        expect(alpha(t, 24, t.height - 4)).toBeLessThan(inner);
    });

    it('is densest near the fire and fades upwards', () => {
        const t = burn.generate({ seed: 1 });
        const fire = Math.round(0.85 * t.height);
        expect(rowAlpha(t, fire)).toBeGreaterThan(200);
        // along the axis of the plume
        const axis = (share: number) => alpha(t, 24, Math.round(share * t.height));
        expect(axis(0.3)).toBeLessThan(axis(0.85));
        expect(axis(0.2)).toBeLessThan(axis(0.3));
        // clear above a short plume
        const short = burn.generate({ seed: 1, plume: { height: 0.5 } });
        expect(rowAlpha(short, Math.round(0.15 * short.height))).toBe(0);
        expect(rowAlpha(short, Math.round(0.6 * short.height))).toBeGreaterThan(0);
    });

    it('chars the wall black near the fire, and singes it brown around the soot', () => {
        const t = burn.generate({ seed: 1, char: { grain: 0 } });
        const core = channels(t, 24, Math.round(0.8 * t.height));
        expect(core.r + core.g + core.b).toBeLessThan(40);
        let brown = 0;
        for (let y = 0; y < t.height; ++y) {
            for (let x = 0; x < t.width; ++x) {
                const c = channels(t, x, y);
                if (c.a > 0 && c.r > c.b + 25) {
                    ++brown;
                }
            }
        }
        expect(brown).toBeGreaterThan(20);
        expect(
            burn.generate({ seed: 1, singe: { strength: 0 }, soot: { color: '#000' } }).data,
        ).not.toEqual(t.data);
    });

    it('leans with the draft', () => {
        const centroid = (t: Texture) => {
            let [sum, sx] = [0, 0];
            for (let y = 0; y < t.height / 2; ++y) {
                for (let x = 0; x < t.width; ++x) {
                    sum += alpha(t, x, y);
                    sx += alpha(t, x, y) * x;
                }
            }
            return sx / sum;
        };
        const left = burn.generate({ seed: 1, plume: { lean: -1 } });
        const right = burn.generate({ seed: 1, plume: { lean: 1 } });
        expect(centroid(left)).toBeLessThan(centroid(right) - 4);
    });

    it('gives the same mark for the same seed, another one for another seed', () => {
        expect(burn.generate({ seed: 5 }).data).toEqual(burn.generate({ seed: 5 }).data);
        expect(burn.generate({ seed: 5 }).data).not.toEqual(burn.generate({ seed: 6 }).data);
    });
});
