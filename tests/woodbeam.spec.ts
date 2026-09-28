import { describe, expect, it } from 'vitest';
import { woodbeam, woodbeamWear, type Texture, type WoodbeamParams } from '../src';

const defaults = woodbeam.defaults as WoodbeamParams;
const lum = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return ((c >>> 24) + ((c >>> 16) & 0xff) + ((c >>> 8) & 0xff)) / 3;
};
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
/** mean luminance of a row of the body */
const row = (t: Texture, y: number) => {
    let sum = 0;
    for (let x = 1; x < 62; ++x) {
        sum += lum(t, x, y);
    }
    return sum / 61;
};

describe('woodbeam', () => {
    it('is the wood of planks', () => {
        expect(woodbeam.category).toBe('architecture');
        expect(woodbeam.overlay).toBe(true);
        expect(defaults.wood.palette.length).toBeGreaterThan(1);
    });

    it('bevels the edges of a squared beam, shades a log across its thickness', () => {
        const squared = woodbeam.generate({ seed: 1, age: 0 });
        // 9 pixels thick: the top edge lit, the bottom one dark
        expect(row(squared, 0)).toBeGreaterThan(row(squared, 4));
        expect(row(squared, 8)).toBeLessThan(row(squared, 4));
        const log = woodbeam.generate({ seed: 1, age: 0, profile: 'log' });
        expect(row(log, 3)).toBeGreaterThan(row(log, 7));
        expect(row(log, 8)).toBeLessThan(row(squared, 8));
    });

    it('casts a shadow to the bottom-right', () => {
        const t = woodbeam.generate({ seed: 1 });
        expect(alpha(t, 63, 4)).toBe(Math.round(0.45 * 255));
        expect(alpha(t, 0, 9)).toBe(0);
        expect(alpha(t, 10, 4)).toBe(255);
        expect(t.anchors.center).toEqual([{ x: 31, y: 4 }]);
    });

    it('is a transposed horizontal beam when vertical', () => {
        const horizontal = woodbeam.generate({ seed: 1, age: 0 });
        const vertical = woodbeam.generate({
            seed: 1,
            age: 0,
            direction: 'vertical',
            size: [10, 64],
        });
        expect([vertical.width, vertical.height]).toEqual([10, 64]);
        for (let y = 0; y < 64; ++y) {
            for (let x = 0; x < 10; ++x) {
                expect(vertical.getPixel(x, y)).toBe(horizontal.getPixel(y, x));
            }
        }
    });

    it('weathers and splits with age, like planks', () => {
        expect(woodbeamWear({ ...defaults, age: 0 }).splits.ratio).toBe(0);
        expect(woodbeamWear({ ...defaults, age: 1 }).weathering).toBeGreaterThan(0.5);
        expect(woodbeamWear({ ...defaults, age: 1, weathering: 0 }).weathering).toBe(0);
        expect(woodbeam.generate({ seed: 1, age: 0 }).data).not.toEqual(
            woodbeam.generate({ seed: 1, age: 1 }).data,
        );
    });
});
