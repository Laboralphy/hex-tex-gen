import { describe, expect, it } from 'vitest';
import { entablature, entablatureWear, type EntablatureParams, type Texture } from '../src';

const defaults = entablature.defaults as EntablatureParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;

/** flat grey marble without shadow: only the carving varies */
const flat = { marble: { palette: ['#808080', '#808080'], veins: 0 }, shadow: { offset: 0 } };
const render = (params: object = {}) =>
    entablature.generate({ seed: 1, age: 0, ...flat, ...params });

/** pixels of the frieze darker than its face: its grooves */
function grooves(t: Texture): number {
    let n = 0;
    for (let y = 6; y < 12; ++y) {
        for (let x = 0; x < t.width; ++x) {
            n += t.getPixel(x, y) >>> 24 < 0x60 ? 1 : 0;
        }
    }
    return n;
}

describe('entablature', () => {
    it('is a solid band across the whole width', () => {
        const t = render();
        for (let y = 0; y < t.height; ++y) {
            for (let x = 0; x < t.width; ++x) {
                expect(alpha(t, x, y)).toBe(255);
            }
        }
    });

    it('repeats its motifs across the width, so that it tiles', () => {
        for (const pattern of ['meander', 'triglyph']) {
            // 64 pixels, motifs of 8: the frieze, rows 5 to 11, repeats every 8 pixels,
            // across the right edge too
            const t = render({ frieze: { pattern, period: 8 } });
            for (let y = 5; y < 12; ++y) {
                for (let x = 0; x < t.width; ++x) {
                    expect(t.getPixel((x + 8) % t.width, y)).toBe(t.getPixel(x, y));
                }
            }
        }
    });

    it('carves its frieze with the chosen pattern', () => {
        const plain = grooves(render({ frieze: { pattern: 'plain' } }));
        const meander = grooves(render({ frieze: { pattern: 'meander' } }));
        const triglyph = grooves(render({ frieze: { pattern: 'triglyph' } }));
        expect(meander).toBeGreaterThan(plain + 20);
        expect(triglyph).toBeGreaterThan(plain);
        expect(render({ frieze: { pattern: 'meander' } }).data).not.toEqual(
            render({ frieze: { pattern: 'triglyph' } }).data,
        );
    });

    it('sets dentils under its cornice', () => {
        expect(render({ dentils: false }).data).not.toEqual(render().data);
    });

    it('breaks a chunk from its bottom edge, and chips its edges', () => {
        const count = (t: Texture) => t.data.filter((v, i) => i % 4 === 3 && v === 255).length;
        const whole = count(render());
        expect(count(render({ broken: 1 }))).toBeLessThan(whole - 20);
        expect(count(render({ chips: 0.5 }))).toBeLessThan(whole);
        // the top edge is intact where it is not chipped
        const broken = render({ broken: 1 });
        expect(alpha(broken, 0, 0) + alpha(broken, 32, 0)).toBe(510);
    });

    it('casts a shadow on the wall below, in its last rows, scaling with the band', () => {
        const shadow = Math.round(defaults.shadow.opacity * 255);
        const rows = (t: Texture) =>
            Array.from({ length: t.height }, (_, y) => y).filter((y) => alpha(t, 20, y) === shadow);
        expect(rows(entablature.generate({ seed: 1, age: 0 }))).toEqual([15]);
        const large = entablature.generate({ seed: 1, age: 0, width: 128, height: 32 });
        expect(rows(large)).toEqual([30, 31]);
    });

    it('derives its wear from age, explicit values winning', () => {
        expect(entablatureWear({ ...defaults, age: 0 })).toEqual({
            grime: 0,
            chips: 0,
            broken: 0,
        });
        expect(entablatureWear({ ...defaults, age: 1 }).broken).toBeGreaterThan(0.4);
        expect(entablatureWear({ ...defaults, age: 1, broken: 0 }).broken).toBe(0);
    });
});
