import { z } from 'zod';
import { DETAIL, LAYOUT } from '../../core/schema';
import type { AshlarParams } from './ashlar';
import type { AshlarRow } from './layout';
import type { WallDefaults } from './wall-schema';

/**
 * Top-left corner of the panel, in own pixels: centered unless set.
 */
function panelPosition(p: {
    size: [number, number];
    panel: { width: number; height: number; x?: number; y?: number };
}): { x: number; y: number } {
    return {
        x: p.panel.x ?? (p.size[0] - p.panel.width) / 2,
        y: p.panel.y ?? (p.size[1] - p.panel.height) / 2,
    };
}

/**
 * The `panel` parameter group of walls, with the given defaults.
 */
export function panelGroup(d: WallDefaults['panel']) {
    return z
        .strictObject({
            enabled: z
                .boolean()
                .default(d.enabled)
                .describe('adds a large stone slab to the wall, surrounded by mortar'),
            width: z
                .number()
                .positive()
                .default(d.width)
                .describe('slab width, mortar included')
                .meta(LAYOUT),
            height: z
                .number()
                .positive()
                .default(d.height)
                .describe('slab height, mortar included')
                .meta(LAYOUT),
            x: z
                .number()
                .min(0)
                .optional()
                .describe('left edge of the slab; defaults to centered')
                .meta(LAYOUT),
            y: z
                .number()
                .min(0)
                .optional()
                .describe('top edge of the slab; defaults to centered')
                .meta(LAYOUT),
            snap: z
                .boolean()
                .default(d.snap)
                .describe(
                    'aligns the top and bottom of the slab on the nearest row joints, so that no row is cut into a thin strip',
                ),
            bevel: z
                .number()
                .int()
                .min(0)
                .default(d.bevel)
                .describe('bevel width of the slab, in pixels')
                .meta(DETAIL),
            shade: z.number().min(0).default(d.shade).describe('brightness factor of the slab'),
        })
        .prefault({})
        .describe('a large stone slab: room for an inscription or a switch');
}

/**
 * Reports a panel that does not fit in its patch.
 */
export function checkPanelFits(
    p: {
        size: [number, number];
        panel: { enabled: boolean; width: number; height: number; x?: number; y?: number };
    },
    ctx: z.RefinementCtx,
): void {
    if (!p.panel.enabled) {
        return;
    }
    const { x, y } = panelPosition(p);
    if (x + p.panel.width > p.size[0]) {
        ctx.addIssue({
            code: 'custom',
            path: ['panel', p.panel.x === undefined ? 'width' : 'x'],
            message: 'the panel must fit in the width of the patch',
        });
    }
    if (y + p.panel.height > p.size[1]) {
        ctx.addIssue({
            code: 'custom',
            path: ['panel', p.panel.y === undefined ? 'height' : 'y'],
            message: 'the panel must fit in the height of the patch',
        });
    }
}

/** the panel of a wall, in pixels of the rendered texture */
export type PanelRect = { x: number; y: number; w: number; h: number };

/**
 * The panel of a wall rendered at the given size, snapped to the row joints unless told
 * otherwise; undefined when the panel is disabled.
 */
export function panelRect(
    p: Pick<AshlarParams, 'size' | 'panel'>,
    layout: AshlarRow[],
    width: number,
    height: number,
): PanelRect | undefined {
    if (!p.panel.enabled) {
        return undefined;
    }
    const { x, y } = panelPosition(p);
    const sx = width / p.size[0];
    const sy = height / p.size[1];
    const x0 = Math.round(x * sx);
    let y0 = Math.round(y * sy);
    let y1 = Math.round((y + p.panel.height) * sy);
    if (p.panel.snap) {
        const joints = [...layout.map((row) => row.y), height];
        const nearest = (v: number) =>
            joints.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
        y0 = nearest(y0);
        y1 = nearest(y1);
        if (y1 <= y0) {
            y1 = joints.find((j) => j > y0) ?? height;
        }
    }
    return { x: x0, y: y0, w: Math.round((x + p.panel.width) * sx) - x0, h: y1 - y0 };
}
