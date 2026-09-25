import { describe, expect, it } from 'vitest';
import { ashlar, computeAshlarLayout, type AshlarParams } from '../src';

const params = ashlar.defaults as AshlarParams;

describe('computeAshlarLayout', () => {
    it('fills the whole patch', () => {
        const layout = computeAshlarLayout(params, 42, 64, 64);
        expect(layout[0].y).toBe(0);
        const last = layout[layout.length - 1];
        expect(last.y + last.height).toBe(64);
        for (const row of layout) {
            const total = row.blocks.reduce((sum, b) => sum + b.width, 0);
            expect(total).toBeCloseTo(64, 6);
        }
    });

    it('gives the same stones at any size', () => {
        const small = computeAshlarLayout(params, 42, 64, 64);
        const large = computeAshlarLayout(params, 42, 256, 256);
        expect(large).toHaveLength(small.length);
        small.forEach((row, r) => {
            // row bounds are rounded to whole pixels at each size: off by at most half a
            // small pixel, i.e. 2 large pixels
            expect(Math.abs(large[r].y - row.y * 4)).toBeLessThanOrEqual(2);
            row.blocks.forEach((block, i) => {
                expect(large[r].blocks[i].x).toBeCloseTo(block.x * 4, 6);
                expect(large[r].blocks[i].width).toBeCloseTo(block.width * 4, 6);
            });
        });
    });

    it('keeps joints of adjacent rows apart', () => {
        const layout = computeAshlarLayout(params, 3, 64, 64);
        for (let r = 1; r < layout.length; ++r) {
            for (const a of layout[r].blocks) {
                for (const b of layout[r - 1].blocks) {
                    const d = Math.abs(a.x - b.x) % 64;
                    expect(Math.min(d, 64 - d)).toBeGreaterThanOrEqual(
                        params.blocks.minJointOffset,
                    );
                }
            }
        }
    });

    it('rejects invalid block widths', () => {
        expect(() =>
            computeAshlarLayout(
                { ...params, blocks: { width: [0, 10], minJointOffset: 0, bond: 'random' } },
                1,
                64,
                64,
            ),
        ).toThrow(RangeError);
    });
});

describe('ashlar', () => {
    it('renders at its own size by default', () => {
        const t = ashlar.generate({ seed: 1 });
        expect([t.width, t.height]).toEqual(params.size);
    });

    it('renders at a requested size, including odd sizes', () => {
        const t = ashlar.generate({ seed: 1, width: 37, height: 53 });
        expect([t.width, t.height]).toEqual([37, 53]);
    });

    it('merges nested parameters with the defaults', () => {
        const a = ashlar.generate({ seed: 1, mortar: { size: 4 } });
        const b = ashlar.generate({ seed: 1 });
        expect(a.data).not.toEqual(b.data);
    });
});
