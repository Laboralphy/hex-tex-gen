import { describe, expect, it } from 'vitest';
import { metal, metalWear, type MetalParams, type Texture } from '../src';

const defaults = metal.defaults as MetalParams;
const lum = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return ((c >>> 24) + ((c >>> 16) & 0xff) + ((c >>> 8) & 0xff)) / 3;
};
const rusty = (t: Texture) => {
    let n = 0;
    for (let i = 0; i < t.data.length; i += 4) {
        n += t.data[i] > t.data[i + 2] + 40 ? 1 : 0;
    }
    return n;
};

describe('metal', () => {
    it('lays plates in a stack bond, with thin seams', () => {
        const t = metal.generate({ seed: 1, age: 0 });
        expect(t.anchors.rows).toHaveLength(2);
        expect(t.anchors.plates).toEqual([
            { x: 1, y: 1 },
            { x: 33, y: 1 },
            { x: 1, y: 33 },
            { x: 33, y: 33 },
        ]);
        // seams: 1 pixel, on the left and top of each plate
        expect(t.getPixel(32, 10)).toBe(0x0e1012ff);
        expect(t.getPixel(10, 32)).toBe(0x0e1012ff);
        expect(t.getPixel(33, 10)).not.toBe(0x0e1012ff);
    });

    it('fixes the plates with rivets, lit from the top-left', () => {
        const riveted = metal.generate({ seed: 1, age: 0 });
        const plain = metal.generate({ seed: 1, age: 0, rivets: { enabled: false } });
        // the first rivet of the first plate: the seam, then 2 pixels of inset
        expect(lum(riveted, 3, 3)).toBeGreaterThan(lum(plain, 3, 3));
        expect(lum(riveted, 4, 4)).toBeLessThan(lum(plain, 4, 4));
    });

    it('has a panel, like the other walls, without the rivets of the plates it covers', () => {
        const t = metal.generate({
            seed: 1,
            age: 0,
            rows: { count: 4 },
            blocks: { width: [21, 21] },
            panel: { enabled: true },
        });
        expect(t.anchors.panel).toHaveLength(1);
        const { x, y } = t.anchors.panelCenter[0];
        const plain = metal.generate({
            seed: 1,
            age: 0,
            rows: { count: 4 },
            blocks: { width: [21, 21] },
            panel: { enabled: true },
            rivets: { enabled: false },
        });
        // around the center of the panel, far from its edges: no rivet
        for (let dy = -4; dy <= 4; ++dy) {
            for (let dx = -8; dx <= 8; ++dx) {
                expect(t.getPixel(x + dx, y + dy)).toBe(plain.getPixel(x + dx, y + dy));
            }
        }
    });

    it('rusts as it ages', () => {
        expect(rusty(metal.generate({ seed: 1, age: 0 }))).toBe(0);
        expect(rusty(metal.generate({ seed: 1, age: 1 }))).toBeGreaterThan(200);
    });

    it('ages: derived values, explicit values winning', () => {
        expect(metalWear({ ...defaults, age: 0 })).toEqual({
            rust: { coverage: 0, streaks: 0, length: [2, 4] },
            dents: { density: 0, size: [1, 2] },
            scratches: 0,
            tarnish: 0,
        });
        const old = metalWear({ ...defaults, age: 1, rust: { ...defaults.rust, coverage: 0.1 } });
        expect(old.rust.coverage).toBe(0.1);
        expect(old.dents.density).toBe(3);
    });

    it('validates its bond and its panel', () => {
        expect(() =>
            metal.generate({ seed: 1, rows: { count: 3 }, blocks: { bond: 'running' } }),
        ).toThrow('rows.count: a running bond needs an even number of rows');
        expect(() => metal.generate({ seed: 1, panel: { enabled: true, width: 80 } })).toThrow(
            'panel.width: the panel must fit in the width of the patch',
        );
    });
});
