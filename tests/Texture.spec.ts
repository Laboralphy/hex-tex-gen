import { describe, expect, it } from 'vitest';
import { Texture } from '../src';

describe('Texture', () => {
    it('stores pixels as packed RGBA', () => {
        const t = new Texture(4, 4);
        t.setPixel(1, 2, 0x11223344);
        expect(t.getPixel(1, 2)).toBe(0x11223344);
        expect(Array.from(t.data.slice((2 * 4 + 1) * 4, (2 * 4 + 1) * 4 + 4))).toEqual([
            0x11, 0x22, 0x33, 0x44,
        ]);
    });

    it('wraps coordinates like a tile', () => {
        const t = new Texture(4, 4);
        t.setPixel(-1, -1, 0xff0000ff);
        expect(t.getPixel(3, 3)).toBe(0xff0000ff);
    });

    it('mirrors pixels, the cut mask and anchors, corners included', () => {
        const t = new Texture(4, 2);
        t.setPixel(0, 0, 0xff0000ff);
        t.cut = new Uint8Array(8);
        t.cut[1] = 1;
        t.anchors = {
            corners: [
                { x: 0, y: 0, corner: 'top-left' },
                { x: 3, y: 1 },
            ],
        };
        const m = t.mirrored(true, true);
        expect(m.getPixel(3, 1)).toBe(0xff0000ff);
        expect(m.getPixel(0, 0)).toBe(0);
        expect(m.cut![1 * 4 + 2]).toBe(1);
        expect(m.anchors.corners).toEqual([
            { x: 3, y: 1, corner: 'bottom-right' },
            { x: 0, y: 0 },
        ]);
        expect(t.mirrored(true, false).anchors.corners[0].corner).toBe('top-right');
        expect(t.transposed().anchors.corners[0].corner).toBe('top-left');
        const tr = new Texture(4, 2);
        tr.anchors = { c: [{ x: 3, y: 0, corner: 'top-right' }] };
        expect(tr.transposed().anchors.c).toEqual([{ x: 0, y: 3, corner: 'bottom-left' }]);
    });

    it('rejects invalid sizes', () => {
        expect(() => new Texture(0, 4)).toThrow(RangeError);
    });
});
