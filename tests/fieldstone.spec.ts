import { Voronoi } from '@laboralphy/algorithms';
import { describe, expect, it } from 'vitest';
import {
    ashlar,
    ashlarWear,
    fieldstone,
    fieldstoneWear,
    type AshlarParams,
    type FieldstoneParams,
} from '../src';

const defaults = fieldstone.defaults as FieldstoneParams;
const MORTAR = 0x000000ff;
// flat colors, no warp nor wear: black mortar, stones a single light color
const flat = {
    age: 0,
    mortar: { size: 2, color: '#000', noise: 0 },
    edges: { roughness: 0 },
    bevel: { size: 0 },
    stone: { palette: ['#aaa', '#aaa'], shadeVariation: 0, grain: 0 },
};

describe('fieldstone', () => {
    it('lays its mortar exactly on the borders of the Voronoi cells', () => {
        for (const seed of [1, 2, 3]) {
            const t = fieldstone.generate({ seed, ...flat, stones: { cells: [5, 4] } });
            const voronoi = new Voronoi({ seed, size: [64, 64], cells: [5, 4], jitter: 0.85 });
            for (let y = 0; y < 64; ++y) {
                for (let x = 0; x < 64; ++x) {
                    const border = voronoi.sample(x + 0.5, y + 0.5).border;
                    expect(t.getPixel(x, y) === MORTAR).toBe(border < 1);
                }
            }
        }
    });

    it('reports its stones and their centers', () => {
        const t = fieldstone.generate({ seed: 1, stones: { cells: [5, 4] } });
        expect(t.anchors.stones).toHaveLength(20);
        expect(t.anchors.centers).toHaveLength(20);
        expect(t.anchors.panel).toEqual([]);
        expect(t.anchors.tops).toHaveLength(20);
        // a center is on its stone, not in the mortar
        const flatT = fieldstone.generate({ seed: 1, ...flat, stones: { cells: [5, 4] } });
        for (const { x, y } of flatT.anchors.centers) {
            expect(flatT.getPixel(x, y)).not.toBe(MORTAR);
        }
    });

    it('reports the top edge of each stone, just below the mortar', () => {
        const t = fieldstone.generate({ seed: 1, ...flat, stones: { cells: [5, 4] } });
        for (const { x, y } of t.anchors.tops) {
            expect(t.getPixel(x, y)).not.toBe(MORTAR);
            expect(t.getPixel(x, y - 1)).toBe(MORTAR);
        }
    });

    it('lays hexagons with a stagger and no jitter', () => {
        const t = fieldstone.generate({
            seed: 1,
            ...flat,
            stones: { cells: [4, 4], jitter: 0, stagger: 0.5 },
        });
        // odd rows are shifted by half a stone: 8 pixels
        expect(t.anchors.centers[0]).toEqual({ x: 8, y: 8 });
        expect(t.anchors.centers[4]).toEqual({ x: 16, y: 24 });
        expect(() =>
            fieldstone.generate({ seed: 1, stones: { cells: [4, 3], stagger: 0.5 } }),
        ).toThrow('stones.cells: a stagger needs an even number of rows');
    });

    it('has a panel, like the other walls', () => {
        const t = fieldstone.generate({ seed: 1, panel: { enabled: true } });
        expect(t.anchors.panel).toHaveLength(1);
        expect(() => fieldstone.generate({ seed: 1, panel: { enabled: true, width: 80 } })).toThrow(
            'panel.width: the panel must fit in the width of the patch',
        );
    });

    it('ages like ashlar, without chips', () => {
        const wear = fieldstoneWear({ ...defaults, age: 1 });
        expect(wear.chips.ratio).toBe(0);
        expect(wear.erosion.corners).toBe(0);
        // stones 16 pixels high, like ashlar ones: the same derived values
        const stone = ashlarWear({ ...(ashlar.defaults as AshlarParams), age: 1 });
        expect(wear.erosion.edges).toBe(stone.erosion.edges);
        expect(wear.spalling).toEqual(stone.spalling);
        expect(fieldstone.generate({ seed: 1, age: 0 }).data).not.toEqual(
            fieldstone.generate({ seed: 1, age: 1 }).data,
        );
    });

    it('rejects parameters of rectangular walls', () => {
        expect(() => fieldstone.generate({ seed: 1, rows: { count: 2 } } as never)).toThrow(
            'unknown parameter "rows"',
        );
        expect(() => fieldstone.generate({ seed: 1, chips: { ratio: 1 } } as never)).toThrow(
            'unknown parameter "chips"',
        );
    });
});
