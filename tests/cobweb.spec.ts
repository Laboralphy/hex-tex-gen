import { describe, expect, it } from 'vitest';
import { cobweb, cobwebWear, type CobwebParams, type Texture } from '../src';

const defaults = cobweb.defaults as CobwebParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;

/** number of thread pixels in a region */
function threads(t: Texture, x0 = 0, y0 = 0, x1 = t.width, y1 = t.height): number {
    let n = 0;
    for (let y = y0; y < y1; ++y) {
        for (let x = x0; x < x1; ++x) {
            n += alpha(t, x, y) > 0 ? 1 : 0;
        }
    }
    return n;
}

describe('cobweb', () => {
    it('is an overlay of opaque threads by default', () => {
        const t = cobweb.generate({ seed: 1 });
        const alphas = new Set<number>();
        for (let i = 3; i < t.data.length; i += 4) {
            alphas.add(t.data[i]);
        }
        expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]);
        const translucent = cobweb.generate({ seed: 1, thread: { alpha: 0.5 } });
        expect(Math.max(...translucent.data.filter((_, i) => i % 4 === 3))).toBe(128);
    });

    it('radiates from its top-left corner', () => {
        const t = cobweb.generate({ seed: 2, width: 32, height: 32 });
        expect(alpha(t, 0, 0)).toBe(255);
        // denser near the corner than at the opposite one
        expect(threads(t, 0, 0, 16, 16)).toBeGreaterThan(2 * threads(t, 16, 16, 32, 32));
        // the outer rings reach both walls
        expect(threads(t, 8, 0, 32, 1)).toBeGreaterThan(0);
        expect(threads(t, 0, 8, 1, 32)).toBeGreaterThan(0);
    });

    it('radiates from the corner it is given, the same web mirrored', () => {
        const web = cobweb.generate({ seed: 1 });
        const { width: w, height: h } = web;
        for (const [corner, mx, my] of [
            ['top-right', true, false],
            ['bottom-left', false, true],
            ['bottom-right', true, true],
        ] as const) {
            const turned = cobweb.generate({ seed: 1, corner });
            for (let y = 0; y < h; ++y) {
                for (let x = 0; x < w; ++x) {
                    const [tx, ty] = [mx ? w - 1 - x : x, my ? h - 1 - y : y];
                    expect(turned.getPixel(tx, ty), corner).toBe(web.getPixel(x, y));
                }
            }
        }
    });

    it('draws 1-pixel threads at any size', () => {
        // a larger web has longer threads, not thicker ones
        const small = threads(cobweb.generate({ seed: 3, age: 0 }));
        const large = threads(cobweb.generate({ seed: 3, age: 0, width: 64, height: 64 }));
        expect(large).toBeGreaterThan(2 * small);
        expect(large).toBeLessThan(6 * small);
    });

    it('tears and gathers dust with age', () => {
        const fresh = cobweb.generate({ seed: 4, age: 0, width: 32, height: 32 });
        const torn = cobweb.generate({ seed: 4, age: 0, torn: 0.6, width: 32, height: 32 });
        expect(threads(torn)).toBeLessThan(threads(fresh));
        const lum = (t: Texture, x: number, y: number) => t.getPixel(x, y) >>> 24;
        const dusty = cobweb.generate({ seed: 4, age: 0, dust: 1, width: 32, height: 32 });
        // a matted sheet in the apex, greyer than fresh threads
        expect(threads(dusty, 0, 0, 6, 6)).toBeGreaterThan(threads(fresh, 0, 0, 6, 6));
        expect(lum(dusty, 0, 0)).toBeLessThan(lum(fresh, 0, 0));
    });

    it('derives its wear from age, explicit values winning', () => {
        expect(cobwebWear({ ...defaults, age: 0 })).toEqual({ torn: 0, dust: 0 });
        expect(cobwebWear({ ...defaults, age: 1 }).torn).toBeGreaterThan(0.4);
        expect(cobwebWear({ ...defaults, age: 1, dust: 0 }).dust).toBe(0);
    });
});
