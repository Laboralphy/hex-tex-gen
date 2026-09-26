import { describe, expect, it } from 'vitest';
import { shield, shieldWear, type ShieldParams, type Texture } from '../src';

const defaults = shield.defaults as ShieldParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
const rgb = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return [c >>> 24, (c >>> 16) & 0xff, (c >>> 8) & 0xff];
};
const redder = (t: Texture, x: number, y: number) => {
    const [r, , b] = rgb(t, x, y);
    return r > b + 40;
};
const bluer = (t: Texture, x: number, y: number) => {
    const [r, , b] = rgb(t, x, y);
    return b > r + 40;
};

/** a new shield, no shadow, no dent */
const render = (params: object = {}) =>
    shield.generate({ seed: 1, age: 0, shadow: { offset: 0 }, ...params });

/** opaque pixels across a row */
const span = (t: Texture, y: number) =>
    Array.from({ length: t.width }, (_, x) => x).filter((x) => alpha(t, x, y) === 255).length;

describe('shield', () => {
    it('draws a heater: a flat top, sides curving to a point', () => {
        const t = render();
        expect(span(t, 1)).toBe(24);
        expect(span(t, 24)).toBeLessThan(20);
        expect(span(t, 31)).toBeLessThanOrEqual(4);
    });

    it('keeps a round shield a disc, whatever its box', () => {
        const t = render({ shape: 'round' });
        // a 24 x 24 disc in the middle of the 24 x 32 box
        expect(span(t, 3)).toBe(0);
        expect(span(t, 16)).toBe(24);
        expect(alpha(t, 0, 4)).toBe(0);
    });

    it('rims the shield with metal', () => {
        const t = render({ charge: { ordinary: 'none' } });
        const [r, g, b] = rgb(t, 0, 5);
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(30);
        expect(redder(t, 5, 5)).toBe(true);
    });

    it('divides its field between its tinctures', () => {
        const plain = { charge: { ordinary: 'none' } };
        const pale = render({ ...plain, field: { division: 'pale' } });
        expect(redder(pale, 5, 12)).toBe(true);
        expect(bluer(pale, 18, 12)).toBe(true);
        const fess = render({ ...plain, field: { division: 'fess' } });
        expect(redder(fess, 12, 5)).toBe(true);
        expect(bluer(fess, 12, 20)).toBe(true);
    });

    it('paints its ordinary over the field', () => {
        const [r, g, b] = rgb(render(), 12, 13);
        expect(r).toBeGreaterThan(b + 60);
        expect(g).toBeGreaterThan(b + 40);
        expect(redder(render({ charge: { ordinary: 'none' } }), 12, 13)).toBe(true);
        expect(render({ charge: { ordinary: 'saltire' } }).data).not.toEqual(render().data);
    });

    it('bosses its middle with metal', () => {
        const [r, g, b] = rgb(render({ boss: true, charge: { ordinary: 'none' } }), 12, 13);
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(30);
    });

    it('hangs over two crossed swords', () => {
        const plain = render();
        const trophy = render({ swords: true });
        // the points of the blades rise above the corners of the smaller shield
        const top = (t: Texture) => span(t, 3);
        expect(top(trophy)).toBeGreaterThan(0);
        expect(top(trophy)).toBeLessThan(top(plain));
        expect(span(trophy, 29)).toBeGreaterThan(0);
    });

    it('fades and flakes with age', () => {
        const saturation = (t: Texture) => {
            let sum = 0;
            for (let y = 4; y < 24; ++y) {
                const [r, g, b] = rgb(t, 5, y);
                sum += Math.max(r, g, b) - Math.min(r, g, b);
            }
            return sum;
        };
        expect(saturation(render({ fading: 1 }))).toBeLessThan(saturation(render()) * 0.7);
        expect(render({ flaking: 0.8 }).data).not.toEqual(render().data);
    });

    it('casts a shadow that scales with the shield', () => {
        const shadow = Math.round(defaults.shadow.opacity * 255);
        const own = shield.generate({ seed: 1, age: 0 });
        expect(alpha(own, 23, 15)).toBe(shadow);
        const large = shield.generate({ seed: 1, age: 0, width: 48, height: 64 });
        expect(alpha(large, 46, 30)).toBe(shadow);
        expect(alpha(large, 47, 30)).toBe(shadow);
    });

    it('derives its wear from age, explicit values winning', () => {
        const young = shieldWear({ ...defaults, age: 0 });
        expect([young.fading, young.flaking, young.dents.density]).toEqual([0, 0, 0]);
        expect(shieldWear({ ...defaults, age: 1 }).flaking).toBeGreaterThan(0.4);
        expect(shieldWear({ ...defaults, age: 1, fading: 0 }).fading).toBe(0);
    });
});
