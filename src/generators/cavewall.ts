import type { z } from 'zod';
import { defineGenerator } from './define';
import { renderStoneField, STONE_FIELD_ANCHORS, stoneFieldSchema } from './fieldstone';

/**
 * Parameters of the cavewall template: the parameters of `fieldstone`, with the defaults
 * of a cave: a heap of rounded boulders of every size, with dark crevices between them.
 */
export const cavewallSchema = stoneFieldSchema({
    size: [64, 64],
    mortar: { size: 2, color: '#15120f' },
    bevel: { size: 0, light: 1.2, dark: 0.7 },
    stone: {
        palette: ['#2b2723', '#4f4840', '#776d60', '#9d917f'],
        contrast: 0.8,
        paletteShift: 0.25,
        noise: { period: 6, octaves: 4, persistence: 0.6 },
    },
    stones: { cells: [4, 4], layout: 'heap', jitter: 1, variation: 0.7, relief: 0.9 },
});

export type CavewallParams = z.output<typeof cavewallSchema>;

/**
 * A cave wall: boulders of every size heaped at random, rounded and lit from the
 * top-left, with dark crevices between them. It is a `fieldstone` with other defaults:
 * every fieldstone parameter applies, wear and moss included.
 */
export const cavewall = defineGenerator({
    name: 'cavewall',
    description: 'Cave wall: a chaotic heap of rounded boulders of every size',
    category: 'surface',
    schema: cavewallSchema,
    anchors: STONE_FIELD_ANCHORS,
    render: renderStoneField,
});
