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

    it('rejects invalid sizes', () => {
        expect(() => new Texture(0, 4)).toThrow(RangeError);
    });
});
