import { describe, expect, it } from 'vitest';
import { ashlar, ashlarWear, bricks, computeAshlarLayout, type AshlarParams } from '../src';

const brickParams = bricks.defaults as AshlarParams;

describe('regular bonds', () => {
    it('lays equal bricks filling each row, offset by half a brick every other row', () => {
        const layout = computeAshlarLayout(brickParams, 1, 64, 64);
        expect(layout).toHaveLength(8);
        layout.forEach((row, r) => {
            expect(row.blocks).toHaveLength(4);
            for (const block of row.blocks) {
                expect(block.width).toBe(16);
            }
            expect(row.blocks[0].x).toBe(r % 2 === 0 ? 0 : 8);
        });
    });

    it('aligns the joints of a stack bond', () => {
        const p = { ...brickParams, blocks: { ...brickParams.blocks, bond: 'stack' as const } };
        const layout = computeAshlarLayout(p, 1, 64, 64);
        for (const row of layout) {
            expect(row.blocks.map((b) => b.x)).toEqual([0, 16, 32, 48]);
        }
    });

    it('fits as many bricks as the mean width allows, exactly', () => {
        const p = {
            ...brickParams,
            blocks: { ...brickParams.blocks, width: [18, 24] as [number, number] },
        };
        const row = computeAshlarLayout(p, 1, 64, 64)[0];
        expect(row.blocks).toHaveLength(3);
        expect(row.blocks.reduce((sum, b) => sum + b.width, 0)).toBeCloseTo(64, 6);
    });

    it('scales with the patch', () => {
        const small = computeAshlarLayout(brickParams, 1, 64, 64);
        const large = computeAshlarLayout(brickParams, 1, 128, 128);
        expect(large[1].blocks[0]).toEqual({ x: 16, width: 32 });
        expect(small[1].blocks[0]).toEqual({ x: 8, width: 16 });
    });

    it('rejects a running bond with an odd number of rows', () => {
        expect(() => bricks.generate({ seed: 1, rows: { count: 7 } })).toThrow(
            'rows.count: a running bond needs an even number of rows to tile vertically',
        );
        expect(() =>
            bricks.generate({ seed: 1, rows: { count: 7 }, blocks: { bond: 'stack' } }),
        ).not.toThrow();
    });

    it('can be used by ashlar too', () => {
        const t = ashlar.generate({ seed: 1, blocks: { bond: 'running', width: [16, 16] } });
        expect(t.anchors.stones).toHaveLength(16);
    });
});

describe('bricks', () => {
    it('shares the parameters of ashlar, with brick defaults', () => {
        expect(bricks.defaults.blocks.bond).toBe('running');
        expect(bricks.defaults.age).toBe(0.3);
        expect(Object.keys(bricks.defaults)).toEqual(Object.keys(ashlar.defaults));
    });

    it('ages', () => {
        const render = (age: number) => bricks.generate({ seed: 3, age }).data;
        expect(render(0)).not.toEqual(render(1));
    });

    it('reports the anchors of walls', () => {
        const t = bricks.generate({ seed: 3 });
        expect(t.anchors.rows).toHaveLength(8);
        expect(t.anchors.stones).toHaveLength(32);
    });

    it('scales derived wear sizes with the brick height, not ratios nor explicit values', () => {
        const stone = ashlarWear({ ...(ashlar.defaults as AshlarParams), age: 1 });
        const brick = ashlarWear({ ...brickParams, age: 1 });
        // ashlar stones are 16 pixels high, bricks 8
        expect(brick.erosion.edges).toBeCloseTo(stone.erosion.edges / 2);
        expect(brick.chips.size[1]).toBeCloseTo(stone.chips.size[1] / 2);
        expect(brick.chips.ratio).toBe(stone.chips.ratio);
        const explicit = ashlarWear({ ...brickParams, age: 1, erosion: { edges: 3 } });
        expect(explicit.erosion.edges).toBe(3);
    });
});
