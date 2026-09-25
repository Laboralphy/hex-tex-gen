import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge, rangeAtAge } from '../core/age';
import { hash, hashRange } from '../core/hash';
import { createGradient, sample, shade } from '../core/palette';
import { color, DETAIL, palette, range, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { defineGenerator } from './define';

/** suffix of the descriptions of wear parameters */
const AGE = ' when unset, derived from age';

/**
 * Parameters of the parchment template. The whole patch is the sheet, its shadow
 * included: place and size it like any patch.
 */
export const parchmentSchema = z.strictObject({
    size: size().default([32, 40]).describe('own size of the sheet, its shadow included'),
    paper: z
        .strictObject({
            palette: palette()
                .default(['#b39d74', '#d2bf96', '#e6d9b8', '#f3ead3'])
                .describe('paper colors, from darkest to lightest'),
            contrast: z
                .number()
                .min(0)
                .default(0.5)
                .describe('spread of the blotches over the palette'),
            fiber: ratio()
                .default(0.08)
                .describe('random brightness variation between pixels, the paper fibers')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('the paper'),
    margin: z
        .number()
        .int()
        .min(0)
        .default(3)
        .describe('margin around the writing area, reported by the sheet anchor, in pixels')
        .meta(DETAIL),
    shadow: z
        .strictObject({
            offset: z
                .number()
                .int()
                .min(0)
                .default(1)
                .describe('shadow cast on the wall, to the bottom-right, in pixels')
                .meta(DETAIL),
            opacity: ratio().default(0.45).describe('darkness of the shadow, in [0, 1]'),
        })
        .prefault({})
        .describe('shadow of the sheet on the wall, the light coming from the top-left'),
    folds: z
        .strictObject({
            x: z.number().int().min(0).default(0).describe('number of vertical fold lines'),
            y: z.number().int().min(0).default(0).describe('number of horizontal fold lines'),
        })
        .prefault({})
        .describe('creases of a sheet once folded'),
    pins: z
        .strictObject({
            enabled: z.boolean().default(true).describe('pins at the top corners'),
            inset: z
                .number()
                .int()
                .min(0)
                .default(2)
                .describe('distance of the pins from the edges, in pixels')
                .meta(DETAIL),
            color: color().default('#3a3632').describe('pin color'),
        })
        .prefault({})
        .describe('pins holding the sheet on the wall'),
    age: ratio()
        .default(0.3)
        .describe(
            'overall aging, from 0 (blank) to 1 (ancient): sets every wear parameter left unset',
        ),
    yellowing: ratio().optional().describe(`paper turned yellow-brown, in [0, 1];${AGE}`),
    foxing: z
        .strictObject({
            density: z
                .number()
                .min(0)
                .optional()
                .describe(`brown age spots per 32 × 32 pixels;${AGE}`),
            size: range(z.number().min(0))
                .optional()
                .describe(`[min, max] spot radius, in pixels;${AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('foxing: small brown age spots'),
    edges: z
        .strictObject({
            width: z
                .number()
                .min(0)
                .optional()
                .describe(`width of the darkened edges, in pixels;${AGE}`)
                .meta(DETAIL),
            darkness: ratio().optional().describe(`darkening of the edges, in [0, 1];${AGE}`),
            roughness: z
                .number()
                .min(0)
                .optional()
                .describe(`maximum displacement of the torn outline, in pixels;${AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('edges of the sheet'),
});

export type ParchmentParams = z.output<typeof parchmentSchema>;

/**
 * Wear values of a sheet of parchment, every one resolved.
 */
export type ParchmentWear = {
    yellowing: number;
    foxing: { density: number; size: [number, number] };
    edges: { width: number; darkness: number; roughness: number };
};

/**
 * Resolves the wear values of a sheet of parchment: values set in the parameters win, the
 * others are derived from `age`.
 */
export function parchmentWear(p: ParchmentParams): ParchmentWear {
    const a = p.age;
    return {
        yellowing: p.yellowing ?? atAge(a, [0, 0.25, 0.8]),
        foxing: {
            density: p.foxing.density ?? atAge(a, [0, 1.5, 6]),
            size:
                p.foxing.size ??
                rangeAtAge(a, [
                    [0.5, 1],
                    [0.8, 2],
                    [1, 3.5],
                ]),
        },
        edges: {
            width: p.edges.width ?? atAge(a, [1, 2, 4]),
            darkness: p.edges.darkness ?? atAge(a, [0.05, 0.2, 0.55]),
            roughness: p.edges.roughness ?? atAge(a, [0.2, 0.6, 2]),
        },
    };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_FIBER = 2;
const SALT_SPOT = 3;

/** color the paper yellows towards */
const YELLOWED = Rainbow.convertToRGBA(Rainbow.parse('#9a7440'));

/**
 * A sheet of parchment pinned on a wall, blank or aged: room for decals, placed with its
 * anchors.
 */
export const parchment = defineGenerator({
    name: 'parchment',
    description: 'Sheet of parchment pinned on a wall, blank or aged, room for decals',
    schema: parchmentSchema,
    overlay: true,
    anchors: {
        sheet: 'top-left corner of the writing area, inside the margin',
        sheetCenter: 'center of the sheet',
    },
    render(p, { width, height, seed }) {
        const wear = parchmentWear(p);
        const texture = new Texture(width, height);
        const palette = createGradient(p.paper.palette);
        const offset = p.shadow.offset;
        // the sheet, its shadow being offset to the bottom-right
        const sheetWidth = Math.max(1, width - offset);
        const sheetHeight = Math.max(1, height - offset);
        const cells = (px: number) => Math.max(1, Math.round(px));
        const noiseSeed = (i: number) => Math.floor(hash(seed, SALT_NOISE, i) * 4294967296);
        // blotches scale with the sheet; the torn outline has a grain in real pixels
        const blotches = new FractalNoise({ seed: noiseSeed(0), period: 3, octaves: 4 });
        const warpX = new FractalNoise({
            seed: noiseSeed(1),
            period: [cells(width / 3), cells(height / 3)],
            octaves: 2,
        });
        const warpY = new FractalNoise({
            seed: noiseSeed(2),
            period: [cells(width / 3), cells(height / 3)],
            octaves: 2,
        });

        // foxing: spots scattered over the sheet, as many as the density asks
        const spotCount = Math.round((wear.foxing.density * sheetWidth * sheetHeight) / 1024);
        const spots = Array.from({ length: spotCount }, (_, i) => ({
            x: hash(seed, SALT_SPOT, i, 0) * sheetWidth,
            y: hash(seed, SALT_SPOT, i, 1) * sheetHeight,
            radius: hashRange(wear.foxing.size[0], wear.foxing.size[1], seed, SALT_SPOT, i, 2),
            darkness: hashRange(0.25, 0.5, seed, SALT_SPOT, i, 3),
        }));

        const roughness = wear.edges.roughness;
        // distance from a point to the torn outline of the sheet, negative outside
        const inside = (x: number, y: number, u: number, v: number) => {
            const wx = x + (warpX.sample(u, v) - 0.5) * 2 * roughness;
            const wy = y + (warpY.sample(u, v) - 0.5) * 2 * roughness;
            return Math.min(wx, wy, sheetWidth - wx, sheetHeight - wy);
        };

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const u = x / width;
                const v = y / height;
                const d = inside(x + 0.5, y + 0.5, u, v);
                if (d < 0) {
                    // the shadow: the sheet outline, offset to the bottom-right
                    if (offset > 0 && inside(x + 0.5 - offset, y + 0.5 - offset, u, v) >= 0) {
                        texture.setPixel(
                            x,
                            y,
                            Rainbow.fromRGBA({ r: 0, g: 0, b: 0, a: p.shadow.opacity }),
                        );
                    }
                    continue;
                }
                const n = blotches.sample(u, v);
                const tone = 0.5 + (n - 0.5) * 2 * p.paper.contrast;
                // edges darkened by handling and time, and foxing spots: brightness factors,
                // so that they are not bound by the palette
                let brightness = 1;
                if (d < wear.edges.width) {
                    brightness *=
                        1 - wear.edges.darkness * (1 - d / Math.max(0.001, wear.edges.width));
                }
                let foxed = 0;
                for (const spot of spots) {
                    const s = Math.hypot(x + 0.5 - spot.x, y + 0.5 - spot.y) / spot.radius;
                    if (s < 1) {
                        foxed = Math.max(foxed, spot.darkness * (1 - s * s));
                    }
                }
                let rgba = Rainbow.convertToRGBA(sample(palette, tone));
                // foxing: brown, darker in blue than in red
                rgba = {
                    r: rgba.r * brightness * (1 - foxed * 0.8),
                    g: rgba.g * brightness * (1 - foxed * 1.1),
                    b: rgba.b * brightness * (1 - foxed * 1.6),
                    a: 1,
                };
                const k = wear.yellowing;
                rgba = {
                    r: rgba.r + (YELLOWED.r * rgba.r * 1.3 - rgba.r) * k * 0.6,
                    g: rgba.g + (YELLOWED.g * rgba.g * 1.3 - rgba.g) * k * 0.6,
                    b: rgba.b + (YELLOWED.b * rgba.b * 1.3 - rgba.b) * k * 0.6,
                    a: 1,
                };
                const fiber = 1 + (hash(seed, SALT_FIBER, x, y) - 0.5) * 2 * p.paper.fiber;
                texture.setPixel(x, y, shade(Rainbow.fromRGBA(rgba), fiber));
            }
        }

        // folds: a dark crease, lit on its bottom-right side
        const isSheet = (x: number, y: number) =>
            (texture.getPixel(x, y) & 0xff) === 0xff && x < sheetWidth && y < sheetHeight;
        const crease = (x: number, y: number, lit: [number, number]) => {
            if (isSheet(x, y)) {
                texture.setPixel(x, y, shade(texture.getPixel(x, y), 0.8));
            }
            const [lx, ly] = lit;
            if (isSheet(lx, ly)) {
                texture.setPixel(lx, ly, shade(texture.getPixel(lx, ly), 1.08));
            }
        };
        for (let i = 1; i <= p.folds.x; ++i) {
            const fx = Math.round((sheetWidth * i) / (p.folds.x + 1));
            for (let y = 0; y < sheetHeight; ++y) {
                crease(fx, y, [fx + 1, y]);
            }
        }
        for (let i = 1; i <= p.folds.y; ++i) {
            const fy = Math.round((sheetHeight * i) / (p.folds.y + 1));
            for (let x = 0; x < sheetWidth; ++x) {
                crease(x, fy, [x, fy + 1]);
            }
        }

        // pins at the top corners: a dark head with a light pixel above-left
        if (p.pins.enabled) {
            const pin = Rainbow.parse(p.pins.color);
            const inset = p.pins.inset;
            for (const x of [inset, sheetWidth - 1 - inset]) {
                if (isSheet(x, inset)) {
                    texture.setPixel(x, inset, pin);
                    texture.setPixel(x + 1, inset + 1, shade(pin, 0.7));
                    if (isSheet(x - 1, inset - 1)) {
                        texture.setPixel(x - 1, inset - 1, shade(pin, 2.2));
                    }
                }
            }
        }

        texture.anchors = {
            sheet: [{ x: p.margin, y: p.margin }],
            sheetCenter: [{ x: Math.floor(sheetWidth / 2), y: Math.floor(sheetHeight / 2) }],
        };
        return texture;
    },
});
