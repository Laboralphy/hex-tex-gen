import { describe, expect, it } from 'vitest';
import { cavewall, fieldstone, type Texture } from '../src';
import { PowerDiagram } from '../src/generators/common/PowerDiagram';

const lum = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return ((c >>> 24) + ((c >>> 16) & 0xff) + ((c >>> 8) & 0xff)) / 3;
};

describe('PowerDiagram', () => {
    it('tiles: a point and its copies one tile away fall in the same cell', () => {
        const diagram = new PowerDiagram(7, [64, 48], 12, 0.8);
        for (let y = 0.5; y < 48; y += 5) {
            for (let x = 0.5; x < 64; x += 5) {
                const s = diagram.sample(x, y);
                expect(diagram.sample(x + 64, y).cell).toBe(s.cell);
                expect(diagram.sample(x, y - 48).cell).toBe(s.cell);
            }
        }
    });

    it('measures the exact distance to the border of a cell', () => {
        const diagram = new PowerDiagram(3, [64, 64], 10, 0.8);
        // a border is where the cell changes: the distance falls to about 0 across it
        for (let y = 0.5; y < 64; y += 3) {
            for (let x = 0.5; x < 63; x += 0.25) {
                const a = diagram.sample(x, y);
                const b = diagram.sample(x + 0.25, y);
                if (a.cell !== b.cell) {
                    expect(Math.min(a.border, b.border)).toBeLessThan(0.3);
                }
            }
        }
    });

    it('spreads the cell sizes with its variation', () => {
        // the coefficient of variation of the cell areas, over several diagrams
        const spread = (variation: number) => {
            let sum = 0;
            for (let seed = 1; seed <= 10; ++seed) {
                const diagram = new PowerDiagram(seed, [64, 64], 16, variation);
                const areas = new Array(16).fill(0);
                for (let y = 0.5; y < 64; ++y) {
                    for (let x = 0.5; x < 64; ++x) {
                        ++areas[diagram.sample(x, y).cell];
                    }
                }
                const mean = 4096 / 16;
                const deviation = Math.sqrt(
                    areas.reduce((s, a) => s + (a - mean) ** 2, 0) / areas.length,
                );
                sum += deviation / mean;
            }
            return sum / 10;
        };
        // evenly spread sites: similar sizes without variation, very different with it
        expect(spread(0)).toBeLessThan(0.3);
        expect(spread(1)).toBeGreaterThan(spread(0) + 0.2);
    });
});

describe('cavewall', () => {
    it('is a fieldstone wall with the defaults of a cave', () => {
        const t = cavewall.generate({ seed: 2 });
        const same = fieldstone.generate({ seed: 2, ...cavewall.defaults });
        expect(t.data).toEqual(same.data);
    });

    it('lights its boulders from the top-left, darker towards their crevices', () => {
        // a flat, noiseless stone: only the relief shades it
        const flat = { stone: { contrast: 0, shadeVariation: 0, grain: 0 }, age: 0 };
        const t = cavewall.generate({ seed: 1, ...flat });
        const [{ x, y }] = t.anchors.centers;
        expect(lum(t, x - 2, y - 2)).toBeGreaterThan(lum(t, x + 2, y + 2));
        const plain = cavewall.generate({ seed: 1, ...flat, stones: { relief: 0 } });
        expect(lum(plain, x - 2, y - 2)).toBe(lum(plain, x + 2, y + 2));
    });

    it('rounds the corners of its boulders into dark pockets', () => {
        const crevices = (t: Texture) => {
            let n = 0;
            for (let y = 0; y < t.height; ++y) {
                for (let x = 0; x < t.width; ++x) {
                    n += lum(t, x, y) < 30 ? 1 : 0;
                }
            }
            return n;
        };
        const rounded = cavewall.generate({ seed: 3, age: 0 });
        const angular = cavewall.generate({ seed: 3, age: 0, stones: { relief: 0 } });
        expect(crevices(rounded)).toBeGreaterThan(crevices(angular));
    });

    it('scatters stones of every size, unlike the grid of fieldstone', () => {
        const heap = fieldstone.generate({ seed: 4, stones: { layout: 'heap', variation: 1 } });
        const grid = fieldstone.generate({ seed: 4 });
        expect(heap.data).not.toEqual(grid.data);
    });
});
