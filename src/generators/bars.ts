import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge, rangeAtAge } from '../core/age';
import { hash, hashRange, hashSeed } from '../core/hash';
import { clamp, mod } from '../core/math';
import { createGradient, sample, shade } from '../core/palette';
import {
    ageParam,
    DETAIL,
    FROM_AGE,
    LAYOUT,
    palette,
    range,
    ratio,
    shadowGroup,
    size,
} from '../core/schema';
import { Texture, type AnchorPoint } from '../core/Texture';
import { dentsGroup, drawDents, type DentsWear } from './common/dents';
import { metalWearBase, rustGroup, tarnishParam, type MetalWearBase } from './common/metal-wear';
import { MetalWeathering } from './common/MetalWeathering';
import { METAL_PALETTE } from './common/palettes';
import { defineGenerator } from './define';

/**
 * Parameters of the bars template. The whole patch is the barred area: the bars run from
 * its top to its bottom, embedded in the wall around it.
 */
export const barsSchema = z.strictObject({
    size: size().default([32, 48]).describe('own size of the barred area, in pixels'),
    bars: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(1)
                .default(5)
                .describe('number of bars across the patch, evenly spaced')
                .meta(LAYOUT),
            thickness: z
                .number()
                .int()
                .min(1)
                .default(2)
                .describe('width of a bar, in pixels')
                .meta(DETAIL),
            profile: z
                .enum(['round', 'square'])
                .default('round')
                .describe(
                    'round: a rod, its highlight a third across; square: a flat face between a lit and a dark edge',
                ),
        })
        .prefault({})
        .describe('vertical bars, lit from the top-left'),
    rails: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(0)
                .default(1)
                .describe('number of horizontal rails, evenly spaced; 0 for none')
                .meta(LAYOUT),
            thickness: z
                .number()
                .int()
                .min(1)
                .default(2)
                .describe('height of a rail, in pixels')
                .meta(DETAIL),
            rivets: z.boolean().default(true).describe('a rivet where each bar crosses a rail'),
        })
        .prefault({})
        .describe('horizontal flat rails holding the bars'),
    metal: z
        .strictObject({
            palette: palette()
                .default(METAL_PALETTE)
                .describe('metal colors, from darkest to lightest'),
            grain: ratio()
                .default(0.04)
                .describe('random brightness variation between pixels, in [0, 1]')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('metal of the bars'),
    // no shadow by default: behind the bars, a cut-out opening has nothing to cast it on
    shadow: shadowGroup('bars', 0.45, 0).describe(
        'shadow of the bars on the back of what they close, the light coming from the top-left; none by default, set an offset over an opening whose back is shaded or colored',
    ),
    age: ageParam(),
    rust: rustGroup('share of the bars rusted, spreading from their broken ends'),
    tarnish: tarnishParam(),
    dents: dentsGroup(),
    bends: z
        .strictObject({
            ratio: ratio().optional().describe(`ratio of bent bars, in [0, 1];${FROM_AGE}`),
            amount: z
                .number()
                .min(0)
                .optional()
                .describe(`maximum sideways bulge of a bent bar, in pixels;${FROM_AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('bars bent sideways in a smooth bulge'),
    broken: z
        .strictObject({
            ratio: ratio()
                .optional()
                .describe(`ratio of broken bars, a part of them missing, in [0, 1];${FROM_AGE}`),
            length: range(z.number().min(0))
                .optional()
                .describe(`[min, max] length of the missing part;${FROM_AGE}`)
                .meta(LAYOUT),
        })
        .prefault({})
        .describe(
            'broken bars: a part is missing between two rails, or the bar is gone down to an edge of the patch',
        ),
});

export type BarsParams = z.output<typeof barsSchema>;

/**
 * Wear values of bars, every one resolved.
 */
export type BarsWear = Omit<MetalWearBase, 'scratches'> & {
    dents: DentsWear;
    bends: { ratio: number; amount: number };
    broken: { ratio: number; length: [number, number] };
};

/**
 * Resolves the wear values of bars: values set in the parameters win, the others are
 * derived from `age`.
 */
export function barsWear(p: BarsParams): BarsWear {
    const a = p.age;
    const { rust, tarnish } = metalWearBase(p, {
        coverage: [0, 0.1, 0.6],
        streaks: [0, 0.25, 0.7],
    });
    return {
        rust,
        tarnish,
        dents: {
            density: p.dents.density ?? atAge(a, [0, 1, 6]),
            size:
                p.dents.size ??
                rangeAtAge(a, [
                    [1, 1.5],
                    [1, 2],
                    [1.5, 3],
                ]),
        },
        bends: {
            ratio: p.bends.ratio ?? atAge(a, [0, 0.1, 0.5]),
            amount: p.bends.amount ?? atAge(a, [0.5, 1, 2.5]),
        },
        broken: {
            ratio: p.broken.ratio ?? atAge(a, [0, 0.05, 0.4]),
            length:
                p.broken.length ??
                rangeAtAge(a, [
                    [4, 8],
                    [4, 10],
                    [8, 24],
                ]),
        },
    };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_GRAIN = 2;
const SALT_BEND = 3;
const SALT_BREAK = 4;
const SALT_DENT = 5;
const SALT_STREAK = 6;

/** pixels, from a broken end, over which rust spreads from the break */
const BREAK_RUST = 4;

/**
 * Palette position of a column of a bar, lit from the left.
 */
function barTone(
    profile: BarsParams['bars']['profile'],
    column: number,
    thickness: number,
): number {
    if (thickness === 1) {
        return 0.6;
    }
    if (profile === 'square') {
        return column === 0 ? 0.8 : column === thickness - 1 ? 0.3 : 0.55;
    }
    // a rod: its highlight a third across, falling off towards both edges
    const t = (column + 0.5) / thickness;
    return Math.max(0.15, 0.85 - 1.1 * Math.abs(t - 0.3));
}

/** the missing part of a broken bar, in pixels; rows in [top, bottom) are missing */
type Gap = { top: number; bottom: number };

/**
 * Vertical metal bars held by horizontal rails, casting a shadow on the back of what they
 * close; rusting, dented, bent and broken with age. Laid over an `opening`, they make
 * prison windows and grates.
 */
export const bars = defineGenerator({
    name: 'bars',
    description:
        'Vertical metal bars held by rails: prison windows and grates, rusting and breaking with age',
    schema: barsSchema,
    overlay: true,
    anchors: {
        bars: 'top of each bar, at its left edge',
        rails: 'left end of each rail, at its top edge',
        center: 'center of the barred area',
    },
    render(p, { width, height, seed }) {
        const wear = barsWear(p);
        const sy = height / p.size[1];
        const count = p.bars.count;
        const thickness = p.bars.thickness;
        const spacing = width / count;
        const metal = createGradient(p.metal.palette);

        // rails, evenly spaced: the rows they cover
        const railThickness = p.rails.thickness;
        const railTops = Array.from({ length: p.rails.count }, (_, j) =>
            Math.round(((j + 1) / (p.rails.count + 1)) * height - railThickness / 2),
        );
        // segments of the bars between the rails: [from, to) rows, top to bottom
        const bounds = [0, ...railTops.flatMap((top) => [top, top + railThickness]), height];
        const segments = Array.from({ length: bounds.length / 2 }, (_, s) => ({
            from: bounds[2 * s],
            to: bounds[2 * s + 1],
        }));

        // the body: bars and rails, and the part each pixel belongs to: bar i, or rail
        // count + j; -1 elsewhere
        const body = new Texture(width, height);
        const ids = new Int32Array(width * height).fill(-1);
        // distance of each bar pixel to a broken end, for the rust growing from it
        const breakDistance = new Float32Array(width * height).fill(Infinity);
        const plot = (x: number, y: number, id: number, tone: number) => {
            const grain = 1 + (hash(seed, SALT_GRAIN, mod(x, width), y) - 0.5) * 2 * p.metal.grain;
            body.setPixel(x, y, shade(sample(metal, tone), grain));
            ids[y * width + mod(x, width)] = id;
        };

        const barLefts: number[] = [];
        for (let i = 0; i < count; ++i) {
            const center = (i + 0.5) * spacing;

            // a bent bar: a smooth sideways bulge between two rails, which hold it
            let bend: (y: number) => number = () => 0;
            if (hash(seed, SALT_BEND, i, 0) < wear.bends.ratio) {
                const amount =
                    wear.bends.amount *
                    hashRange(0.5, 1, seed, SALT_BEND, i, 1) *
                    (hash(seed, SALT_BEND, i, 2) < 0.5 ? -1 : 1);
                const { from, to } =
                    segments[Math.floor(hash(seed, SALT_BEND, i, 3) * segments.length)];
                const middle = (from + to) / 2;
                const half = (to - from) / 2;
                bend = (y) =>
                    Math.abs(y - middle) < half
                        ? amount * (0.5 + 0.5 * Math.cos((Math.PI * (y - middle)) / half))
                        : 0;
            }

            // a broken bar: a part missing between two rails, or down to an edge
            let gap: Gap | undefined;
            if (hash(seed, SALT_BREAK, i, 0) < wear.broken.ratio) {
                const s = Math.floor(hash(seed, SALT_BREAK, i, 1) * segments.length);
                const { from, to } = segments[s];
                const [min, max] = wear.broken.length;
                const length = Math.min(
                    to - from,
                    Math.round(hashRange(min, max, seed, SALT_BREAK, i, 2) * sy),
                );
                // the first and last segments may lose their bar down to the patch edge
                const toEdge = hash(seed, SALT_BREAK, i, 3) < 0.5;
                if (length >= 1) {
                    if (s === 0 && toEdge) {
                        gap = { top: 0, bottom: length };
                    } else if (s === segments.length - 1 && toEdge) {
                        gap = { top: height - length, bottom: height };
                    } else {
                        // a stub of at least one pixel on each side
                        const room = Math.max(0, to - from - length - 2);
                        const top =
                            from + 1 + Math.floor(hash(seed, SALT_BREAK, i, 4) * (room + 1));
                        gap = { top, bottom: Math.min(to - 1, top + length) };
                    }
                    if (gap.bottom <= gap.top) {
                        gap = undefined;
                    }
                }
            }

            barLefts.push(mod(Math.round(center - thickness / 2), width));
            let previous = Math.round(center + bend(0) - thickness / 2);
            for (let y = 0; y < height; ++y) {
                const left = Math.round(center + bend(y) - thickness / 2);
                // a span joins this row to the previous one: steep bends never break a bar
                const from = Math.min(previous, left);
                const to = Math.max(previous, left) + thickness - 1;
                previous = left;
                for (let x = from; x <= to; ++x) {
                    const c = clamp(x - left, 0, thickness - 1);
                    let tone = barTone(p.bars.profile, c, thickness);
                    if (gap) {
                        // jagged broken ends: each column breaks one or two pixels apart
                        const jag = (end: number) =>
                            Math.floor(hash(seed, SALT_BREAK, i, 5 + end, c) * 2);
                        const top = gap.top > 0 ? gap.top - jag(0) : 0;
                        const bottom = gap.bottom < height ? gap.bottom + jag(1) : height;
                        if (y >= top && y < bottom) {
                            continue;
                        }
                        // the fresh fracture catches the light
                        if (y === top - 1 || y === bottom) {
                            tone += 0.25;
                        }
                        const k = y * width + mod(x, width);
                        breakDistance[k] = Math.min(
                            gap.top > 0 ? Math.abs(y - (top - 1)) : Infinity,
                            gap.bottom < height ? Math.abs(y - bottom) : Infinity,
                        );
                    }
                    plot(x, y, i, tone);
                }
            }
        }

        // rails: flat straps over the bars, lit on their top edge; rivets at the crossings
        const crossings: AnchorPoint[] = [];
        railTops.forEach((top, j) => {
            for (let r = 0; r < railThickness; ++r) {
                const tone =
                    railThickness === 1
                        ? 0.6
                        : r === 0
                          ? 0.85
                          : r === railThickness - 1
                            ? 0.2
                            : 0.55;
                for (let x = 0; x < width; ++x) {
                    plot(x, top + r, count + j, tone);
                }
            }
            for (let i = 0; i < count; ++i) {
                const x = Math.round((i + 0.5) * spacing - 0.5);
                const y = top + Math.floor((railThickness - 1) / 2);
                crossings.push({ x, y: top + railThickness - 1 });
                if (p.rails.rivets) {
                    const base = body.getPixel(x, y);
                    body.setPixel(x, y, shade(base, 1.6));
                    if (railThickness > 1) {
                        body.setPixel(x + 1, y + 1, shade(base, 0.45));
                    }
                }
            }
        });

        drawDents(body, ids, wear.dents, seed, SALT_DENT);

        // rust: patches, stronger near broken ends, and streaks running down from the
        // crossings; then tarnish
        const cells = (px: number) => Math.max(1, Math.round(px));
        const rustNoise = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 0),
            period: [cells(width / 8), cells(height / 8)],
            octaves: 3,
        });
        const tarnishNoise = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 1),
            period: 3,
            octaves: 2,
        });
        const weathering = new MetalWeathering(width, height, wear, p.rust.palette, tarnishNoise);
        weathering.addStreaks(crossings, seed, SALT_STREAK, (x, y) => {
            if (y >= height) {
                return -1;
            }
            const k = y * width + mod(x, width);
            return ids[k] >= 0 && ids[k] < count ? k : -1;
        });
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const k = y * width + x;
                if (ids[k] < 0) {
                    continue;
                }
                const u = x / width;
                const v = y / height;
                const near = clamp(1 - breakDistance[k] / BREAK_RUST);
                const n = rustNoise.sample(u, v) + near * 0.35;
                body.setPixel(x, y, weathering.apply(body.getPixel(x, y), x, y, n, u, v));
            }
        }

        // the shadow on the back, then the body over it
        const texture = new Texture(width, height);
        const offset = p.shadow.offset;
        if (offset > 0) {
            const shadowColor = Rainbow.fromRGBA({ r: 0, g: 0, b: 0, a: p.shadow.opacity });
            for (let y = 0; y < height; ++y) {
                for (let x = 0; x < width; ++x) {
                    const sx = mod(x + offset, width);
                    const sy = y + offset;
                    if (ids[y * width + x] >= 0 && sy < height && ids[sy * width + sx] < 0) {
                        texture.setPixel(sx, sy, shadowColor);
                    }
                }
            }
        }
        texture.draw(body, 0, 0);

        texture.anchors = {
            bars: barLefts.map((x) => ({ x, y: 0 })),
            rails: railTops.map((y) => ({ x: 0, y })),
            center: [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }],
        };
        return texture;
    },
});
