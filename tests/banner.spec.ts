import { describe, expect, it } from 'vitest';
import { banner, bannerWear, type BannerParams, type Texture } from '../src';

const defaults = banner.defaults as BannerParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
// no wear, no shadow, no rod: the fabric fills [0, 24) x [0, 56)
const clean = {
    seed: 1,
    age: 0,
    rips: { roughness: 0 },
    shadow: { offset: 0 },
    rod: { enabled: false },
    folds: { depth: 0 },
    fabric: { color: '#ff0000', weave: 0 },
    border: { inset: 0, stripes: [{ color: '#0000ff', width: 2 }] },
};
const RED = 0xff0000ff;
const BLUE = 0x0000ffff;

describe('banner', () => {
    it('shapes its lower end', () => {
        const shape = (base: string) =>
            banner.generate({ ...clean, shape: { base, depth: 0.25, tails: 2 } } as never);
        const flat = shape('flat');
        expect(alpha(flat, 12, 55)).toBe(255);
        expect(alpha(flat, 1, 55)).toBe(255);
        // the lower end is 14 pixels high: probe 6 pixels above the bottom
        const point = shape('point');
        expect(alpha(point, 12, 50)).toBe(255);
        expect(alpha(point, 2, 50)).toBe(0);
        const swallowtail = shape('swallowtail');
        expect(alpha(swallowtail, 12, 50)).toBe(0);
        expect(alpha(swallowtail, 2, 50)).toBe(255);
        const tails = shape('tails');
        // two points, at a quarter and three quarters of the width
        expect(alpha(tails, 6, 54)).toBe(255);
        expect(alpha(tails, 12, 54)).toBe(0);
        expect(alpha(tails, 18, 54)).toBe(255);
    });

    it('borders the sides and the lower end with stripes', () => {
        const t = banner.generate(clean as never);
        expect(t.getPixel(0, 20)).toBe(BLUE);
        expect(t.getPixel(1, 20)).toBe(BLUE);
        expect(t.getPixel(2, 20)).toBe(RED);
        expect(t.getPixel(23, 20)).toBe(BLUE);
        expect(t.getPixel(12, 55)).toBe(BLUE);
        expect(t.getPixel(12, 20)).toBe(RED);
    });

    it('hangs from a rod and casts a shadow to the bottom-right', () => {
        const t = banner.generate({ seed: 1, age: 0, rips: { roughness: 0 } });
        // the rod spans the whole width but the shadow column
        expect(alpha(t, 0, 0)).toBe(255);
        expect(alpha(t, 22, 0)).toBe(255);
        // the shadow: translucent black, one pixel below the fabric
        expect(alpha(t, 12, 55)).toBe(Math.round(0.4 * 255));
        expect(t.getPixel(12, 55) >>> 8).toBe(0);
    });

    it('lets tears cut through the border', () => {
        const torn = banner.generate({
            ...clean,
            rips: { count: 6, depth: [4, 4], roughness: 0 },
        } as never);
        let missing = 0;
        for (let y = 0; y < 56; ++y) {
            if (alpha(torn, 0, y) === 0 || alpha(torn, 23, y) === 0) {
                ++missing;
            }
        }
        expect(missing).toBeGreaterThan(0);
    });

    it('reports its anchors', () => {
        const t = banner.generate({ seed: 1 });
        // below the rod (2 pixels) and inside the border (1 + 2 pixels)
        expect(t.anchors.field).toEqual([{ x: 5, y: 5 }]);
        expect(t.anchors.emblem).toHaveLength(1);
    });

    it('ages: derived values, explicit values winning', () => {
        expect(bannerWear({ ...defaults, age: 0 })).toEqual({
            fading: 0,
            stains: 0,
            rips: { count: 0, depth: [1, 2], roughness: 0.1 },
            holes: 0,
        });
        const old = bannerWear({ ...defaults, age: 1, fading: 0.05 });
        expect(old.fading).toBe(0.05);
        expect(old.rips.count).toBe(6);
        const opaque = (t: Texture) => {
            let n = 0;
            for (let i = 3; i < t.data.length; i += 4) {
                n += t.data[i] === 255 ? 1 : 0;
            }
            return n;
        };
        expect(opaque(banner.generate({ seed: 1, age: 1 }))).toBeLessThan(
            opaque(banner.generate({ seed: 1, age: 0 })),
        );
    });
});
