import { z } from 'zod';
import { Texture } from '../../core/Texture';
import { defineGenerator } from '../define';
import type { RenderContext } from '../types';
import { WALL_ANCHORS } from './masonry';
import { rectMasonry } from './rect-masonry';
import { renderMasonry } from './render-masonry';
import { wallSchema } from './wall-schema';
import { ashlarWear } from './wear';

/**
 * Parameters of the ashlar template. "Layout" values are expressed in pixels at the
 * patch's own `size` and scale with it; "detail" values are real pixels and never scale.
 */
export const ashlarSchema = wallSchema({
    size: [64, 64],
    rows: { count: 4, heightVariation: 0.2 },
    blocks: { width: [14, 30], minJointOffset: 5, bond: 'random' },
    mortar: { size: 2, color: '#24211d' },
    bevel: { size: 1, light: 1.3, dark: 0.6 },
    stone: {
        palette: ['#34322e', '#5a5751', '#7e7a72', '#a39e94'],
        contrast: 0.9,
        paletteShift: 0.1,
        noise: { period: 8, octaves: 4, persistence: 0.6 },
    },
});

export type AshlarParams = z.output<typeof ashlarSchema>;

/**
 * Renders a wall with validated parameters: shared by `ashlar` and `bricks`.
 */
export function renderWall(p: AshlarParams, context: RenderContext): Texture {
    return renderMasonry(p, context, rectMasonry(p, context), ashlarWear(p));
}

/**
 * Dressed stone wall: rows of rectangular stones of random width, like the castle walls
 * of Hexen.
 */
export const ashlar = defineGenerator({
    name: 'ashlar',
    description: 'Dressed stone wall: rows of stones of random width',
    category: 'surface',
    schema: ashlarSchema,
    anchors: WALL_ANCHORS,
    render: renderWall,
});
