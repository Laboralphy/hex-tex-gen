import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow, type ColorRGBAStruct } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge, rangeAtAge } from '../core/age';
import { hash, hashRange, hashSeed } from '../core/hash';
import { shade } from '../core/palette';
import {
    ageParam,
    color,
    DETAIL,
    FROM_AGE,
    LAYOUT,
    range,
    ratio,
    shadowGroup,
    size,
} from '../core/schema';
import { Texture } from '../core/Texture';
import { fadeColor } from './common/fading';
import { defineGenerator } from './define';
import type { RenderContext } from './types';

/** a woven pattern of a hanging */
export type HangingPattern = {
    kind: 'none' | 'lozenge' | 'checky' | 'semy' | 'stripes';
    colors: [string, string];
    period: number;
};

/**
 * Defaults of the parameters that differ between hangings: `banner` and `tapestry`.
 */
export type HangingDefaults = {
    /** what the hanging is called in descriptions */
    noun: string;
    size: [number, number];
    base: 'flat' | 'point' | 'swallowtail' | 'tails';
    fabric: string;
    stripes: { color: string; width: number }[];
    folds: number;
    pattern: HangingPattern;
    fringe: number;
};

/**
 * Parameters of a hanging of fabric, with the given defaults: `banner` and `tapestry`
 * share them. The whole patch is the hanging, its rod and its shadow: place it a few
 * percent from the top of a wall, and it hangs to its own height.
 */
export const hangingSchema = (d: HangingDefaults) =>
    z.strictObject({
        size: size()
            .default(d.size)
            .describe(`own size of the ${d.noun}, its rod and its shadow included`),
        shape: z
            .strictObject({
                base: z
                    .enum(['flat', 'point', 'swallowtail', 'tails'])
                    .default(d.base)
                    .describe(
                        'lower end: flat; point, a triangle; swallowtail, forked like an oriflamme; tails, several points like a gonfalon',
                    ),
                depth: z
                    .number()
                    .min(0)
                    .max(1)
                    .default(0.2)
                    .describe(`height of the shaped lower end, in fraction of the ${d.noun} height`)
                    .meta(LAYOUT),
                tails: z
                    .number()
                    .int()
                    .min(1)
                    .default(3)
                    .describe('number of points of the tails base'),
            })
            .prefault({})
            .describe('shape of the banner'),
        fabric: z
            .strictObject({
                color: color().default(d.fabric).describe('color of the fabric'),
                weave: ratio()
                    .default(0.06)
                    .describe('random brightness variation between pixels, the weave')
                    .meta(DETAIL),
            })
            .prefault({})
            .describe('the fabric'),
        border: z
            .strictObject({
                inset: z
                    .number()
                    .int()
                    .min(0)
                    .default(1)
                    .describe('distance of the first stripe from the edge, in pixels')
                    .meta(DETAIL),
                stripes: z
                    .array(
                        z.strictObject({
                            color: color().describe('stripe color'),
                            width: z
                                .number()
                                .int()
                                .min(1)
                                .describe('stripe width, in pixels')
                                .meta(DETAIL),
                        }),
                    )
                    .default(d.stripes)
                    .describe('stripes along the sides and the lower end, from the edge inwards'),
            })
            .prefault({})
            .describe(`stripes bordering the ${d.noun}`),
        pattern: z
            .strictObject({
                kind: z
                    .enum(['none', 'lozenge', 'checky', 'semy', 'stripes'])
                    .default(d.pattern.kind)
                    .describe(
                        'woven into the field: none; lozenge, a lattice of diamonds; checky, a checkerboard; semy, small crosses strewn on a staggered grid; stripes, vertical bands',
                    ),
                colors: z
                    .tuple([color(), color()])
                    .default(d.pattern.colors)
                    .describe(
                        'colors of the pattern: its lines, squares or motifs, and their dots',
                    ),
                period: z
                    .number()
                    .positive()
                    .default(d.pattern.period)
                    .describe('size of one repeat of the pattern, in pixels at own size')
                    .meta(LAYOUT),
            })
            .prefault({})
            .describe('pattern woven into the field, inside the border'),
        fringe: z
            .number()
            .int()
            .min(0)
            .default(d.fringe)
            .describe('length of the fringe hanging from a flat lower end, in pixels; 0 for none')
            .meta(DETAIL),
        folds: z
            .strictObject({
                count: z
                    .number()
                    .min(0)
                    .default(d.folds)
                    .describe(`number of vertical folds across the ${d.noun}`)
                    .meta(LAYOUT),
                depth: ratio().default(0.25).describe('shading of the folds, in [0, 1]'),
            })
            .prefault({})
            .describe('soft vertical folds of the hanging fabric'),
        rod: z
            .strictObject({
                enabled: z.boolean().default(true).describe('a rod across the top'),
                size: z
                    .number()
                    .int()
                    .min(1)
                    .default(2)
                    .describe('rod thickness, in pixels')
                    .meta(DETAIL),
                overhang: z
                    .number()
                    .int()
                    .min(0)
                    .default(2)
                    .describe('length of the rod beyond each side of the fabric, in pixels')
                    .meta(DETAIL),
                color: color().default('#4a3320').describe('rod color'),
            })
            .prefault({})
            .describe(`rod the ${d.noun} hangs from`),
        shadow: shadowGroup(d.noun, 0.4),
        age: ageParam({ noun: 'aging', old: 'tattered' }),
        fading: ratio().optional().describe(`colors faded by light, in [0, 1];${FROM_AGE}`),
        stains: ratio().optional().describe(`coverage of the stains, in [0, 1];${FROM_AGE}`),
        rips: z
            .strictObject({
                count: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe(`number of notches torn into the edges;${FROM_AGE}`),
                depth: range(z.number().min(0))
                    .optional()
                    .describe(`[min, max] depth of the notches, in pixels;${FROM_AGE}`)
                    .meta(DETAIL),
                roughness: z
                    .number()
                    .min(0)
                    .optional()
                    .describe(`maximum displacement of the frayed outline, in pixels;${FROM_AGE}`)
                    .meta(DETAIL),
            })
            .prefault({})
            .describe('torn edges'),
        holes: z.number().min(0).optional().describe(`moth holes per 32 × 32 pixels;${FROM_AGE}`),
    });

/**
 * Parameters of the banner template.
 */
export const bannerSchema = hangingSchema({
    noun: 'banner',
    size: [24, 56],
    base: 'flat',
    fabric: '#8a1a1a',
    stripes: [{ color: '#d4a53a', width: 2 }],
    folds: 3,
    pattern: { kind: 'none', colors: ['#d4a53a', '#1c1c3a'], period: 8 },
    fringe: 0,
});

export type BannerParams = z.output<typeof bannerSchema>;

/**
 * Wear values of a banner, every one resolved.
 */
export type BannerWear = {
    fading: number;
    stains: number;
    rips: { count: number; depth: [number, number]; roughness: number };
    holes: number;
};

/**
 * Resolves the wear values of a banner: values set in the parameters win, the others are
 * derived from `age`.
 */
export function bannerWear(p: BannerParams): BannerWear {
    const a = p.age;
    return {
        fading: p.fading ?? atAge(a, [0, 0.1, 0.5]),
        stains: p.stains ?? atAge(a, [0, 0.1, 0.4]),
        rips: {
            count: p.rips.count ?? Math.round(atAge(a, [0, 1, 6])),
            depth:
                p.rips.depth ??
                rangeAtAge(a, [
                    [1, 2],
                    [2, 4],
                    [3, 8],
                ]),
            roughness: p.rips.roughness ?? atAge(a, [0.1, 0.4, 1.2]),
        },
        holes: p.holes ?? atAge(a, [0, 0, 3]),
    };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_WEAVE = 2;
const SALT_RIP = 3;
const SALT_HOLE = 4;

/** color of the stains */
const STAIN = { r: 0.22, g: 0.16, b: 0.1 };

/** anchors of hangings */
export const HANGING_ANCHORS = {
    field: 'top-left corner of the field, inside the border, below the rod',
    emblem: 'center of the field, above the shaped lower end: room for an emblem',
};

/**
 * Color of a woven pattern at a point of the field, or undefined for the fabric.
 * @param fx horizontal position in the field, in pixels at own size
 * @param fy vertical position in the field, in pixels at own size
 */
function patternAt(
    pattern: HangingPattern,
    colors: [ColorRGBAStruct, ColorRGBAStruct],
    fx: number,
    fy: number,
): ColorRGBAStruct | undefined {
    const period = pattern.period;
    const a = fx / period;
    const b = fy / period;
    const frac = (t: number) => t - Math.floor(t);
    switch (pattern.kind) {
        case 'lozenge': {
            // diamonds: lines where the distance to the cell center reaches half a cell
            const s = Math.abs(frac(a) - 0.5) + Math.abs(frac(b) - 0.5);
            if (Math.abs(s - 0.5) * period < 0.6) {
                return colors[0];
            }
            return s * period < 1.1 ? colors[1] : undefined;
        }
        case 'checky':
            return (Math.floor(a) + Math.floor(b)) % 2 === 0 ? colors[0] : undefined;
        case 'semy': {
            // small crosses, every other row shifted by half a cell
            const row = Math.floor(b);
            const lx = (frac(a + (row % 2) * 0.5) - 0.5) * period;
            const ly = (frac(b) - 0.5) * period;
            if (Math.abs(lx) < 0.6 && Math.abs(ly) < 0.6) {
                return colors[1];
            }
            const cross =
                (Math.abs(lx) < 0.6 && Math.abs(ly) < 1.6) ||
                (Math.abs(ly) < 0.6 && Math.abs(lx) < 1.6);
            return cross ? colors[0] : undefined;
        }
        case 'stripes':
            return frac(a) < 0.5 ? colors[0] : undefined;
        default:
            return undefined;
    }
}

/**
 * Renders a hanging of fabric with validated parameters: shared by `banner` and
 * `tapestry`.
 */
export function renderHanging(p: BannerParams, { width, height, seed }: RenderContext): Texture {
    const wear = bannerWear(p);
    const texture = new Texture(width, height);
    const offset = p.shadow.offset;
    const rod = p.rod.enabled ? p.rod : undefined;
    const overhang = rod ? rod.overhang : 0;
    // the fabric, between the rod ends, its shadow being offset to the bottom-right
    const left = overhang;
    const right = Math.max(left + 1, width - offset - overhang);
    const top = rod ? Math.floor(rod.size / 2) : 0;
    // a fringe hangs from a flat lower end, below the fabric
    const fringe = p.shape.base === 'flat' ? p.fringe : 0;
    const bottom = Math.max(top + 1, height - offset - fringe);
    const w = right - left;
    const h = bottom - top;
    const depth = p.shape.depth * h;
    const base = p.shape.base;
    const tails = p.shape.tails;

    // lower edge of the fabric at a given x, and its slope
    const bottomAt = (x: number): number => {
        const t = (x - left) / w;
        switch (base) {
            case 'point':
                return bottom - depth * Math.abs(2 * t - 1);
            case 'swallowtail':
                return bottom - depth * (1 - Math.abs(2 * t - 1));
            case 'tails': {
                const f = (t * tails) % 1;
                return bottom - depth * Math.abs(2 * f - 1);
            }
            default:
                return bottom;
        }
    };
    const slope =
        base === 'flat' ? 0 : base === 'tails' ? (2 * depth * tails) / w : (2 * depth) / w;
    const slopeFactor = Math.sqrt(1 + slope * slope);

    const cells = (px: number) => Math.max(1, Math.round(px));
    const warpX = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 0),
        period: [cells(width / 3), cells(height / 3)],
        octaves: 2,
    });
    const warpY = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 1),
        period: [cells(width / 3), cells(height / 3)],
        octaves: 2,
    });
    // stains scale with the banner
    const stainNoise = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 2),
        period: 3,
        octaves: 3,
    });

    // rips: notches torn into the sides and the lower end
    const rips = Array.from({ length: wear.rips.count }, (_, i) => {
        const side = ['left', 'right', 'bottom', 'bottom'][
            Math.floor(hash(seed, SALT_RIP, i, 0) * 4)
        ];
        return {
            side,
            at: hashRange(0.15, 0.85, seed, SALT_RIP, i, 1),
            depth: hashRange(wear.rips.depth[0], wear.rips.depth[1], seed, SALT_RIP, i, 2),
            width: hashRange(0.6, 1.4, seed, SALT_RIP, i, 3),
        };
    });
    const holeCount = Math.round((wear.holes * w * h) / 1024);
    const holes = Array.from({ length: holeCount }, (_, i) => ({
        x: left + w * hashRange(0.15, 0.85, seed, SALT_HOLE, i, 0),
        y: top + h * hashRange(0.1, 0.8, seed, SALT_HOLE, i, 1),
        radius: hashRange(0.6, 1.4, seed, SALT_HOLE, i, 2),
    }));

    const roughness = wear.rips.roughness;
    // distance from a point to the outline of the fabric, negative outside
    // distance from a point to the intact outline: the border stripes follow it, so
    // that tears and fraying cut through them
    const intact = (x: number, y: number) =>
        Math.min(x - left, right - x, (bottomAt(x) - y) / slopeFactor);
    const distance = (x: number, y: number, u: number, v: number) => {
        const wx = x + (warpX.sample(u, v) - 0.5) * 2 * roughness;
        const wy = y + (warpY.sample(u, v) - 0.5) * 2 * roughness;
        const dl = wx - left;
        const dr = right - wx;
        const db = (bottomAt(wx) - wy) / slopeFactor;
        let d = Math.min(dl, dr, db, wy - top + 1000);
        if (wy < top) {
            return -1;
        }
        for (const rip of rips) {
            // a notch: a triangle cut from the edge, as deep as the rip
            const along = rip.side === 'bottom' ? (wx - left) / w : (wy - top) / h;
            const edge = rip.side === 'left' ? dl : rip.side === 'right' ? dr : db;
            const spread = Math.abs(along - rip.at) * (rip.side === 'bottom' ? w : h);
            if (edge < rip.depth - spread / rip.width) {
                d = Math.min(d, edge - (rip.depth - spread / rip.width));
            }
        }
        return d;
    };

    const fabric = Rainbow.convertToRGBA(Rainbow.parse(p.fabric.color));
    const stripes = p.border.stripes.map((s) => ({
        ...s,
        rgba: Rainbow.convertToRGBA(Rainbow.parse(s.color)),
    }));
    const shadowColor = Rainbow.fromRGBA({ r: 0, g: 0, b: 0, a: p.shadow.opacity });
    const patternColors = p.pattern.colors.map((c) => Rainbow.convertToRGBA(Rainbow.parse(c))) as [
        ColorRGBAStruct,
        ColorRGBAStruct,
    ];
    const sx = width / p.size[0];
    const sy = height / p.size[1];
    const border = (d: number) => {
        let from = p.border.inset;
        for (const stripe of stripes) {
            if (d >= from && d < from + stripe.width) {
                return stripe.rgba;
            }
            from += stripe.width;
        }
        return undefined;
    };

    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const u = x / width;
            const v = y / height;
            const d = distance(x + 0.5, y + 0.5, u, v);
            const inHole = holes.some(
                (hole) => Math.hypot(x + 0.5 - hole.x, y + 0.5 - hole.y) < hole.radius,
            );
            if (d < 0 || inHole) {
                // the shadow: the outline, offset to the bottom-right
                if (
                    offset > 0 &&
                    distance(x + 0.5 - offset, y + 0.5 - offset, u, v) >= 0 &&
                    !inHole
                ) {
                    texture.setPixel(x, y, shadowColor);
                }
                continue;
            }
            let rgba =
                border(intact(x + 0.5, y + 0.5)) ??
                patternAt(p.pattern, patternColors, (x + 0.5 - left) / sx, (y + 0.5 - top) / sy) ??
                fabric;
            // folds: soft vertical waves of light and shadow
            const fold =
                1 +
                p.folds.depth *
                    0.5 *
                    Math.sin((2 * Math.PI * (x - left) * p.folds.count) / w + 0.6);
            const weave = 1 + (hash(seed, SALT_WEAVE, x, y) - 0.5) * 2 * p.fabric.weave;
            const k = fold * weave;
            rgba = { r: rgba.r * k, g: rgba.g * k, b: rgba.b * k, a: 1 };
            // fading, then stains
            rgba = { ...fadeColor(rgba, wear.fading), a: 1 };
            if (wear.stains > 0) {
                const n = stainNoise.sample(u, v);
                const s = Math.max(0, (n - (1 - wear.stains)) / Math.max(0.01, wear.stains));
                const m = Math.min(0.6, s * 0.8);
                rgba = {
                    r: rgba.r + (STAIN.r - rgba.r) * m,
                    g: rgba.g + (STAIN.g - rgba.g) * m,
                    b: rgba.b + (STAIN.b - rgba.b) * m,
                    a: 1,
                };
            }
            texture.setPixel(x, y, Rainbow.fromRGBA(rgba));
        }
    }

    // the fringe: threads every other pixel, hanging where the fabric above is whole
    if (fringe > 0) {
        const thread = stripes[0]?.rgba ?? fabric;
        for (let x = Math.ceil(left); x < right; x += 2) {
            if ((texture.getPixel(x, bottom - 1) & 0xff) !== 255) {
                continue;
            }
            const length = fringe - (hash(seed, SALT_WEAVE, x, -1) < 0.35 ? 1 : 0);
            for (let t = 0; t < length; ++t) {
                const y = bottom + t;
                if (offset > 0 && (texture.getPixel(x + offset, y + offset) & 0xff) === 0) {
                    texture.setPixel(x + offset, y + offset, shadowColor);
                }
                const rgba = fadeColor(thread, wear.fading);
                texture.setPixel(
                    x,
                    y,
                    shade(Rainbow.fromRGBA({ ...rgba, a: 1 }), t === 0 ? 0.8 : 1),
                );
            }
        }
    }

    // the rod across the top, over the fabric, lit on its upper side, and its shadow
    if (rod) {
        const rodColor = Rainbow.parse(rod.color);
        const rodRight = right + overhang;
        for (let y = 0; y < rod.size; ++y) {
            for (let x = 0; x < rodRight; ++x) {
                if (offset > 0) {
                    const sx = x + offset;
                    const sy = y + offset;
                    if (sy >= rod.size && (texture.getPixel(sx, sy) & 0xff) === 0) {
                        texture.setPixel(sx, sy, shadowColor);
                    }
                }
            }
        }
        for (let y = 0; y < rod.size; ++y) {
            for (let x = 0; x < rodRight; ++x) {
                const light = y === 0 ? 1.35 : y === rod.size - 1 ? 0.75 : 1;
                const end = x === 0 || x === rodRight - 1 ? 0.8 : 1;
                texture.setPixel(x, y, shade(rodColor, light * end));
            }
        }
    }

    const borderWidth = p.border.inset + p.border.stripes.reduce((sum, s) => sum + s.width, 0);
    const fieldTop = Math.max(top, rod ? rod.size : 0) + borderWidth;
    const fieldBottom = bottom - (base === 'flat' ? borderWidth : depth);
    texture.anchors = {
        field: [{ x: left + borderWidth, y: fieldTop }],
        emblem: [
            {
                x: Math.floor(left + w / 2),
                y: Math.floor((fieldTop + Math.max(fieldTop, fieldBottom)) / 2),
            },
        ],
    };
    return texture;
}

/**
 * A banner of fabric hanging from a rod: flat, pointed, swallowtailed like an oriflamme,
 * or with tails like a gonfalon, bordered with stripes, and tattered with age.
 */
export const banner = defineGenerator({
    name: 'banner',
    description:
        'Banner of fabric hanging from a rod, with a shaped lower end and bordering stripes',
    category: 'civilized',
    schema: bannerSchema,
    overlay: true,
    anchors: HANGING_ANCHORS,
    render: renderHanging,
});
