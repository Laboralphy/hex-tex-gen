import { describe, expect, it } from 'vitest';
import { ashlar, bricks, fieldstone, type Texture } from '../src';

const MORTAR = 0x000000ff;
// flat colors: black mortar, grey stones, no warp nor wear
const flat = {
    age: 0,
    mortar: { size: 2, color: '#000', noise: 0 },
    edges: { roughness: 0 },
    bevel: { size: 0 },
    stone: { palette: ['#aaa', '#aaa'], shadeVariation: 0, grain: 0 },
};
const isGreen = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    const [r, g, b] = [c >>> 24, (c >>> 16) & 0xff, (c >>> 8) & 0xff];
    return g > r + 10 && g > b + 10;
};
const greens = (t: Texture) => {
    const found: [number, number][] = [];
    for (let y = 0; y < t.height; ++y) {
        for (let x = 0; x < t.width; ++x) {
            if (isGreen(t, x, y)) {
                found.push([x, y]);
            }
        }
    }
    return found;
};

describe('moss on stone walls', () => {
    it('grows no moss by default', () => {
        for (const g of [ashlar, bricks, fieldstone]) {
            expect(greens(g.generate({ seed: 1, age: 1 }))).toEqual([]);
        }
    });

    it('grows along the top edges of the stones, following their shape', () => {
        for (const seed of [1, 2, 3]) {
            const t = fieldstone.generate({
                seed,
                ...flat,
                moss: { coverage: 0.7, depth: 2, vines: 0, joints: 0 },
            });
            const found = greens(t);
            expect(found.length).toBeGreaterThan(20);
            // every moss pixel hugs the top edge of its stone: mortar a few pixels above
            for (const [x, y] of found) {
                const above = [1, 2, 3, 4].some((k) => t.getPixel(x, y - k) === MORTAR);
                expect(above).toBe(true);
            }
        }
    });

    it('hangs vines down the stone faces', () => {
        const withoutVines = greens(
            fieldstone.generate({ seed: 1, ...flat, moss: { coverage: 0.7, vines: 0, joints: 0 } }),
        );
        const withVines = greens(
            fieldstone.generate({
                seed: 1,
                ...flat,
                moss: { coverage: 0.7, vines: 1, length: [4, 4], joints: 0 },
            }),
        );
        expect(withVines.length).toBeGreaterThan(withoutVines.length);
    });

    it('grows on every stone wall', () => {
        expect(
            greens(bricks.generate({ seed: 1, moss: { coverage: 0.6 } })).length,
        ).toBeGreaterThan(20);
        expect(
            greens(ashlar.generate({ seed: 1, moss: { coverage: 0.6 } })).length,
        ).toBeGreaterThan(20);
    });

    it('validates its parameters', () => {
        expect(() => fieldstone.generate({ seed: 1, moss: { coverage: 2 } })).toThrow(
            'moss.coverage: Too big: expected number to be <=1',
        );
    });
});
