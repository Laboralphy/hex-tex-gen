import { describe, expect, it } from 'vitest';
import { slot, slotWear, type SlotParams, type Texture } from '../src';

const defaults = slot.defaults as SlotParams;
const lum = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return ((c >>> 24) + ((c >>> 16) & 0xff) + ((c >>> 8) & 0xff)) / 3;
};

/** a new slot: no rust, no tarnish */
const render = (params: object = {}) => slot.generate({ seed: 1, age: 0, ...params });

describe('slot', () => {
    it('runs a dark gap between two metal strips, from end to end', () => {
        const t = render();
        // 10 pixels wide: strips of 3 on each side, a gap of 4
        for (let y = 0; y < t.height; ++y) {
            for (let x = 3; x < 7; ++x) {
                expect(lum(t, x, y)).toBeLessThan(60);
            }
            expect(lum(t, 0, y)).toBeGreaterThan(80);
            expect(t.getPixel(5, y) & 0xff).toBe(255);
        }
        expect(t.anchors.gap).toEqual([{ x: 3, y: 0 }]);
    });

    it('is lit from the left: the far side of the gap catches the light', () => {
        const t = render({ strips: { rivets: 0, brushed: 0 } });
        // the edges of the strips along the gap: in shadow on the left, lit on the right
        expect(lum(t, 7, 20)).toBeGreaterThan(lum(t, 2, 20));
        expect(lum(t, 6, 20)).toBeGreaterThan(lum(t, 3, 20));
    });

    it('spreads its rivets so that it tiles along its length', () => {
        const rows = (t: Texture) =>
            Array.from({ length: t.height }, (_, y) => y).filter(
                (y) => lum(t, 1, y) > lum(t, 1, (y + 3) % t.height) + 30,
            );
        const t = render({ strips: { brushed: 0 } });
        const found = rows(t);
        // 64 pixels, a rivet about every 8: 8 rivets, every 8 pixels
        expect(found).toHaveLength(8);
        const gaps = found.map((y, i) => (found[(i + 1) % found.length] - y + 64) % 64);
        expect(new Set(gaps)).toEqual(new Set([8]));
    });

    it('is a transposed vertical slot when horizontal', () => {
        const vertical = render();
        const horizontal = render({ direction: 'horizontal', size: [64, 10] });
        expect([horizontal.width, horizontal.height]).toEqual([64, 10]);
        for (let y = 0; y < 10; ++y) {
            for (let x = 0; x < 64; ++x) {
                expect(horizontal.getPixel(x, y)).toBe(vertical.getPixel(y, x));
            }
        }
    });

    it('rusts with age', () => {
        const redness = (t: Texture) => {
            let sum = 0;
            for (let i = 0; i < t.data.length; i += 4) {
                sum += t.data[i] - t.data[i + 2];
            }
            return sum;
        };
        expect(redness(slot.generate({ seed: 2, age: 1 }))).toBeGreaterThan(
            redness(render({})) + 1000,
        );
    });

    it('derives its wear from age, explicit values winning', () => {
        const young = slotWear({ ...defaults, age: 0 });
        expect([young.rust.coverage, young.tarnish]).toEqual([0, 0]);
        expect(slotWear({ ...defaults, age: 1 }).rust.coverage).toBeGreaterThan(0.4);
        expect(slotWear({ ...defaults, age: 1, tarnish: 0 }).tarnish).toBe(0);
    });
});
