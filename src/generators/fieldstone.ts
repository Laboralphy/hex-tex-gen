import { Voronoi } from '@laboralphy/algorithms';
import { z } from 'zod';
import { firstPixel, mod, wrapOffset } from '../core/math';
import { DETAIL, LAYOUT, ratio } from '../core/schema';
import { Texture } from '../core/Texture';
import {
    ashlarWear,
    renderMasonry,
    wallSchema,
    type AshlarParams,
    type AshlarWear,
    type Masonry,
    type StoneBox,
    type WallDefaults,
} from './ashlar';
import { PowerDiagram, type PowerSample } from './common/PowerDiagram';
import { domeLight, roundCorner } from './common/relief';
import { defineGenerator } from './define';
import type { RenderContext } from './types';

/**
 * Defaults of the parameters that differ between walls of Voronoi stones: `fieldstone`
 * and `cavewall`.
 */
export type StoneFieldDefaults = {
    size: [number, number];
    mortar: WallDefaults['mortar'];
    bevel: WallDefaults['bevel'];
    stone: WallDefaults['stone'];
    stones: {
        cells: [number, number];
        layout: 'grid' | 'heap';
        jitter: number;
        variation: number;
        relief: number;
    };
};

/**
 * Parameters of a wall of Voronoi stones, with the given defaults: the parameters of
 * `ashlar` that apply to stones of any shape, and the layout of the stones.
 */
export function stoneFieldSchema(d: StoneFieldDefaults) {
    // the parameter groups of walls that apply to Voronoi stones: not rows and blocks,
    // which are replaced by the stones group, nor chips, which need the corners of
    // rectangles
    const wall = wallSchema({
        size: d.size,
        rows: { count: 4, heightVariation: 0 },
        blocks: { width: [16, 16], minJointOffset: 0, bond: 'random' },
        mortar: d.mortar,
        bevel: d.bevel,
        stone: d.stone,
    }).shape;
    return z
        .strictObject({
            size: wall.size,
            stones: z
                .strictObject({
                    cells: z
                        .tuple([z.number().int().min(1), z.number().int().min(1)])
                        .default(d.stones.cells)
                        .describe(
                            'number of stones across the patch: [columns, rows]; a heap scatters columns × rows stones',
                        )
                        .meta(LAYOUT),
                    layout: z
                        .enum(['grid', 'heap'])
                        .default(d.stones.layout)
                        .describe(
                            'grid: one stone per cell of a jittered grid, all of a similar size; heap: stones scattered at random, of every size, like boulders in a heap',
                        ),
                    variation: ratio()
                        .default(d.stones.variation)
                        .describe(
                            'heap only: spread of the stone sizes, in [0, 1]; 0 gives stones of a similar size',
                        ),
                    relief: ratio()
                        .default(d.stones.relief)
                        .describe(
                            'roundness of the stones, in [0, 1]: 0 for flat faces, 1 for domes lit from the top-left and shadowed towards their crevices',
                        ),
                    jitter: ratio()
                        .default(d.stones.jitter)
                        .describe(
                            'grid only: irregularity of the stones, in [0, 1]: 0 lays them on a regular grid, 1 gives the most irregular shapes',
                        ),
                    stagger: z
                        .number()
                        .min(0)
                        .lt(1)
                        .default(0)
                        .describe(
                            'grid only: shift of every other row, in fraction of a stone; 0.5 with no jitter gives hexagons; needs an even number of rows',
                        ),
                })
                .prefault({})
                .describe('stones laid as the cells of a tileable Voronoi diagram'),
            mortar: wall.mortar,
            bevel: wall.bevel,
            edges: wall.edges,
            cracks: wall.cracks,
            erosion: z
                .strictObject({
                    edges: z
                        .number()
                        .min(0)
                        .optional()
                        .describe(
                            'maximum depth worn into the stone edges, in pixels; when unset, derived from age',
                        )
                        .meta(DETAIL),
                })
                .prefault({})
                .describe('stones worn down by time: uneven edges'),
            stains: wall.stains,
            spalling: wall.spalling,
            moss: wall.moss,
            age: wall.age,
            stone: wall.stone,
        })
        .superRefine((p, ctx) => {
            if (p.stones.stagger > 0 && p.stones.cells[1] % 2 === 1) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['stones', 'cells'],
                    message: 'a stagger needs an even number of rows to tile vertically',
                });
            }
        });
}

/**
 * Parameters of the fieldstone template.
 */
export const fieldstoneSchema = stoneFieldSchema({
    size: [64, 64],
    mortar: { size: 2, color: '#26221d' },
    bevel: { size: 1, light: 1.3, dark: 0.6 },
    stone: {
        palette: ['#3a352d', '#625a4d', '#8a8070', '#aba08c'],
        contrast: 0.9,
        paletteShift: 0.18,
        noise: { period: 8, octaves: 4, persistence: 0.6 },
    },
    stones: { cells: [4, 4], layout: 'grid', jitter: 0.85, variation: 0.7, relief: 0 },
});

export type FieldstoneParams = z.output<typeof fieldstoneSchema>;

/**
 * Resolves the wear values of a fieldstone wall, like those of `ashlar`: derived sizes are
 * proportional to the height of the stones. Stones have no corners to chip.
 */
export function fieldstoneWear(p: FieldstoneParams): AshlarWear {
    return ashlarWear({
        ...p,
        rows: { count: p.stones.cells[1], heightVariation: 0 },
        chips: { ratio: 0, size: [0, 0] },
        erosion: { ...p.erosion, corners: 0 },
    });
}

/**
 * Stones laid as the cells of a tileable Voronoi diagram.
 */
export function voronoiMasonry(
    p: FieldstoneParams,
    { width, height, seed }: RenderContext,
): Masonry {
    const [columns, rows] = p.stones.cells;
    // the diagram spans the rendered patch: its cells scale with it
    const voronoi: {
        sample(x: number, y: number): Omit<PowerSample, 'border2'> & { border2?: number };
    } =
        p.stones.layout === 'heap'
            ? new PowerDiagram(seed, [width, height], columns * rows, p.stones.variation)
            : new Voronoi({
                  seed,
                  size: [width, height],
                  cells: [columns, rows],
                  jitter: p.stones.jitter,
                  stagger: p.stones.stagger,
              });
    const half = p.mortar.size / 2;
    const relief = p.stones.relief;
    // a rounded stone, lit from the top-left: a dome over the cell, steeper towards its
    // border, the crevices around it in shadow
    const roundedLight = (
        wx: number,
        wy: number,
        [cx, cy]: [number, number],
        d: number,
        stone: StoneBox,
        amount: number,
    ) =>
        domeLight(
            wrapOffset(wx, cx, width),
            wrapOffset(wy, cy, height),
            d,
            Math.max(1, Math.min(stone.w, stone.h) / 2),
            amount,
        );
    const mortarAfter = Math.ceil(half);

    // the bounding box of each stone, measured around its center
    const count = columns * rows;
    const centers = new Array<[number, number]>(count);
    const bounds = Array.from({ length: count }, () => ({
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        sumX: 0,
        sumY: 0,
        pixels: 0,
    }));
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const s = voronoi.sample(x + 0.5, y + 0.5);
            centers[s.cell] = s.center;
            const b = bounds[s.cell];
            const dx = wrapOffset(x + 0.5, s.center[0], width);
            const dy = wrapOffset(y + 0.5, s.center[1], height);
            b.minX = Math.min(b.minX, dx);
            b.maxX = Math.max(b.maxX, dx);
            b.minY = Math.min(b.minY, dy);
            b.maxY = Math.max(b.maxY, dy);
            b.sumX += dx;
            b.sumY += dy;
            ++b.pixels;
        }
    }
    const stones: StoneBox[] = bounds.map((b, id) => {
        const [cx, cy] = centers[id] ?? [0, 0];
        const x = Number.isFinite(b.minX) ? cx + b.minX - 0.5 : cx;
        const y = Number.isFinite(b.minY) ? cy + b.minY - 0.5 : cy;
        return {
            row: Math.floor(id / columns),
            block: id % columns,
            x,
            y,
            w: Number.isFinite(b.maxX) ? b.maxX - b.minX + 1 : 1,
            h: Number.isFinite(b.maxY) ? b.maxY - b.minY + 1 : 1,
        };
    });
    // in a heap, a site may lie off the middle of its stone, even outside it: the stone is
    // centered on its centroid instead, for its relief and its anchors
    if (p.stones.layout === 'heap') {
        bounds.forEach((b, id) => {
            const [cx, cy] = centers[id] ?? [0, 0];
            if (b.pixels > 0) {
                centers[id] = [
                    mod(cx + b.sumX / b.pixels, width),
                    mod(cy + b.sumY / b.pixels, height),
                ];
            }
        });
    }
    const face = (edge: number) => firstPixel(edge, mortarAfter);
    // the top edge of each stone, straight above its center: the first pixel row whose
    // center is on the stone, going up from the center
    const tops = centers.map(([cx, cy], id) => {
        const x = Math.floor(cx);
        let y = Math.floor(cy);
        for (let k = 0; k < height; ++k) {
            const s = voronoi.sample(x + 0.5, y - 1 + 0.5);
            if (s.cell !== id || s.border < half) {
                break;
            }
            --y;
        }
        return { x: mod(x, width), y: mod(y, height) };
    });

    return {
        stones,
        locate(wx, wy) {
            const s = voronoi.sample(wx, wy);
            const stone = stones[s.cell];
            // the nearest border faces the neighbor across it: its normal goes from the
            // center of the stone to the neighbor's; the border is lit when it faces the
            // top-left, and is a top edge when it faces up, less than 40° from vertical
            const center = centers[s.cell] ?? s.center;
            const [bx, by] = centers[s.neighbor] ?? center;
            const nx = wrapOffset(bx, center[0], width);
            const ny = wrapOffset(by, center[1], height);
            const lit = nx + ny < 0;
            // rounded stones: their corners carved along a circle, where both borders
            // around them are close
            let d = s.border - half;
            if (relief > 0 && s.border2 !== undefined) {
                const radius = relief * 0.35 * Math.max(1, Math.min(stone.w, stone.h) / 2);
                d = roundCorner(d, s.border2 - half, radius);
            }
            return {
                id: s.cell,
                lx: mod(wx - stone.x, width),
                ly: mod(wy - stone.y, height),
                d,
                lit,
                shadowed: !lit,
                top: ny < 0 && Math.abs(nx) < -ny * 0.84,
                relief: relief > 0 ? roundedLight(wx, wy, center, d, stone, relief) : undefined,
            };
        },
        anchors: () => ({
            stones: stones.map((b) => ({
                x: mod(Math.round(b.x), width),
                y: mod(face(b.y), height),
            })),
            centers: centers.map(([x, y]) => ({ x: Math.floor(x), y: Math.floor(y) })),
            tops,
        }),
    };
}

/** anchors of walls of Voronoi stones */
export const STONE_FIELD_ANCHORS = {
    stones: 'top-left corner of the face of each stone, its bounding box',
    centers: 'center of each stone',
    tops: 'top edge of each stone, straight above its center: where moss hangs',
};

/**
 * Renders a wall of Voronoi stones with validated parameters: shared by `fieldstone` and
 * `cavewall`.
 */
export function renderStoneField(p: FieldstoneParams, context: RenderContext): Texture {
    return renderMasonry(
        p as unknown as AshlarParams,
        context,
        voronoiMasonry(p, context),
        fieldstoneWear(p),
    );
}

/**
 * Natural stone wall: stones of irregular shapes, laid as the cells of a tileable Voronoi
 * diagram, with the wear of the other walls.
 */
export const fieldstone = defineGenerator({
    name: 'fieldstone',
    description: 'Natural stone wall: irregular stones laid as the cells of a Voronoi diagram',
    category: 'surface',
    schema: fieldstoneSchema,
    anchors: STONE_FIELD_ANCHORS,
    render: renderStoneField,
});
