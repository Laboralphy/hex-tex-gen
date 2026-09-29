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
    category: 'surface',
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
    category: 'surface',
    schema: z.strictObject({ size: size().default([1, 1]) }),
    overlay: true,
    render: (_, { width, height }) => new Texture(width, height).fill(RED),
}) as unknown as TextureGenerator;

// a block reporting 10 points in a row: (0, 0), (3, 0), ... (27, 0)
const row = defineGenerator({
    name: 'test-row',
    description: 'test',
    category: 'surface',
    schema: z.strictObject({ size: size().default([32, 4]) }),
    anchors: { points: 'test points' },
    render(_, { width, height }) {
        const t = new Texture(width, height).fill(BLACK);
        t.anchors = { points: Array.from({ length: 10 }, (_, i) => ({ x: i * 3, y: 0 })) };
        return t;
    },
}) as unknown as TextureGenerator;

const BLUE = 0x0000ffff;

// a 16 x 16 block reporting the corners of its 12 x 12 middle as corner points
const frame = defineGenerator({
    name: 'test-frame',
    description: 'test',
    category: 'surface',
    schema: z.strictObject({ size: size().default([16, 16]) }),
    anchors: { corners: 'test corners' },
    render(_, { width, height }) {
        const t = new Texture(width, height).fill(BLACK);
        t.anchors = {
            corners: [
                { x: 2, y: 2, corner: 'top-left' },
                { x: 13, y: 2, corner: 'top-right' },
                { x: 2, y: 13, corner: 'bottom-left' },
                { x: 13, y: 13, corner: 'bottom-right' },
            ],
        };
        return t;
    },
}) as unknown as TextureGenerator;

// a 3 x 3 blue overlay, red at its top-left corner
const mark = defineGenerator({
    name: 'test-mark',
    description: 'test',
    category: 'surface',
    schema: z.strictObject({ size: size().default([3, 3]) }),
    overlay: true,
    render(_, { width, height }) {
        const t = new Texture(width, height).fill(BLUE);
        t.setPixel(0, 0, RED);
        return t;
    },
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
        generators[row.name] = row;
        generators[frame.name] = frame;
        generators[mark.name] = mark;
    });
    afterAll(() => {
        delete generators[target.name];
        delete generators[dot.name];
        delete generators[row.name];
        delete generators[frame.name];
        delete generators[mark.name];
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

    describe('ratio', () => {
        const renderRow = (anchor: object, seed = 3, extra: object[] = []) =>
            redPixels(
                renderTexture(
                    {
                        size: [32, 4],
                        patches: [
                            { id: 'row', patch: { template: 'test-row' } },
                            ...extra,
                            {
                                patch: { template: 'test-dot' },
                                anchor: { to: 'row', at: 'points', ...anchor },
                                seed,
                            },
                        ],
                    },
                    loader,
                ),
            ).map(([x]) => x / 3);

        it('keeps every point at 1, none at 0', () => {
            expect(renderRow({ ratio: 1 })).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            expect(renderRow({})).toHaveLength(10);
            expect(renderRow({ ratio: 0 })).toEqual([]);
        });

        it('keeps an exact share of the points', () => {
            expect(renderRow({ ratio: 0.5 })).toHaveLength(5);
            expect(renderRow({ ratio: 0.33 })).toHaveLength(3);
        });

        it('only adds points when the ratio rises', () => {
            const smaller = renderRow({ ratio: 0.3 });
            const larger = renderRow({ ratio: 0.7 });
            expect(larger).toEqual(expect.arrayContaining(smaller));
        });

        it('picks another subset with another seed', () => {
            const subsets = new Set(
                [1, 2, 3, 4, 5].map((seed) => renderRow({ ratio: 0.5 }, seed).join()),
            );
            expect(subsets.size).toBeGreaterThan(1);
        });

        it('picks among the points of only', () => {
            const kept = renderRow({ only: [0, 1, 2, 3], ratio: 0.5 });
            expect(kept).toHaveLength(2);
            kept.forEach((i) => expect([0, 1, 2, 3]).toContain(i));
        });

        it('counts only the visible points', () => {
            // an opaque block hiding points 5 to 9
            const cover = { patch: { template: 'test-target' }, x: 45, width: 55, height: 100 };
            const kept = renderRow({ ratio: 0.4 }, 3, [cover]);
            expect(kept).toHaveLength(2);
            kept.forEach((i) => expect(i).toBeLessThan(5));
        });
    });

    describe('mirror', () => {
        const marks = (anchor: object) =>
            renderTexture(
                {
                    size: [16, 16],
                    patches: [
                        { id: 'frame', patch: { template: 'test-frame' } },
                        {
                            patch: { template: 'test-mark' },
                            anchor: { to: 'frame', at: 'corners', ...anchor },
                        },
                    ],
                },
                loader,
            );

        it('puts the top-left corner of each copy on its corner, the copy growing inwards', () => {
            const t = marks({ mirror: true });
            expect(redPixels(t)).toEqual([
                [2, 2],
                [13, 2],
                [2, 13],
                [13, 13],
            ]);
            // the copy on the top-right corner extends to the left and downwards
            expect(t.getPixel(11, 4)).toBe(BLUE);
            expect(t.getPixel(14, 3)).toBe(BLACK);
            // the one on the bottom-right corner, to the left and upwards
            expect(t.getPixel(11, 11)).toBe(BLUE);
            expect(t.getPixel(13, 14)).toBe(BLACK);
        });

        it('mirrors the offset, pointing inwards', () => {
            expect(redPixels(marks({ mirror: true, offset: [1, 1] }))).toEqual([
                [3, 3],
                [12, 3],
                [3, 12],
                [12, 12],
            ]);
        });

        it('leaves copies unmirrored without it', () => {
            const t = marks({});
            expect(t.getPixel(14, 3)).toBe(BLUE);
            expect(t.getPixel(15, 15)).toBe(BLUE);
        });
    });

    describe('wrap', () => {
        // 8-pixel marks on the points of a row: (0, 0), (3, 0), ... (27, 0); drawn in order,
        // each one covers the red corner of the previous ones it overlaps
        const renderRow = (wrap: object, rowX = 0, anchor: object = {}) =>
            renderTexture(
                {
                    size: [32, 32],
                    patches: [
                        { id: 'row', patch: { template: 'test-row' }, x: rowX },
                        {
                            patch: { template: 'test-mark' },
                            anchor: { to: 'row', at: 'points', ...anchor },
                            width: 25,
                            height: 25,
                            ...wrap,
                        },
                    ],
                },
                loader,
            );
        const corners = (t: Texture) => redPixels(t).map(([x]) => x);

        it('wraps copies across the edges by default', () => {
            const t = renderRow({});
            // the copy on (27, 0) continues on the left edge, over the first one
            expect(t.getPixel(0, 0)).toBe(BLUE);
            expect(corners(t)).toEqual([3, 6, 9, 12, 15, 18, 21, 24, 27]);
        });

        it('skips the copies that would cross an edge', () => {
            const t = renderRow({ wrap: false });
            expect(t.getPixel(0, 0)).toBe(RED);
            expect(corners(t)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24]);
            // the points of a target crossing the edge count where they land: 16, 19, 22,
            // then 2, 5, 8, 11 past the edge, drawn last, the one on 11 covering 16
            expect(corners(renderRow({ wrap: false }, 50))).toEqual([2, 5, 8, 11, 19, 22]);
        });

        it('takes its default from the texture, the placement winning', () => {
            const placed = (textureWrap: boolean, wrap?: boolean) =>
                renderTexture(
                    {
                        size: [32, 32],
                        wrap: textureWrap,
                        patches: [
                            { id: 'row', patch: { template: 'test-row' } },
                            {
                                patch: { template: 'test-mark' },
                                anchor: { to: 'row', at: 'points' },
                                width: 25,
                                height: 25,
                                wrap,
                            },
                        ],
                    },
                    loader,
                ).getPixel(0, 0);
            expect(placed(false)).toBe(RED);
            expect(placed(false, true)).toBe(BLUE);
            expect(placed(true, false)).toBe(RED);
        });

        it('picks the ratio among the copies that fit', () => {
            // 5 of the 9 copies that fit; a later copy may cover the corner of an earlier one
            const kept = corners(renderRow({ wrap: false }, 0, { ratio: 0.5 }));
            expect(kept.length).toBeGreaterThanOrEqual(3);
            kept.forEach((x) => expect(x).toBeLessThanOrEqual(24));
        });

        it('checks mirrored copies where they land', () => {
            const corners = (mirror: boolean) =>
                redPixels(
                    renderTexture(
                        {
                            size: [16, 16],
                            wrap: false,
                            patches: [
                                { id: 'frame', patch: { template: 'test-frame' } },
                                {
                                    patch: { template: 'test-mark' },
                                    anchor: { to: 'frame', at: 'corners', mirror },
                                    width: 25,
                                    height: 25,
                                },
                            ],
                        },
                        loader,
                    ),
                );
            // 4-pixel marks: unmirrored, only the top-left one fits
            expect(corners(false)).toEqual([[2, 2]]);
            // mirrored, each one grows into the frame
            expect(corners(true)).toHaveLength(4);
        });
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
        expect(() => render([wall, dots({ ratio: 1.5 })])).toThrow(
            'texture: patches[1].anchor.ratio: Too big: expected number to be <=1',
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
