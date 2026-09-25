import type { z } from 'zod';
import { NO_PANEL, renderWall, WALL_ANCHORS, wallSchema } from './ashlar';
import { defineGenerator } from './define';

/**
 * Parameters of the bricks template: the parameters of `ashlar`, with brick defaults.
 */
export const bricksSchema = wallSchema({
    size: [64, 64],
    rows: { count: 8, heightVariation: 0 },
    blocks: { width: [16, 16], minJointOffset: 0, bond: 'running' },
    panel: NO_PANEL,
    mortar: { size: 1, color: '#3a322b' },
    bevel: { size: 1, light: 1.25, dark: 0.7 },
    stone: {
        palette: ['#3b1f16', '#6e3a26', '#8f5236', '#a8694a'],
        contrast: 0.6,
        paletteShift: 0.12,
        noise: { period: 16, octaves: 3, persistence: 0.5 },
    },
});

export type BricksParams = z.output<typeof bricksSchema>;

/**
 * Brick wall: the ashlar engine with equal bricks in running bond. It shares every
 * parameter of `ashlar`, `age` and the wear effects included, and its anchors.
 */
export const bricks = defineGenerator({
    name: 'bricks',
    description: 'Brick wall: equal bricks in running bond, with every ashlar parameter',
    schema: bricksSchema,
    anchors: WALL_ANCHORS,
    render: renderWall,
});
