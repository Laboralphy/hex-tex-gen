import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { hash } from '../core/hash';
import { color, DETAIL, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { defineGenerator } from './define';

/** shading of a reveal: negative darkens, positive lightens */
const shading = () => z.number().min(-1).max(1);

/**
 * Parameters of the opening template. The whole patch is the opening: place and size it
 * like any patch.
 */
export const openingSchema = z.strictObject({
    size: size().default([32, 32]).describe('own size of the opening, reveals included'),
    depth: z
        .number()
        .int()
        .min(0)
        .default(4)
        .describe('width of the reveals, the inner faces of the cut, in pixels')
        .meta(DETAIL),
    reveals: z
        .strictObject({
            top: shading().default(-0.6).describe('shading of the top reveal, in shadow'),
            left: shading().default(-0.45).describe('shading of the left reveal, in shadow'),
            right: shading().default(0.2).describe('shading of the right reveal, lit'),
            bottom: shading().default(0.3).describe('shading of the bottom reveal (the sill), lit'),
            falloff: ratio()
                .default(0.2)
                .describe('extra darkness of the reveals towards the back, in [0, 1]'),
        })
        .prefault({})
        .describe(
            'inner faces of the cut: the wall below, shaded; from -1 (black) to 1 (white), the light coming from the top-left',
        ),
    open: z
        .array(z.enum(['top', 'left', 'right', 'bottom']))
        .default([])
        .describe(
            'sides without a reveal, the opening running to the edge of the patch: ["bottom"] for a doorway',
        ),
    back: z
        .strictObject({
            mode: z
                .enum(['cut', 'shade', 'color'])
                .default('cut')
                .describe(
                    'cut: erased, transparent in the texture; shade: the wall below, darkened; color: an opaque color',
                ),
            shade: ratio().default(0.7).describe('darkening of the wall below, in shade mode'),
            color: color().default('#0a0806').describe('color of the back, in color mode'),
        })
        .prefault({})
        .describe('back of the opening'),
    edges: z
        .strictObject({
            roughness: z
                .number()
                .min(0)
                .default(0)
                .describe('maximum displacement of the outline of the opening, in pixels')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('irregularity of the outline'),
});

export type OpeningParams = z.output<typeof openingSchema>;

const SALT_NOISE = 1;

/**
 * A rectangular opening dug into the wall below: shaded reveals, and a back that is cut
 * out, darkened or filled. Windows, bars or fences placed afterwards on its anchors fill
 * the hole.
 */
export const opening = defineGenerator({
    name: 'opening',
    description: 'Rectangular opening dug into the wall below, for windows, bars or arches',
    schema: openingSchema,
    overlay: true,
    anchors: {
        opening: 'top-left corner of the back of the opening, inside the reveals',
        openingCenter: 'center of the opening',
    },
    render(p, { width, height, seed }) {
        const texture = new Texture(width, height);
        const cut = new Uint8Array(width * height);
        const back = p.back;
        const backColor = Rainbow.convertToRGBA(Rainbow.parse(back.color));
        const depth = p.depth;
        const roughness = p.edges.roughness;
        const cells = (px: number) => Math.max(1, Math.round(px));
        const noiseSeed = (i: number) => Math.floor(hash(seed, SALT_NOISE, i) * 4294967296);
        const warpX = new FractalNoise({
            seed: noiseSeed(0),
            period: [cells(width / 4), cells(height / 4)],
            octaves: 2,
        });
        const warpY = new FractalNoise({
            seed: noiseSeed(1),
            period: [cells(width / 4), cells(height / 4)],
            octaves: 2,
        });
        // translucent black darkens the wall below, translucent white lightens it
        const shadeWith = (value: number) =>
            value < 0
                ? { r: 0, g: 0, b: 0, a: Math.min(1, -value) }
                : { r: 1, g: 1, b: 1, a: Math.min(1, value) };

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const u = x / width;
                const v = y / height;
                const wx = x + 0.5 + (warpX.sample(u, v) - 0.5) * 2 * roughness;
                const wy = y + 0.5 + (warpY.sample(u, v) - 0.5) * 2 * roughness;
                // distance to each edge of the opening; open sides have no reveal
                const sides = {
                    top: wy,
                    left: wx,
                    right: width - wx,
                    bottom: height - wy,
                };
                for (const side of p.open) {
                    sides[side] = Infinity;
                }
                const d = Math.min(sides.top, sides.left, sides.right, sides.bottom);
                if (d < 0) {
                    continue;
                }
                if (d >= depth) {
                    if (back.mode === 'cut') {
                        cut[y * width + x] = 1;
                    } else if (back.mode === 'shade') {
                        texture.setPixel(x, y, Rainbow.fromRGBA(shadeWith(-back.shade)));
                    } else {
                        texture.setPixel(x, y, Rainbow.fromRGBA({ ...backColor, a: 1 }));
                    }
                    continue;
                }
                // reveals meet at mitred corners: the nearest edge gives the face
                const side = (Object.keys(sides) as (keyof typeof sides)[]).find(
                    (key) => sides[key] === d,
                )!;
                const value = p.reveals[side] - p.reveals.falloff * (d / Math.max(1, depth));
                texture.setPixel(x, y, Rainbow.fromRGBA(shadeWith(value)));
            }
        }
        if (back.mode === 'cut') {
            texture.cut = cut;
        }
        texture.anchors = {
            opening: [
                {
                    x: p.open.includes('left') ? 0 : depth,
                    y: p.open.includes('top') ? 0 : depth,
                },
            ],
            openingCenter: [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }],
        };
        return texture;
    },
});
