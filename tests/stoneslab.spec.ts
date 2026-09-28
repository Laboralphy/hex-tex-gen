import { describe, expect, it } from 'vitest';
import { ashlar, createMemoryLoader, renderTexture, stoneslab } from '../src';

// flat colors: black mortar, the slab a single light color
const flat = {
    age: 0,
    mortar: { size: 2, color: '#000', noise: 0 },
    edges: { roughness: 0 },
    stone: { palette: ['#aaa', '#aaa'], shadeVariation: 0, grain: 0 },
};
const MORTAR = 0x000000ff;

describe('stoneslab', () => {
    it('has the stone parameters of ashlar, without rows or blocks', () => {
        const keys = Object.keys(ashlar.defaults).filter((k) => !['rows', 'blocks'].includes(k));
        expect(Object.keys(stoneslab.defaults)).toEqual(keys);
        expect(stoneslab.category).toBe('architecture');
    });

    it('is a single stone in a bed of mortar, as wide on every side', () => {
        const t = stoneslab.generate({ seed: 1, ...flat });
        const [w, h] = stoneslab.defaults.size;
        for (const [x, y] of [
            [1, 12],
            [w - 2, 12],
            [16, 1],
            [16, h - 2],
        ]) {
            expect(t.getPixel(x, y)).toBe(MORTAR);
        }
        // no joint crosses the face
        for (let x = 2; x < w - 2; ++x) {
            expect(t.getPixel(x, 12)).not.toBe(MORTAR);
        }
        for (let y = 2; y < h - 2; ++y) {
            expect(t.getPixel(16, y)).not.toBe(MORTAR);
        }
    });

    it('reports the face of the slab and its center, at the rendered size', () => {
        const t = stoneslab.generate({ seed: 1, width: 64, height: 48 });
        expect(t.anchors.slab).toEqual([{ x: 2, y: 2 }]);
        expect(t.anchors.slabCenter).toEqual([{ x: 32, y: 24 }]);
    });

    it('ages like the stones of ashlar', () => {
        expect(stoneslab.generate({ seed: 1, age: 0 }).data).not.toEqual(
            stoneslab.generate({ seed: 1, age: 1 }).data,
        );
    });

    it('covers the wall it is laid over', () => {
        const wall = { template: 'planks' };
        const slab = { template: 'stoneslab', ...flat };
        const t = renderTexture(
            {
                size: [64, 64],
                patches: [
                    { patch: wall, width: 100, height: 100 },
                    { patch: slab, x: 25, y: 25, width: 50, height: 37.5 },
                ],
            },
            createMemoryLoader({}),
        );
        expect(t.getPixel(16, 16)).toBe(MORTAR);
        expect(t.getPixel(32, 28)).toBe(0xaaaaaaff);
    });
});
