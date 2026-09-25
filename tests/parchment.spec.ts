import { describe, expect, it } from 'vitest';
import { parchment, parchmentWear, type ParchmentParams, type Texture } from '../src';

const defaults = parchment.defaults as ParchmentParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
const lum = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return ((c >>> 24) + ((c >>> 16) & 0xff) + ((c >>> 8) & 0xff)) / 3;
};
const clean = { age: 0, edges: { roughness: 0 }, pins: { enabled: false } };

describe('parchment', () => {
    it('is a sheet with a shadow to the bottom-right, transparent elsewhere', () => {
        const t = parchment.generate({ seed: 1, ...clean, shadow: { offset: 2, opacity: 0.5 } });
        // the sheet covers 30 x 38 pixels of the 32 x 40 patch
        expect(alpha(t, 15, 20)).toBe(255);
        expect(alpha(t, 31, 20)).toBe(128);
        expect(t.getPixel(31, 20) >>> 8).toBe(0);
        expect(alpha(t, 31, 1)).toBe(0);
        expect(alpha(t, 1, 39)).toBe(0);
    });

    it('has no shadow with an offset of 0', () => {
        const t = parchment.generate({ seed: 1, ...clean, shadow: { offset: 0 } });
        expect(alpha(t, 31, 39)).toBe(255);
    });

    it('darkens its edges as it ages', () => {
        const old = parchment.generate({ seed: 1, age: 1, edges: { roughness: 0 } });
        expect(lum(old, 0, 20)).toBeLessThan(lum(old, 15, 20) * 0.75);
        const blank = parchment.generate({ seed: 1, ...clean });
        expect(lum(blank, 0, 20)).toBeGreaterThan(lum(blank, 15, 20) * 0.8);
    });

    it('draws fold lines, dark with a lit side', () => {
        const plain = parchment.generate({ seed: 1, ...clean, shadow: { offset: 0 } });
        const folded = parchment.generate({
            seed: 1,
            ...clean,
            shadow: { offset: 0 },
            folds: { x: 1 },
        });
        // one vertical fold, in the middle of the 32-pixel sheet
        expect(lum(folded, 16, 20)).toBeLessThan(lum(plain, 16, 20));
        expect(lum(folded, 17, 20)).toBeGreaterThan(lum(plain, 17, 20));
    });

    it('pins its top corners', () => {
        const t = parchment.generate({
            seed: 1,
            ...clean,
            pins: { enabled: true, color: '#ff0000' },
        });
        expect(t.getPixel(2, 2)).toBe(0xff0000ff);
    });

    it('reports its anchors', () => {
        const t = parchment.generate({ seed: 1, margin: 5 });
        expect(t.anchors.sheet).toEqual([{ x: 5, y: 5 }]);
        expect(t.anchors.sheetCenter).toEqual([{ x: 15, y: 19 }]);
    });

    it('ages: derived values, explicit values winning', () => {
        const blank = parchmentWear({ ...defaults, age: 0 });
        expect(blank.yellowing).toBe(0);
        expect(blank.foxing.density).toBe(0);
        const old = parchmentWear({ ...defaults, age: 1, yellowing: 0.1 });
        expect(old.yellowing).toBe(0.1);
        expect(old.foxing.density).toBe(6);
    });
});
