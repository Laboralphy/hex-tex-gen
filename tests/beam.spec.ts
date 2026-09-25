import { describe, expect, it } from 'vitest';
import { beam, beamWear, type BeamParams, type Texture } from '../src';

const defaults = beam.defaults as BeamParams;
const lum = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return ((c >>> 24) + ((c >>> 16) & 0xff) + ((c >>> 8) & 0xff)) / 3;
};
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;

describe('beam', () => {
    it('draws a girder: lit flanges, a recessed web in their shadow', () => {
        const t = beam.generate({ seed: 1, age: 0, rivets: { enabled: false } });
        // 8 pixels thick: the flanges on rows 0-1 and 6-7, the web between them
        expect(lum(t, 20, 0)).toBeGreaterThan(lum(t, 20, 2));
        expect(lum(t, 20, 2)).toBeLessThan(lum(t, 20, 5));
        expect(lum(t, 20, 1)).toBeGreaterThan(lum(t, 20, 4));
    });

    it('rivets each flange of a girder, the middle of a strap', () => {
        const girder = beam.generate({ seed: 1, age: 0 });
        const plain = beam.generate({ seed: 1, age: 0, rivets: { enabled: false } });
        // the first rivets: 3 pixels in, on the top and bottom flanges
        expect(lum(girder, 3, 0)).toBeGreaterThan(lum(plain, 3, 0));
        expect(lum(girder, 3, 6)).toBeGreaterThan(lum(plain, 3, 6));
        const strap = beam.generate({ seed: 1, age: 0, profile: 'flat' });
        const plainStrap = beam.generate({
            seed: 1,
            age: 0,
            profile: 'flat',
            rivets: { enabled: false },
        });
        expect(lum(strap, 3, 3)).toBeGreaterThan(lum(plainStrap, 3, 3));
        expect(lum(strap, 3, 0)).toBe(lum(plainStrap, 3, 0));
    });

    it('casts a shadow to the bottom-right', () => {
        const t = beam.generate({ seed: 1 });
        expect(alpha(t, 63, 4)).toBe(Math.round(0.45 * 255));
        expect(alpha(t, 0, 8)).toBe(0);
        expect(alpha(t, 10, 4)).toBe(255);
    });

    it('is a transposed horizontal beam when vertical', () => {
        const horizontal = beam.generate({ seed: 1, age: 0 });
        const vertical = beam.generate({
            seed: 1,
            age: 0,
            direction: 'vertical',
            size: [9, 64],
        });
        expect([vertical.width, vertical.height]).toEqual([9, 64]);
        for (let y = 0; y < 64; ++y) {
            for (let x = 0; x < 9; ++x) {
                expect(vertical.getPixel(x, y)).toBe(horizontal.getPixel(y, x));
            }
        }
    });

    it('rusts with age, streaks running down whatever its direction', () => {
        const rusty = (t: Texture) => {
            let n = 0;
            for (let i = 0; i < t.data.length; i += 4) {
                n += t.data[i + 3] === 255 && t.data[i] > t.data[i + 2] + 40 ? 1 : 0;
            }
            return n;
        };
        expect(rusty(beam.generate({ seed: 1, age: 0 }))).toBe(0);
        const streaked = beam.generate({
            seed: 1,
            direction: 'vertical',
            size: [9, 64],
            rust: { coverage: 0, streaks: 1, length: [4, 4] },
            tarnish: 0,
        });
        expect(rusty(streaked)).toBeGreaterThan(20);
    });

    it('ages: derived values, explicit values winning', () => {
        expect(beamWear({ ...defaults, age: 0 })).toEqual({
            rust: { coverage: 0, streaks: 0, length: [2, 4] },
            scratches: 0,
            tarnish: 0,
        });
        expect(beamWear({ ...defaults, age: 1, tarnish: 0.05 }).tarnish).toBe(0.05);
    });
});
