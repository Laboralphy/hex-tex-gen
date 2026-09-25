import { firstPixel, mod } from '../../core/math';
import type { RenderContext } from '../types';
import type { AshlarParams } from './ashlar';
import { computeAshlarLayout } from './layout';
import type { StoneBox, Masonry } from './masonry';
import { panelRect } from './panel';

/**
 * Rows of rectangular stones, and the panel over them.
 */
export function rectMasonry(p: AshlarParams, { width, height, seed }: RenderContext): Masonry {
    const layout = computeAshlarLayout(p, seed, width, height);
    // every stone, and its rectangle in pixels; the panel is one more stone, in a row of
    // its own after the last one
    const stones: StoneBox[] = [];
    const stoneIndex = layout.map((row, r) =>
        row.blocks.map(
            (block, i) =>
                stones.push({
                    row: r,
                    block: i,
                    x: block.x,
                    y: row.y,
                    w: block.width,
                    h: row.height,
                }) - 1,
        ),
    );
    const panel = panelRect(p, layout, width, height);
    const panelId = panel ? stones.push({ row: layout.length, block: 0, ...panel }) - 1 : -1;
    // a joint of n pixels: the stone after it (below, right) takes the larger half, so
    // that odd sizes keep all their pixels when tested at pixel centers
    const mortarAfter = Math.ceil(p.mortar.size / 2);
    const mortarBefore = Math.floor(p.mortar.size / 2);
    // first pixel row (or column) of a stone face: pixel centers at d >= 0
    const face = (edge: number) => firstPixel(edge, mortarAfter);
    return {
        stones,
        locate(wx, wy) {
            // the stone under the point: the panel covers the stones behind it
            const inPanel =
                panel !== undefined &&
                mod(wx - panel.x, width) < panel.w &&
                mod(wy - panel.y, height) < panel.h;
            let id = panelId;
            if (!inPanel) {
                const row = layout.findIndex((row) => wy >= row.y && wy < row.y + row.height);
                const block = layout[row].blocks.findIndex((b) => mod(wx - b.x, width) < b.width);
                id = stoneIndex[row][block];
            }
            const stone = stones[id];
            const lx = mod(wx - stone.x, width);
            const ly = mod(wy - stone.y, height);
            // distance to each edge of the stone, mortar excluded
            const dl = lx - mortarAfter;
            const dr = stone.w - lx - mortarBefore;
            const dt = ly - mortarAfter;
            const db = stone.h - ly - mortarBefore;
            const d = Math.min(dl, dr, dt, db);
            return {
                id,
                lx,
                ly,
                d,
                lit: d === dl || d === dt,
                shadowed: d === db || d === dr,
                top: d === dt,
                edges: { dl, dt, dr, db },
                panel: inPanel,
            };
        },
        anchors: () => ({
            rows: layout.map((row) => ({ x: 0, y: face(row.y) })),
            stones: layout.flatMap((row) =>
                row.blocks.map((block) => ({ x: mod(face(block.x), width), y: face(row.y) })),
            ),
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
