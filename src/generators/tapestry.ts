import type { z } from 'zod';
import { HANGING_ANCHORS, hangingSchema, renderHanging } from './banner';
import { defineGenerator } from './define';

/**
 * Parameters of the tapestry template: the parameters of a banner, with the defaults of a
 * wide woven hanging, patterned and fringed.
 */
export const tapestrySchema = hangingSchema({
    noun: 'tapestry',
    size: [64, 40],
    base: 'flat',
    fabric: '#5e1418',
    stripes: [
        { color: '#c99a3a', width: 2 },
        { color: '#1c2a4a', width: 1 },
    ],
    folds: 5,
    pattern: { kind: 'lozenge', colors: ['#c99a3a', '#1c2a4a'], period: 8 },
    fringe: 3,
});

export type TapestryParams = z.output<typeof tapestrySchema>;

/**
 * A tapestry: a wide hanging of woven fabric, its field patterned with lozenges, checks,
 * strewn motifs or stripes, bordered, fringed, and hung from a rod. It fades, stains and
 * frays with age, like a banner.
 */
export const tapestry = defineGenerator({
    name: 'tapestry',
    description: 'Woven tapestry hanging from a rod: a patterned field, a border and a fringe',
    category: 'civilized',
    schema: tapestrySchema,
    overlay: true,
    anchors: HANGING_ANCHORS,
    render: renderHanging,
});
