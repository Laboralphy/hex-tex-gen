import { describe, expect, it } from 'vitest';
import { door, type Texture } from '../src';

const rgb = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return { r: c >>> 24, g: (c >>> 16) & 0xff, b: (c >>> 8) & 0xff, a: c & 0xff };
};
/** iron and steel are grey-blue, wood is brown */
const isMetal = (t: Texture, x: number, y: number) => {
    const { r, b } = rgb(t, x, y);
    return b >= r - 4;
};

describe('door', () => {
    it('is always opaque', () => {
        for (const kind of ['single', 'double', 'lift'] as const) {
            for (const material of ['wood', 'metal'] as const) {
                const t = door.generate({ seed: 1, kind, material, age: 1 });
                for (let i = 3; i < t.data.length; i += 4) {
                    expect(t.data[i]).toBe(255);
                }
            }
        }
    });

    it('has one leaf, two leaves, or a lifting one', () => {
        expect(door.generate({ seed: 1 }).anchors.leaves).toEqual([{ x: 0, y: 0 }]);
        expect(door.generate({ seed: 1, kind: 'double' }).anchors.leaves).toEqual([
            { x: 0, y: 0 },
            { x: 32, y: 0 },
        ]);
        expect(door.generate({ seed: 1, kind: 'double' }).anchors.handles).toHaveLength(2);
        expect(door.generate({ seed: 1, kind: 'lift' }).anchors.handles).toEqual([]);
        expect(door.generate({ seed: 1, handle: { kind: 'none' } }).anchors.handles).toEqual([]);
    });

    it('puts the handle on the side opposite to the hinges', () => {
        const left = door.generate({ seed: 1, hinge: 'left' }).anchors.handles[0];
        const right = door.generate({ seed: 1, hinge: 'right' }).anchors.handles[0];
        expect(left.x).toBeGreaterThan(48);
        expect(right.x).toBeLessThan(16);
    });

    it('reinforces the leaves with iron bands from the hinge side', () => {
        // two bands: at a third and two thirds of the height; 4 pixels wide
        const banded = door.generate({ seed: 1, age: 0 });
        expect(isMetal(banded, 10, 42)).toBe(true);
        // the bands stop at 80% of the width, before the opening side
        expect(isMetal(banded, 60, 42)).toBe(false);
        const plain = door.generate({ seed: 1, age: 0, bands: { count: 0 } });
        expect(isMetal(plain, 10, 42)).toBe(false);
        const across = door.generate({ seed: 1, age: 0, bands: { length: 1 } });
        expect(isMetal(across, 60, 42)).toBe(true);
    });

    it('is made of wood or metal', () => {
        const wood = door.generate({ seed: 1, age: 0, bands: { count: 0 } });
        const steel = door.generate({ seed: 1, age: 0, material: 'metal', bands: { count: 0 } });
        expect(isMetal(wood, 20, 20)).toBe(false);
        expect(isMetal(steel, 20, 20)).toBe(true);
    });

    it('has raised panels in the fancy style', () => {
        const solid = door.generate({ seed: 1, bands: { count: 0 } });
        const fancy = door.generate({ seed: 1, style: 'fancy', bands: { count: 0 } });
        expect(fancy.data).not.toEqual(solid.data);
    });
});
