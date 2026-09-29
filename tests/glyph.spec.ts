import { describe, expect, it } from 'vitest';
import { glyph, glyphWear, type GlyphParams, type Texture } from '../src';

const defaults = glyph.defaults as GlyphParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;

/** inked pixels in a region */
function ink(t: Texture, x0 = 0, y0 = 0, x1 = t.width, y1 = t.height): number {
    let n = 0;
    for (let y = y0; y < y1; ++y) {
        for (let x = x0; x < x1; ++x) {
            n += alpha(t, x, y) > 0 ? 1 : 0;
        }
    }
    return n;
}

/** distinct alphas of the inked pixels */
function alphas(t: Texture): Set<number> {
    const set = new Set<number>();
    for (let i = 3; i < t.data.length; i += 4) {
        if (t.data[i] > 0) {
            set.add(t.data[i]);
        }
    }
    return set;
}

describe('glyph', () => {
    it('draws every type as thin strokes on a transparent patch', () => {
        for (const type of ['pentagram', 'grid', 'alchemy', 'tally'] as const) {
            const t = glyph.generate({ seed: 1, type, width: 64, height: 64 });
            expect(ink(t)).toBeGreaterThan(100);
            expect(ink(t)).toBeLessThan(0.4 * 64 * 64);
        }
    });

    it('is fresh and uniform at age 0, cloudy with age', () => {
        const fresh = glyph.generate({ seed: 2, age: 0 });
        expect([...alphas(fresh)]).toEqual([Math.round(0.9 * 255)]);
        const old = glyph.generate({ seed: 2, age: 1 });
        // parts worn away, the rest faint and of varied alpha
        const total = (t: Texture) => t.data.reduce((sum, v, i) => sum + (i % 4 === 3 ? v : 0), 0);
        expect(total(old)).toBeLessThan(0.6 * total(fresh));
        expect(alphas(old).size).toBeGreaterThan(10);
    });

    it('derives its fading from age, an explicit value winning', () => {
        expect(glyphWear({ ...defaults, age: 0 }).fading).toBe(0);
        expect(glyphWear({ ...defaults, age: 1 }).fading).toBe(1);
        expect(glyphWear({ ...defaults, age: 1, fading: 0.2 }).fading).toBe(0.2);
    });

    it('fills as many grid squares as asked', () => {
        const empty = ink(glyph.generate({ seed: 3, age: 0, type: 'grid', grid: { filled: 0 } }));
        const some = ink(glyph.generate({ seed: 3, age: 0, type: 'grid', grid: { filled: 4 } }));
        const all = ink(glyph.generate({ seed: 3, age: 0, type: 'grid', grid: { filled: 9 } }));
        expect(some).toBeGreaterThan(empty);
        expect(all).toBeGreaterThan(some);
    });

    it('counts days with the tally, the fifth stroke across the others', () => {
        const count = (n: number) =>
            glyph.generate({ seed: 4, age: 0, chaos: 0, type: 'tally', tally: { count: n } });
        // one upright stroke per day, crossing the middle row
        for (const n of [1, 2, 3, 4]) {
            const t = count(n);
            let crossings = 0;
            for (let x = 0; x < t.width; ++x) {
                crossings += alpha(t, x, 16) > 0 && alpha(t, x - 1, 16) === 0 ? 1 : 0;
            }
            expect(crossings).toBe(n);
        }
        // the fifth stroke, low on the left, high on the right
        const five = count(5);
        expect(ink(five)).toBeGreaterThan(ink(count(4)));
        expect(ink(five, 0, 20, 5, 26)).toBeGreaterThan(0);
        expect(ink(five, 27, 7, 32, 13)).toBeGreaterThan(0);
    });

    it('shakes the scribing with chaos', () => {
        const steady = glyph.generate({ seed: 5, age: 0, chaos: 0, type: 'tally' });
        const shaking = glyph.generate({ seed: 5, age: 0, chaos: 1, type: 'tally' });
        expect(shaking.data).not.toEqual(steady.data);
        // a steady upright stroke is a single column
        const columns = new Set<number>();
        const lone = glyph.generate({
            seed: 5,
            age: 0,
            chaos: 0,
            type: 'tally',
            tally: { count: 1 },
        });
        for (let y = 0; y < lone.height; ++y) {
            for (let x = 0; x < lone.width; ++x) {
                if (alpha(lone, x, y) > 0) {
                    columns.add(x);
                }
            }
        }
        expect(columns.size).toBe(1);
    });

    it('keeps its stroke thickness at any size', () => {
        const thin = ink(glyph.generate({ seed: 6, age: 0, width: 64, height: 64 }));
        const thick = ink(
            glyph.generate({ seed: 6, age: 0, width: 64, height: 64, stroke: { thickness: 3 } }),
        );
        expect(thick).toBeGreaterThan(2 * thin);
        const large = ink(glyph.generate({ seed: 6, age: 0, width: 128, height: 128 }));
        // longer strokes, as thin
        expect(large).toBeGreaterThan(1.6 * thin);
        expect(large).toBeLessThan(2.6 * thin);
    });
});
