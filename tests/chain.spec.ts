import { describe, expect, it } from 'vitest';
import { chain, chainWear, type ChainParams, type Texture } from '../src';

const defaults = chain.defaults as ChainParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
const opaque = (t: Texture, x: number, y: number) => alpha(t, x, y) === 255;

/** a new chain, without shadow: metal pixels only */
const render = (params: object = {}, seed = 1) =>
    chain.generate({ seed, age: 0, shadow: { offset: 0 }, ...params });

/** widest span of metal across a row, below the wall plate */
function widest(t: Texture): number {
    let max = 0;
    for (let y = defaults.fixture.size; y < t.height; ++y) {
        const xs = Array.from({ length: t.width }, (_, x) => x).filter((x) => opaque(t, x, y));
        max = xs.length ? Math.max(max, xs[xs.length - 1] - xs[0] + 1) : max;
    }
    return max;
}

describe('chain', () => {
    it('hangs from a wall plate at the top, centered', () => {
        const t = render();
        // 12 pixels wide: the plate covers columns 4 to 8, rows 0 to 4
        for (let y = 0; y < 5; ++y) {
            for (let x = 4; x < 9; ++x) {
                expect(opaque(t, x, y)).toBe(true);
            }
        }
        expect(t.anchors.fixture).toEqual([{ x: 6, y: 2 }]);
        for (let y = 0; y < t.height; ++y) {
            expect(alpha(t, 0, y)).toBe(0);
            expect(alpha(t, 11, y)).toBe(0);
        }
    });

    it('alternates links face on, open in their middle, and edge on', () => {
        const t = render({ length: [1, 1], cuff: 0 });
        const [{ y: end }] = t.anchors.end;
        const column = Array.from({ length: end - 8 }, (_, i) => opaque(t, 6, 8 + i));
        expect(column).toContain(true);
        expect(column).toContain(false);
        expect(widest(t)).toBe(3);
    });

    it('drops to a random length within its range', () => {
        const ends = [1, 2, 3, 4, 5, 6].map(
            (seed) => render({ cuff: 0, broken: 0 }, seed).anchors.end[0].y,
        );
        expect(new Set(ends).size).toBeGreaterThan(2);
        // below the eye ring, from row 6, 42 pixels of room: from 40% to all of it
        for (const y of ends) {
            expect(y).toBeGreaterThanOrEqual(6 + 0.4 * 42 - 5);
            expect(y).toBeLessThanOrEqual(48);
        }
        const full = render({ length: [1, 1], cuff: 0 }).anchors.end[0].y;
        expect(full).toBeGreaterThanOrEqual(44);
    });

    it('ends with a manacle, by chance', () => {
        const cuffed = render({ cuff: 1, length: [0.8, 0.8] });
        // a manacle twice as wide as a link, and one more pixel
        expect(widest(cuffed)).toBe(7);
        expect(widest(render({ cuff: 0, length: [0.8, 0.8] }))).toBe(3);
    });

    it('snaps: shorter, open at its end, without its manacle', () => {
        const whole = render({ cuff: 1, length: [1, 1] });
        const snapped = render({ cuff: 1, length: [1, 1], broken: 1 });
        expect(snapped.anchors.end[0].y).toBeLessThan(whole.anchors.end[0].y);
        expect(widest(snapped)).toBe(3);
    });

    it('casts a shadow on the wall by default', () => {
        const t = chain.generate({ seed: 1, age: 0 });
        const shadow = Math.round(defaults.shadow.opacity * 255);
        expect(t.data.some((v, i) => i % 4 === 3 && v === shadow)).toBe(true);
        expect(render().data.some((v, i) => i % 4 === 3 && v === shadow)).toBe(false);
    });

    it('scales its shadow with the chain: about 2% of its height', () => {
        const shadow = Math.round(defaults.shadow.opacity * 255);
        // the plate's right edge is column 8: its shadow falls 1 pixel right at own
        // size, 2 pixels right on a chain twice as tall
        const own = chain.generate({ seed: 1, age: 0 });
        expect(alpha(own, 9, 2)).toBe(shadow);
        expect(alpha(own, 10, 2)).toBe(0);
        const large = chain.generate({ seed: 1, age: 0, width: 24, height: 96 });
        // twice as wide, centered on column 12: the plate still spans 5 pixels, 10 to 14
        expect(alpha(large, 15, 3)).toBe(shadow);
        expect(alpha(large, 16, 3)).toBe(shadow);
        expect(alpha(large, 17, 3)).toBe(0);
    });

    it('rusts with age', () => {
        const redness = (t: Texture) => {
            let sum = 0;
            for (let i = 0; i < t.data.length; i += 4) {
                sum += t.data[i + 3] === 255 ? t.data[i] - t.data[i + 2] : 0;
            }
            return sum;
        };
        const whole = { length: [1, 1], broken: 0 };
        expect(redness(render({ ...whole, age: 1 }, 4))).toBeGreaterThan(
            redness(render({ ...whole, age: 0 }, 4)) + 500,
        );
    });

    it('derives its wear from age, explicit values winning', () => {
        const young = chainWear({ ...defaults, age: 0 });
        expect([young.rust.coverage, young.tarnish, young.broken]).toEqual([0, 0, 0]);
        expect(chainWear({ ...defaults, age: 1 }).broken).toBeGreaterThan(0.3);
        expect(chainWear({ ...defaults, age: 1, rust: 0 }).rust.coverage).toBe(0);
    });
});
