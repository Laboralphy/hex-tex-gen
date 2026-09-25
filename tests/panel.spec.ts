import { describe, expect, it } from 'vitest';
import { ashlar, bricks, panel } from '../src';

// flat colors: black mortar, stones and slab a single light color
const flat = {
    age: 0,
    mortar: { size: 2, color: '#000', noise: 0 },
    edges: { roughness: 0 },
    stone: { palette: ['#aaa', '#aaa'], shadeVariation: 0, grain: 0 },
};
const MORTAR = 0x000000ff;

describe('panel', () => {
    it('is ashlar with a centered slab', () => {
        expect(panel.defaults.panel.enabled).toBe(true);
        expect(ashlar.defaults.panel.enabled).toBe(false);
        expect(Object.keys(panel.defaults)).toEqual(Object.keys(ashlar.defaults));
    });

    it('reports the slab anchors, walls without a slab report none', () => {
        const t = panel.generate({ seed: 1 });
        expect(t.anchors.panel).toHaveLength(1);
        expect(t.anchors.panelCenter).toHaveLength(1);
        const wall = ashlar.generate({ seed: 1 });
        expect(wall.anchors.panel).toEqual([]);
        expect(wall.anchors.panelCenter).toEqual([]);
    });

    it('centers the slab, with its face just inside the mortar', () => {
        const t = panel.generate({ seed: 1, ...flat, panel: { snap: false } });
        // 36 pixels wide in 64: from x 14; its face starts after 1 pixel of mortar
        const { x, y } = t.anchors.panel[0];
        expect(x).toBe(15);
        expect(t.getPixel(x, y)).not.toBe(MORTAR);
        expect(t.getPixel(x - 1, y)).toBe(MORTAR);
        expect(t.getPixel(x, y - 1)).toBe(MORTAR);
        const center = t.anchors.panelCenter[0];
        expect(center.x).toBe(32);
    });

    it('surrounds the slab with mortar, the joints of the wall stopping at its border', () => {
        const t = panel.generate({ seed: 1, ...flat });
        const { x, y } = t.anchors.panel[0];
        const center = t.anchors.panelCenter[0];
        // no joint crosses the slab: its face is mortar-free along both axes
        for (let px = x; px < 2 * center.x - x; ++px) {
            expect(t.getPixel(px, center.y)).not.toBe(MORTAR);
        }
        for (let py = y; py < 2 * center.y - y; ++py) {
            expect(t.getPixel(center.x, py)).not.toBe(MORTAR);
        }
    });

    it('snaps the slab to row joints', () => {
        for (const seed of [1, 2, 3]) {
            const t = panel.generate({ seed, panel: { y: 9, height: 21 } });
            const rows = t.anchors.rows.map((a) => a.y);
            expect(rows).toContain(t.anchors.panel[0].y);
        }
    });

    it('takes position and size, which scale with the patch', () => {
        const params = {
            seed: 1,
            ...flat,
            panel: { x: 4, y: 4, width: 20, height: 10, snap: false },
        };
        const small = panel.generate(params);
        const large = panel.generate({ ...params, width: 128, height: 128 });
        expect(small.anchors.panel[0]).toEqual({ x: 5, y: 5 });
        expect(large.anchors.panel[0]).toEqual({ x: 9, y: 9 });
    });

    it('rejects a slab larger than the patch', () => {
        expect(() => panel.generate({ seed: 1, panel: { width: 70 } })).toThrow(
            'panel.width: the panel must fit in the width of the patch',
        );
        expect(() => panel.generate({ seed: 1, panel: { y: 50, height: 20 } })).toThrow(
            'panel.y: the panel must fit in the height of the patch',
        );
    });

    it('ages like the rest of the wall', () => {
        expect(panel.generate({ seed: 1, age: 0 }).data).not.toEqual(
            panel.generate({ seed: 1, age: 1 }).data,
        );
    });

    it('works on bricks too', () => {
        const t = bricks.generate({ seed: 1, panel: { enabled: true } });
        expect(t.anchors.panel).toHaveLength(1);
    });
});
