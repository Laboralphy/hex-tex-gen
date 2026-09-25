import { describe, expect, it } from 'vitest';
import { computePlanksLayout, planks, planksWear, type PlanksParams } from '../src';

const defaults = planks.defaults as PlanksParams;
const withParams = (params: object) => planks.schema.parse(params) as PlanksParams;

describe('computePlanksLayout', () => {
    it('fills the width with columns and each column with planks, exactly', () => {
        for (const seed of [1, 2, 3, 4]) {
            const layout = computePlanksLayout(defaults, seed, 64, 64);
            expect(layout[0].x).toBe(0);
            expect(layout.reduce((sum, c) => sum + c.width, 0)).toBe(64);
            for (const column of layout) {
                expect(column.planks.reduce((sum, p) => sum + p.length, 0)).toBeCloseTo(64, 6);
            }
        }
    });

    it('draws plank lengths within [min, max] of the height', () => {
        const p = withParams({ planks: { length: [0.25, 0.5] } });
        for (const seed of [1, 2, 3]) {
            for (const column of computePlanksLayout(p, seed, 64, 64)) {
                expect(column.planks.length).toBeGreaterThan(1);
                // the last plank may be cut to fit, or merged with its neighbour
                for (const plank of column.planks.slice(0, -1)) {
                    expect(plank.length).toBeGreaterThanOrEqual(16);
                    expect(plank.length).toBeLessThanOrEqual(32);
                }
            }
        }
    });

    it('gives planks running the whole height with [1, 1]', () => {
        const p = withParams({ planks: { length: [1, 1] } });
        for (const column of computePlanksLayout(p, 1, 64, 64)) {
            expect(column.planks).toEqual([{ y: 0, length: 64 }]);
        }
    });

    it('takes a number of lines, or a plank width', () => {
        expect(computePlanksLayout(withParams({ lines: { count: 6 } }), 1, 64, 64)).toHaveLength(6);
        expect(
            computePlanksLayout(withParams({ lines: { width: 21, count: 9 } }), 1, 64, 64),
        ).toHaveLength(3);
    });

    it('gives the same planks at any size', () => {
        const small = computePlanksLayout(defaults, 5, 64, 64);
        const large = computePlanksLayout(defaults, 5, 128, 256);
        small.forEach((column, c) => {
            expect(large[c].planks).toHaveLength(column.planks.length);
            column.planks.forEach((plank, j) => {
                expect(large[c].planks[j].y).toBeCloseTo(plank.y * 4, 6);
                expect(large[c].planks[j].length).toBeCloseTo(plank.length * 4, 6);
            });
        });
    });
});

describe('planks', () => {
    it('has no plank end in full-height columns', () => {
        const t = planks.generate({
            seed: 1,
            age: 0,
            planks: { length: [1, 1] },
            gap: { color: '#000' },
            edges: { roughness: 0 },
        });
        // down the middle of each column: never a gap pixel
        for (const { x } of t.anchors.lines) {
            for (let y = 0; y < 64; ++y) {
                expect(t.getPixel(x + 3, y)).not.toBe(0x000000ff);
            }
        }
    });

    it('reports its anchors', () => {
        const t = planks.generate({ seed: 1, lines: { count: 5 } });
        expect(t.anchors.lines).toHaveLength(5);
        const count = computePlanksLayout(withParams({ lines: { count: 5 } }), 1, 64, 64).reduce(
            (n, c) => n + (c.planks.length > 1 ? c.planks.length : 0),
            0,
        );
        expect(t.anchors.planks).toHaveLength(count);
        // planks running the whole height have no top
        expect(planks.generate({ seed: 1, planks: { length: [1, 1] } }).anchors.planks).toEqual([]);
    });

    it('ages: derived values, explicit values winning', () => {
        expect(planksWear({ ...defaults, age: 0 })).toEqual({
            weathering: 0,
            splits: { ratio: 0, length: [4, 8] },
            roughness: 0.2,
            grime: 0,
        });
        expect(planksWear({ ...defaults, age: 1, weathering: 0.1 }).weathering).toBe(0.1);
        expect(planks.generate({ seed: 1, age: 0 }).data).not.toEqual(
            planks.generate({ seed: 1, age: 1 }).data,
        );
    });

    it('lays horizontal planks: the vertical ones, transposed', () => {
        const horizontal = planks.generate({ seed: 3, direction: 'horizontal', size: [64, 32] });
        const vertical = planks.generate({ seed: 3, size: [32, 64] });
        expect([horizontal.width, horizontal.height]).toEqual([64, 32]);
        for (let y = 0; y < 32; ++y) {
            for (let x = 0; x < 64; ++x) {
                expect(horizontal.getPixel(x, y)).toBe(vertical.getPixel(y, x));
            }
        }
        // lines are rows: they start on the left edge
        for (const { x } of horizontal.anchors.lines) {
            expect(x).toBe(0);
        }
        expect(horizontal.anchors.lines.map((a) => a.y)).toEqual(
            vertical.anchors.lines.map((a) => a.x),
        );
    });

    it('validates its parameters', () => {
        expect(() => planks.generate({ seed: 1, planks: { length: [0.5, 1.5] } })).toThrow(
            'planks.length[1]: Too big: expected number to be <=1',
        );
        expect(() => planks.generate({ seed: 1, planks: { length: [0.8, 0.4] } })).toThrow(
            'planks.length: expected [min, max] with min <= max',
        );
    });
});
