import { z } from 'zod';
import { size } from '../core/schema';
import type { Texture } from '../core/Texture';
import { ashlarWear, masonryShape, renderMasonry, type AshlarWear, type Masonry } from './ashlar';
import { defineGenerator } from './define';
import type { RenderContext } from './types';

/**
 * Parameters of the stoneslab template: the stone parameters of `ashlar`, for a single
 * large stone. The whole patch is the slab: place and size it like any patch.
 */
export const stoneslabSchema = z.strictObject({
    size: size()
        .default([32, 24])
        .describe(
            'own size of the slab, its mortar bed included; layout values are expressed at this size',
        ),
    ...masonryShape({
        mortar: { size: 2, color: '#24211d' },
        bevel: { size: 2, light: 1.3, dark: 0.6 },
        stone: {
            palette: ['#3a3833', '#615d56', '#86817a', '#aba59b'],
            contrast: 0.9,
            paletteShift: 0.1,
            noise: { period: 4, octaves: 4, persistence: 0.6 },
        },
    }),
});

export type StoneslabParams = z.output<typeof stoneslabSchema>;

/** anchors of the slab */
const SLAB_ANCHORS = {
    slab: 'top-left corner of the face of the slab, inside the mortar',
    slabCenter: 'center of the face of the slab: room for an inscription or a switch',
};

/**
 * A single stone filling the patch, inside a bed of mortar `mortar.size` pixels wide on
 * every side.
 */
function slabMasonry(p: StoneslabParams, { width, height }: RenderContext): Masonry {
    const m = p.mortar.size;
    return {
        stones: [{ row: 0, block: 0, x: 0, y: 0, w: width, h: height }],
        locate(lx, ly) {
            const dl = lx - m;
            const dr = width - lx - m;
            const dt = ly - m;
            const db = height - ly - m;
            const d = Math.min(dl, dr, dt, db);
            return {
                id: 0,
                lx,
                ly,
                d,
                lit: d === dl || d === dt,
                shadowed: d === db || d === dr,
                top: d === dt,
                edges: { dl, dt, dr, db },
            };
        },
        anchors: () => ({
            slab: [{ x: m, y: m }],
            slabCenter: [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }],
        }),
    };
}

/**
 * Resolves the wear values of a slab: those of an `ashlar` stone 16 pixels high,
 * whatever the size of the slab, so that a larger slab is not more worn.
 */
export function stoneslabWear(p: StoneslabParams): AshlarWear {
    return ashlarWear({
        ...p,
        size: [p.size[0], 16],
        rows: { count: 1, heightVariation: 0 },
    });
}

/**
 * Renders a slab with validated parameters.
 */
function renderSlab(p: StoneslabParams, context: RenderContext): Texture {
    return renderMasonry(p, context, slabMasonry(p, context), stoneslabWear(p));
}

/**
 * A large stone slab set in a bed of mortar, laid over any wall, of stone, bricks, wood
 * or metal: room for an inscription or a switch. It ages like the stones of `ashlar`.
 */
export const stoneslab = defineGenerator({
    name: 'stoneslab',
    description:
        'Large stone slab set in mortar, over any wall: room for an inscription or a switch',
    category: 'architecture',
    schema: stoneslabSchema,
    anchors: SLAB_ANCHORS,
    render: renderSlab,
});
