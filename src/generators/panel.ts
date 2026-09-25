import type { z } from 'zod';
import { renderWall, WALL_ANCHORS, wallSchema } from './ashlar';
import { defineGenerator } from './define';

/**
 * Parameters of the panel template: the parameters of `ashlar`, with the panel enabled.
 */
export const panelSchema = wallSchema({
    size: [64, 64],
    rows: { count: 4, heightVariation: 0.2 },
    blocks: { width: [14, 30], minJointOffset: 5, bond: 'random' },
    panel: { enabled: true, width: 36, height: 30, snap: true, bevel: 2, shade: 1.08 },
    mortar: { size: 2, color: '#24211d' },
    bevel: { size: 1, light: 1.3, dark: 0.6 },
    stone: {
        palette: ['#34322e', '#5a5751', '#7e7a72', '#a39e94'],
        contrast: 0.9,
        paletteShift: 0.1,
        noise: { period: 8, octaves: 4, persistence: 0.6 },
    },
});

export type PanelParams = z.output<typeof panelSchema>;

/**
 * Ashlar wall with a large stone slab, centered by default: room for an inscription or a
 * switch, placed with the `panel` or `panelCenter` anchors.
 */
export const panel = defineGenerator({
    name: 'panel',
    description: 'Ashlar wall with a large stone slab, room for an inscription or a switch',
    schema: panelSchema,
    anchors: WALL_ANCHORS,
    render: renderWall,
});
