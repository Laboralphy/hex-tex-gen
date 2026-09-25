import { describe, expect, it } from 'vitest';
import { createMemoryLoader, opening, renderTexture, Texture } from '../src';

const loader = createMemoryLoader({});
const WALL = '#808080';
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
const red = (t: Texture, x: number, y: number) => t.getPixel(x, y) >>> 24;

/** a flat grey wall with a 32 x 32 opening at (16, 16) */
function wall(openingParams: object = {}, extra: object[] = []): Texture {
    return renderTexture(
        {
            size: [64, 64],
            background: WALL,
            patches: [
                {
                    id: 'hole',
                    patch: { template: 'opening', ...openingParams },
                    x: 25,
                    y: 25,
                    width: 50,
                    height: 50,
                },
                ...extra,
            ],
        },
        loader,
    );
}

describe('Texture.draw', () => {
    it('erases the pixels of the cut mask of the source', () => {
        const dst = new Texture(2, 1).fill(0xffffffff);
        const src = new Texture(2, 1);
        src.cut = Uint8Array.from([1, 0]);
        dst.draw(src, 0, 0);
        expect(dst.getPixel(0, 0)).toBe(0x00000000);
        expect(dst.getPixel(1, 0)).toBe(0xffffffff);
    });
});

describe('opening', () => {
    it('cuts its back out of the wall', () => {
        const t = wall();
        expect(alpha(t, 32, 32)).toBe(0);
        expect(alpha(t, 5, 5)).toBe(255);
        expect(t.getPixel(5, 5)).toBe(0x808080ff);
    });

    it('shades its reveals, the light coming from the top-left', () => {
        const t = wall();
        // reveals: 4 pixels inside the edges of the opening, at (16, 16)-(48, 48)
        expect(red(t, 32, 17)).toBeLessThan(0x80); // top
        expect(red(t, 17, 32)).toBeLessThan(0x80); // left
        expect(red(t, 46, 32)).toBeGreaterThan(0x80); // right
        expect(red(t, 32, 46)).toBeGreaterThan(0x80); // bottom
    });

    it('darkens or fills its back instead of cutting it', () => {
        const shaded = wall({ back: { mode: 'shade', shade: 0.5 } });
        expect(alpha(shaded, 32, 32)).toBe(255);
        expect(red(shaded, 32, 32)).toBe(0x40);
        const filled = wall({ back: { mode: 'color', color: '#ff0000' } });
        expect(filled.getPixel(32, 32)).toBe(0xff0000ff);
    });

    it('leaves open sides without a reveal', () => {
        const t = wall({ open: ['bottom'] });
        // the cut runs down to the last row of the opening
        expect(alpha(t, 32, 47)).toBe(0);
        expect(alpha(wall(), 32, 47)).toBe(255);
    });

    it('lets patches drawn afterwards fill the hole', () => {
        const t = wall({}, [
            {
                patch: { template: 'stone', size: [8, 8] },
                anchor: { to: 'hole', at: 'openingCenter', offset: [-4, -4] },
            },
        ]);
        expect(alpha(t, 32, 32)).toBe(255);
        expect(alpha(t, 24, 32)).toBe(0);
    });

    it('reports its anchors, open sides included', () => {
        const t = opening.generate({ seed: 1 });
        expect(t.anchors.opening).toEqual([{ x: 4, y: 4 }]);
        expect(t.anchors.openingCenter).toEqual([{ x: 16, y: 16 }]);
        const door = opening.generate({ seed: 1, open: ['left', 'top'] });
        expect(door.anchors.opening).toEqual([{ x: 0, y: 0 }]);
    });
});
