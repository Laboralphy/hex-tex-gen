import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { hashSeed } from '../core/hash';
import { color, DETAIL, ratio, size } from '../core/schema';
import { Texture, type AnchorPoint } from '../core/Texture';
import { ARCH_RISE, archDistance } from './common/arch';
import { revealShade, revealsSchema, shadeWith } from './common/reveals';
import { defineGenerator } from './define';

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
    reveals: revealsSchema(),
    open: z
        .array(z.enum(['top', 'left', 'right', 'bottom']))
        .default([])
        .describe(
            'sides without a reveal, the opening running to the edge of the patch: ["bottom"] for a doorway',
        ),
    arch: z
        .strictObject({
            shape: z
                .enum(['flat', 'round', 'pointed'])
                .default('flat')
                .describe(
                    'top of the opening: flat, a rectangle; round, a semicircular or elliptical arch; pointed, a gothic arch of two arcs meeting at its apex',
                ),
            rise: z
                .number()
                .positive()
                .max(2)
                .optional()
                .describe(
                    'height of the arch above its springing line, as a share of the width of the opening; 0.5 for round arches, 0.8 for pointed ones by default',
                ),
        })
        .prefault({})
        .describe('arch closing the top of the opening; ignored when the top is open'),
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
    category: 'architecture',
    schema: openingSchema,
    overlay: true,
    anchors: {
        opening: 'top-left corner of the back of the opening, inside the reveals',
        openingCenter: 'center of the opening',
        corners:
            'corners of the back of the opening, inside the reveals: top-left, top-right, bottom-left, bottom-right; only the bottom ones under an arch',
        spring: 'left end of the springing line, where the arch starts, inside the reveals: the top-left of the rectangle below the arch; the top-left of the back without arch',
    },
    render(p, { width, height, seed }) {
        const texture = new Texture(width, height);
        const cut = new Uint8Array(width * height);
        const back = p.back;
        const backColor = Rainbow.convertToRGBA(Rainbow.parse(back.color));
        const depth = p.depth;
        const roughness = p.edges.roughness;
        const cells = (px: number) => Math.max(1, Math.round(px));
        const warpX = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 0),
            period: [cells(width / 4), cells(height / 4)],
            octaves: 2,
        });
        const warpY = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 1),
            period: [cells(width / 4), cells(height / 4)],
            octaves: 2,
        });
        // an arch: the springing line lies its rise below the top
        const shape = p.open.includes('top') ? 'flat' : p.arch.shape;
        const spring =
            shape === 'flat' ? 0 : Math.min(height, (p.arch.rise ?? ARCH_RISE[shape]) * width);
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
                const arch =
                    shape === 'flat' ? undefined : archDistance(shape, width, spring, wx, wy);
                if (shape !== 'flat') {
                    sides.top = arch ? arch.d : Infinity;
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
                texture.setPixel(
                    x,
                    y,
                    Rainbow.fromRGBA(revealShade(p.reveals, sides, arch, depth)),
                );
            }
        }
        if (back.mode === 'cut') {
            texture.cut = cut;
        }
        // the back of the opening, inside the reveals
        const left = p.open.includes('left') ? 0 : depth;
        const top = p.open.includes('top') ? 0 : depth;
        const right = width - 1 - (p.open.includes('right') ? 0 : depth);
        const bottom = height - 1 - (p.open.includes('bottom') ? 0 : depth);
        // an arch has no top corners
        const topCorners: AnchorPoint[] =
            shape === 'flat'
                ? [
                      { x: left, y: top, corner: 'top-left' },
                      { x: right, y: top, corner: 'top-right' },
                  ]
                : [];
        texture.anchors = {
            opening: [{ x: left, y: top }],
            openingCenter: [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }],
            corners: [
                ...topCorners,
                { x: left, y: bottom, corner: 'bottom-left' },
                { x: right, y: bottom, corner: 'bottom-right' },
            ],
            spring: [{ x: left, y: shape === 'flat' ? top : Math.ceil(spring) }],
        };
        return texture;
    },
});
