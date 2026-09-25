import { Voronoi } from '@laboralphy/algorithms';
import { z } from 'zod';
import { DETAIL, LAYOUT, ratio } from '../core/schema';
import { Texture } from '../core/Texture';
import {
    ashlarWear,
    checkPanelFits,
    NO_PANEL,
    panelRect,
    renderMasonry,
    wallSchema,
    type AshlarParams,
    type AshlarWear,
    type Masonry,
    type StoneBox,
} from './ashlar';
import { defineGenerator } from './define';
import type { RenderContext } from './types';

// the parameter groups of walls that apply to Voronoi stones: not rows and blocks, which
// are replaced by the stones group, nor chips, which need the corners of rectangles
const wall = wallSchema({
    size: [64, 64],
    rows: { count: 4, heightVariation: 0 },
    blocks: { width: [16, 16], minJointOffset: 0, bond: 'random' },
    panel: NO_PANEL,
    mortar: { size: 2, color: '#26221d' },
    bevel: { size: 1, light: 1.3, dark: 0.6 },
    stone: {
        palette: ['#3a352d', '#625a4d', '#8a8070', '#aba08c'],
        contrast: 0.9,
        paletteShift: 0.18,
        noise: { period: 8, octaves: 4, persistence: 0.6 },
    },
}).shape;

/**
 * Parameters of the fieldstone template: the parameters of `ashlar` that apply to stones
 * of any shape, and the layout of the Voronoi stones.
 */
export const fieldstoneSchema = z
    .strictObject({
        size: wall.size,
        stones: z
            .strictObject({
                cells: z
                    .tuple([z.number().int().min(1), z.number().int().min(1)])
                    .default([4, 4])
                    .describe('number of stones across the patch: [columns, rows]')
                    .meta(LAYOUT),
                jitter: ratio()
                    .default(0.85)
                    .describe(
                        'irregularity of the stones, in [0, 1]: 0 lays them on a regular grid, 1 gives the most irregular shapes',
                    ),
                stagger: z
                    .number()
                    .min(0)
                    .lt(1)
                    .default(0)
                    .describe(
                        'shift of every other row, in fraction of a stone; 0.5 with no jitter gives hexagons; needs an even number of rows',
                    ),
            })
            .prefault({})
            .describe('stones laid as the cells of a tileable Voronoi diagram'),
        panel: wall.panel,
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
        checkPanelFits(p, ctx);
        if (p.stones.stagger > 0 && p.stones.cells[1] % 2 === 1) {
            ctx.addIssue({
                code: 'custom',
                path: ['stones', 'cells'],
                message: 'a stagger needs an even number of rows to tile vertically',
            });
        }
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

function mod(a: number, n: number): number {
    return ((a % n) + n) % n;
}

/** the signed shortest offset from b to a, on a circle of the given length */
function wrap(a: number, b: number, length: number): number {
    return mod(a - b + length / 2, length) - length / 2;
}

/**
 * Stones laid as the cells of a tileable Voronoi diagram, and the panel over them.
 */
export function voronoiMasonry(
    p: FieldstoneParams,
    { width, height, seed }: RenderContext,
): Masonry {
    const [columns, rows] = p.stones.cells;
    // the diagram spans the rendered patch: its cells scale with it
    const voronoi = new Voronoi({
        seed,
        size: [width, height],
        cells: [columns, rows],
        jitter: p.stones.jitter,
        stagger: p.stones.stagger,
    });
    const half = p.mortar.size / 2;
    const mortarAfter = Math.ceil(half);
    const mortarBefore = Math.floor(half);

    // the bounding box of each stone, measured around its center
    const count = columns * rows;
    const centers = new Array<[number, number]>(count);
    const bounds = Array.from({ length: count }, () => ({
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
    }));
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const s = voronoi.sample(x + 0.5, y + 0.5);
            centers[s.cell] = s.center;
            const b = bounds[s.cell];
            const dx = wrap(x + 0.5, s.center[0], width);
            const dy = wrap(y + 0.5, s.center[1], height);
            b.minX = Math.min(b.minX, dx);
            b.maxX = Math.max(b.maxX, dx);
            b.minY = Math.min(b.minY, dy);
            b.maxY = Math.max(b.maxY, dy);
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
    // the panel is a rectangle over the stones; there are no rows to snap it to
    const panel = panelRect({ ...p, panel: { ...p.panel, snap: false } }, [], width, height);
    const panelId = panel ? stones.push({ row: rows, block: 0, ...panel }) - 1 : -1;
    const face = (edge: number) => Math.ceil(edge + mortarAfter - 0.5);
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
            if (
                panel !== undefined &&
                mod(wx - panel.x, width) < panel.w &&
                mod(wy - panel.y, height) < panel.h
            ) {
                const lx = mod(wx - panel.x, width);
                const ly = mod(wy - panel.y, height);
                const dl = lx - mortarAfter;
                const dr = panel.w - lx - mortarBefore;
                const dt = ly - mortarAfter;
                const db = panel.h - ly - mortarBefore;
                const d = Math.min(dl, dr, dt, db);
                return {
                    id: panelId,
                    lx,
                    ly,
                    d,
                    lit: d === dl || d === dt,
                    shadowed: d === db || d === dr,
                    top: d === dt,
                    edges: { dl, dt, dr, db },
                    panel: true,
                };
            }
            const s = voronoi.sample(wx, wy);
            const stone = stones[s.cell];
            // the nearest border faces the neighbor across it: its normal goes from the
            // center of the stone to the neighbor's; the border is lit when it faces the
            // top-left, and is a top edge when it faces up, less than 40° from vertical
            const [bx, by] = centers[s.neighbor] ?? s.center;
            const nx = wrap(bx, s.center[0], width);
            const ny = wrap(by, s.center[1], height);
            const lit = nx + ny < 0;
            return {
                id: s.cell,
                lx: mod(wx - stone.x, width),
                ly: mod(wy - stone.y, height),
                d: s.border - half,
                lit,
                shadowed: !lit,
                top: ny < 0 && Math.abs(nx) < -ny * 0.84,
                panel: false,
            };
        },
        anchors: () => ({
            stones: stones
                .slice(0, count)
                .map((b) => ({ x: mod(Math.round(b.x), width), y: mod(face(b.y), height) })),
            centers: centers.map(([x, y]) => ({ x: Math.floor(x), y: Math.floor(y) })),
            tops,
            panel: panel ? [{ x: mod(face(panel.x), width), y: mod(face(panel.y), height) }] : [],
            panelCenter: panel
                ? [
                      {
                          x: mod(Math.floor(panel.x + panel.w / 2), width),
                          y: mod(Math.floor(panel.y + panel.h / 2), height),
                      },
                  ]
                : [],
        }),
    };
}

/**
 * Natural stone wall: stones of irregular shapes, laid as the cells of a tileable Voronoi
 * diagram, with the wear of the other walls.
 */
export const fieldstone = defineGenerator({
    name: 'fieldstone',
    description: 'Natural stone wall: irregular stones laid as the cells of a Voronoi diagram',
    schema: fieldstoneSchema,
    anchors: {
        stones: 'top-left corner of the face of each stone, its bounding box',
        centers: 'center of each stone',
        tops: 'top edge of each stone, straight above its center: where moss hangs',
        panel: 'top-left corner of the face of the panel, when enabled',
        panelCenter: 'center of the face of the panel, when enabled',
    },
    render(p, context): Texture {
        return renderMasonry(
            p as unknown as AshlarParams,
            context,
            voronoiMasonry(p, context),
            fieldstoneWear(p),
        );
    },
});
