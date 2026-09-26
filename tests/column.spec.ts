import { describe, expect, it } from 'vitest';
import { column, columnWear, type ColumnParams, type Texture } from '../src';

const defaults = column.defaults as ColumnParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
const opaque = (t: Texture, x: number, y: number) => alpha(t, x, y) === 255;
const lum = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return ((c >>> 24) + ((c >>> 16) & 0xff) + ((c >>> 8) & 0xff)) / 3;
};

/** a new column, without shadow: marble pixels only */
const render = (params: object = {}) =>
    column.generate({ seed: 1, age: 0, shadow: { offset: 0 }, ...params });

/** opaque pixels across a row */
const span = (t: Texture, y: number) =>
    Array.from({ length: t.width }, (_, x) => x).filter((x) => opaque(t, x, y)).length;

describe('column', () => {
    it('stands a shaft between a wider capital and a wider base', () => {
        const t = render();
        const shaft = span(t, 32);
        expect(shaft).toBeGreaterThan(8);
        expect(span(t, 0)).toBeGreaterThan(shaft);
        expect(span(t, 63)).toBeGreaterThan(shaft);
        expect(alpha(t, 0, 32)).toBe(0);
        expect(alpha(t, 15, 32)).toBe(0);
    });

    it('tapers its shaft towards the top', () => {
        const t = render({ shaft: { taper: 0.4 } });
        expect(span(t, 8)).toBeLessThan(span(t, 56));
    });

    it('is lit from the left, grooved by its flutes', () => {
        const plain = render({ shaft: { flutes: 0 }, marble: { veins: 0 } });
        expect(lum(plain, 5, 32)).toBeGreaterThan(lum(plain, 10, 32));
        const fluted = render({ marble: { veins: 0 } });
        expect(fluted.data).not.toEqual(plain.data);
    });

    it('draws the capital of its order', () => {
        const orders = ['doric', 'ionic', 'tuscan'].map((order) => render({ order }));
        expect(orders[0].data).not.toEqual(orders[1].data);
        expect(orders[1].data).not.toEqual(orders[2].data);
    });

    it('breaks: its capital gone, its shaft ending in a jagged top', () => {
        const t = render({ broken: 1 });
        expect(span(t, 0)).toBe(0);
        expect(span(t, 63)).toBe(span(render(), 63));
    });

    it('chips its edges and gathers grime with age', () => {
        const count = (t: Texture) => t.data.filter((v, i) => i % 4 === 3 && v === 255).length;
        expect(count(render({ chips: 0.5 }))).toBeLessThan(count(render()));
        const mean = (t: Texture) => {
            let sum = 0;
            for (let y = 40; y < 56; ++y) {
                sum += lum(t, 8, y);
            }
            return sum;
        };
        expect(mean(render({ grime: 1 }))).toBeLessThan(mean(render()));
    });

    it('casts a shadow that scales with the column', () => {
        const shadow = Math.round(defaults.shadow.opacity * 255);
        const own = column.generate({ seed: 1, age: 0 });
        const large = column.generate({ seed: 1, age: 0, width: 32, height: 128 });
        const width = (t: Texture, y: number) =>
            Array.from({ length: t.width }, (_, x) => x).filter((x) => alpha(t, x, y) === shadow)
                .length;
        expect(width(own, 32)).toBe(1);
        expect(width(large, 64)).toBe(2);
    });

    it('derives its wear from age, explicit values winning', () => {
        expect(columnWear({ ...defaults, age: 0 })).toEqual({ grime: 0, chips: 0, broken: 0 });
        expect(columnWear({ ...defaults, age: 1 }).broken).toBeGreaterThan(0.3);
        expect(columnWear({ ...defaults, age: 1, broken: 0 }).broken).toBe(0);
    });
});
