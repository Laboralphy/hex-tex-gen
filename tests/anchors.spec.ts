import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    ashlar,
    defineGenerator,
    size,
    computeAshlarLayout,
    createMemoryLoader,
    generators,
    renderTexture,
    Texture,
    type AshlarParams,
    type TextureGenerator,
} from '../src';

const RED = 0xff0000ff;
const BLACK = 0x000000ff;

// a solid block reporting fixed anchor points: (0, 0), (4, 2), (8, 8)
const target = defineGenerator({
    name: 'test-target',
    description: 'test',
    schema: z.strictObject({ size: size().default([16, 16]) }),
    anchors: { corners: 'test points' },
    render(_, { width, height }) {
        const t = new Texture(width, height).fill(BLACK);
        t.anchors = {
            corners: [
                { x: 0, y: 0 },
                { x: 4, y: 2 },
                { x: 8, y: 8 },
            ],
        };
        return t;
    },
}) as unknown as TextureGenerator;

// a red block, an overlay
const dot = defineGenerator({
    name: 'test-dot',
    description: 'test',
    schema: z.strictObject({ size: size().default([1, 1]) }),
    overlay: true,
    render: (_, { width, height }) => new Texture(width, height).fill(RED),
}) as unknown as TextureGenerator;

const loader = createMemoryLoader({});
const redPixels = (t: Texture) => {
    const found: [number, number][] = [];
    for (let y = 0; y < t.height; ++y) {
        for (let x = 0; x < t.width; ++x) {
            if (t.getPixel(x, y) === RED) {
                found.push([x, y]);
            }
        }
    }
    return found;
};

describe('anchored placements', () => {
    beforeAll(() => {
        generators[target.name] = target;
        generators[dot.name] = dot;
    });
    afterAll(() => {
        delete generators[target.name];
        delete generators[dot.name];
    });

    const render = (patches: object[]) =>
        renderTexture({ size: [32, 32], background: '#000', patches }, loader);
    const wall = { id: 'wall', patch: { template: 'test-target' }, x: 25, y: 25 };
    const dots = (anchor: object) => ({
        patch: { template: 'test-dot' },
        anchor: { to: 'wall', at: 'corners', ...anchor },
    });

    it('repeats the patch on each anchor point, relative to the target', () => {
        expect(redPixels(render([wall, dots({})]))).toEqual([
            [8, 8],
            [12, 10],
            [16, 16],
        ]);
    });

    it('selects points and shifts them', () => {
        expect(redPixels(render([wall, dots({ only: [0, 2], offset: [1, -1] })]))).toEqual([
            [9, 7],
            [17, 15],
        ]);
    });

    it('skips points hidden by a later opaque placement', () => {
        const cover = { patch: { template: 'test-target' }, x: 50, y: 50, width: 25, height: 25 };
        expect(redPixels(render([wall, cover, dots({})]))).toEqual([
            [8, 8],
            [12, 10],
        ]);
    });

    it('keeps points under overlays and translucent placements', () => {
        const overlay = { patch: { template: 'test-dot' }, x: 50, y: 50, width: 25, height: 25 };
        const translucent = {
            patch: { template: 'test-target' },
            x: 50,
            y: 50,
            width: 25,
            height: 25,
            opacity: 0.5,
        };
        expect(redPixels(render([wall, overlay, translucent, dots({})]))).toContainEqual([16, 16]);
    });

    it('gives each copy its own seed, independent of skipped points', () => {
        const seen: number[] = [];
        generators['test-dot'] = {
            ...dot,
            generate: (o) => {
                seen.push(o.seed);
                return dot.generate(o);
            },
        };
        render([wall, dots({})]);
        const all = [...seen];
        seen.length = 0;
        render([wall, dots({ only: [2] })]);
        generators['test-dot'] = dot;
        expect(new Set(all).size).toBe(3);
        expect(seen).toEqual([all[2]]);
    });

    it('reports invalid anchors', () => {
        expect(() => render([wall, dots({ to: 'nope' })])).toThrow(
            'texture: patches[1].anchor: no previous placement with id "nope"',
        );
        expect(() => render([wall, dots({ at: 'rows' })])).toThrow(
            /has no anchor "rows" \(available: corners\)/,
        );
        expect(() => render([wall, { ...dots({}), y: 10 }])).toThrow(/use "anchor.offset"/);
        expect(() => render([wall, wall])).toThrow(/duplicate id "wall"/);
        expect(() => render([wall, { ...dots({}), id: 'a' }, dots({ to: 'a' })])).toThrow(
            /"a" is anchored itself/,
        );
        expect(() => render([wall, dots({ offset: [1.5, 0] })])).toThrow(
            'texture: patches[1].anchor.offset[0]: Invalid input: expected int, received number',
        );
    });
});

describe('ashlar anchors', () => {
    // flat colors: black mortar, white stones
    const params: AshlarParams = {
        ...(ashlar.defaults as AshlarParams),
        age: 0,
        mortar: { size: 2, color: '#000', noise: 0 },
        bevel: { size: 0, light: 1, dark: 1 },
        edges: { roughness: 0 },
        chips: { ratio: 0, size: [0, 0] },
        cracks: { ratio: 0, length: [0, 0] },
        stone: {
            ...(ashlar.defaults as AshlarParams).stone,
            palette: ['#fff', '#fff'],
            shadeVariation: 0,
            paletteShift: 0,
            grain: 0,
        },
    };

    it.each([
        [64, 2],
        [128, 2],
        [128, 3],
        [256, 1],
        [96, 4],
    ])('puts rows on the first stone pixel below the mortar (%ipx, mortar %i)', (size, mortar) => {
        const p = { ...params, mortar: { ...params.mortar, size: mortar } };
        const t = ashlar.generate({ ...p, seed: 3, width: size, height: size });
        const layout = computeAshlarLayout(p, 3, size, size);
        expect(t.anchors.rows).toHaveLength(layout.length);
        t.anchors.rows.forEach(({ y }, r) => {
            // the column farthest from the vertical joints of this row and the row above
            const joints = [...layout[r].blocks, ...layout.at(r - 1)!.blocks].map((b) => b.x);
            const distance = (x: number) =>
                Math.min(
                    ...joints.map((j) => {
                        const d = Math.abs(x + 0.5 - j) % size;
                        return Math.min(d, size - d);
                    }),
                );
            const x = [...Array(size).keys()].reduce((a, b) => (distance(b) > distance(a) ? b : a));
            const isMortar = (yy: number) => t.getPixel(x, yy) === 0x000000ff;
            // the joint above the anchor is exactly `mortar` pixels thick
            expect(isMortar(y)).toBe(false);
            for (let k = 1; k <= mortar; ++k) {
                expect(isMortar(y - k)).toBe(true);
            }
            expect(isMortar(y - mortar - 1)).toBe(false);
        });
    });

    it('puts stones on the first stone pixel right of the mortar', () => {
        const t = ashlar.generate({ ...params, seed: 3, width: 128, height: 128 });
        for (const { x, y } of t.anchors.stones) {
            const isMortar = (xx: number, yy: number) => t.getPixel(xx, yy) === 0x000000ff;
            expect(isMortar(x, y + 2)).toBe(false);
            expect(isMortar(x - 1, y + 2)).toBe(true);
            expect(isMortar(x, y - 1)).toBe(true);
        }
    });

    it('reports the top-left corner of each stone', () => {
        const t = ashlar.generate({ seed: 3 });
        const layout = computeAshlarLayout(ashlar.defaults as AshlarParams, 3, 64, 64);
        const count = layout.reduce((n, row) => n + row.blocks.length, 0);
        expect(t.anchors.stones).toHaveLength(count);
    });
});
