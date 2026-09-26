import { FractalNoise } from '@laboralphy/algorithms';
import { z } from 'zod';
import { atAge } from '../core/age';
import { hash, hashRange, hashSeed } from '../core/hash';
import { clamp } from '../core/math';
import { createGradient, sample, shade } from '../core/palette';
import { ageParam, FROM_AGE, LAYOUT, ratio, shadowGroup, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { dropShadow, scaledOffset } from './common/drop-shadow';
import { Marble, marbleGroup } from './common/Marble';
import { defineGenerator } from './define';

/**
 * Parameters of the column template. The whole patch is the column, capital and base
 * included; its shadow falls on the wall behind.
 */
export const columnSchema = z.strictObject({
    size: size().default([16, 64]).describe('own size of the column, capital and base included'),
    order: z
        .enum(['doric', 'ionic', 'tuscan'])
        .default('doric')
        .describe(
            'doric: fluted, a flared capital under a square slab; ionic: fluted, a capital rolled into two volutes; tuscan: a plain shaft, a simple capital',
        ),
    shaft: z
        .strictObject({
            width: ratio()
                .default(0.7)
                .describe('width of the shaft at its foot, as a share of the patch width'),
            taper: ratio()
                .default(0.1)
                .describe('narrowing of the shaft at its top, as a share of its width'),
            flutes: z
                .number()
                .int()
                .min(0)
                .default(5)
                .describe('grooves running down the visible half of the shaft; 0 for none')
                .meta(LAYOUT),
        })
        .prefault({})
        .describe('shaft, round, lit from the left'),
    capital: z
        .number()
        .min(1)
        .default(7)
        .describe('height of the capital, in pixels at own size')
        .meta(LAYOUT),
    base: z
        .number()
        .min(0)
        .default(5)
        .describe('height of the base, in pixels at own size; 0 for none')
        .meta(LAYOUT),
    marble: marbleGroup(),
    shadow: shadowGroup('column', 0.45, 1, true),
    age: ageParam(),
    grime: ratio()
        .optional()
        .describe(`dirt darkening the column, rising from its foot, in [0, 1];${FROM_AGE}`),
    chips: ratio()
        .optional()
        .describe(`chipped edges, in [0, 1]: share of the outline broken away;${FROM_AGE}`),
    broken: ratio()
        .optional()
        .describe(
            `chance the column is broken: its capital gone, the shaft ending in a jagged top;${FROM_AGE}`,
        ),
});

export type ColumnParams = z.output<typeof columnSchema>;

/**
 * Wear values of a column, every one resolved.
 */
export type ColumnWear = { grime: number; chips: number; broken: number };

/**
 * Resolves the wear values of a column: values set in the parameters win, the others are
 * derived from `age`.
 */
export function columnWear(p: ColumnParams): ColumnWear {
    const a = p.age;
    return {
        grime: p.grime ?? atAge(a, [0, 0.15, 0.6]),
        chips: p.chips ?? atAge(a, [0, 0.05, 0.3]),
        broken: p.broken ?? atAge(a, [0, 0, 0.35]),
    };
}

// each random decision draws from its own sequence
const SALT_MARBLE = 1;
const SALT_NOISE = 2;
const SALT_CHIP = 3;
const SALT_BROKEN = 4;

/**
 * Brightness of a round surface lit from the left, across its width.
 * @param t position across, from -1 (left edge) to 1 (right edge)
 */
function roundLight(t: number): number {
    const facing = Math.sqrt(Math.max(0, 1 - t * t));
    return 0.55 + 0.45 * clamp(0.75 * facing - 0.65 * t);
}

/**
 * A marble column of a classical order: a fluted or plain shaft, slightly tapering, on a
 * base, under a doric, ionic or tuscan capital. It gathers grime, chips and breaks with
 * age, and casts a shadow on the wall behind.
 */
export const column = defineGenerator({
    name: 'column',
    description: 'Marble column of a classical order: doric, ionic or tuscan',
    category: 'architecture',
    schema: columnSchema,
    overlay: true,
    anchors: {
        top: 'top-left corner of the capital, where an entablature rests',
        center: 'center of the column',
    },
    render(p, { width, height, seed }) {
        const wear = columnWear(p);
        const sy = height / p.size[1];
        const cx = width / 2;
        const capital = Math.max(1, Math.round(p.capital * sy));
        const base = Math.round(p.base * sy);
        const shaftTop = capital;
        const shaftBottom = height - base;
        // brightness of each pixel of the column, NaN outside
        const light = new Float32Array(width * height).fill(NaN);
        const put = (x: number, y: number, value: number) => {
            if (x >= 0 && y >= 0 && x < width && y < height) {
                light[y * width + x] = value;
            }
        };
        const halfFoot = (p.shaft.width * width) / 2;
        const halfAt = (y: number) => {
            const t = (y - shaftTop) / Math.max(1, shaftBottom - shaftTop);
            return halfFoot * (1 - p.shaft.taper * (1 - t));
        };

        // a broken column: its shaft ends in a jagged line, its capital lost
        const broken = hash(seed, SALT_BROKEN) < wear.broken;
        const breakAt = broken
            ? shaftTop + hashRange(0.15, 0.6, seed, SALT_BROKEN, 1) * (shaftBottom - shaftTop)
            : 0;
        const jag = (x: number) => breakAt + (hash(seed, SALT_BROKEN, 2, x) - 0.5) * 3 * sy;

        // the shaft: round, fluted, tapering towards its top
        for (let y = shaftTop; y < shaftBottom; ++y) {
            const half = halfAt(y);
            for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); ++x) {
                if (broken && y < jag(x)) {
                    continue;
                }
                const t = (x + 0.5 - cx) / half;
                let value = roundLight(t);
                if (p.shaft.flutes > 0) {
                    // grooves: their left side in shadow, their right side lit, a bright
                    // ridge between two
                    const s = (((t + 1) / 2) * p.shaft.flutes) % 1;
                    value *= s < 0.12 ? 1.15 : 0.92 + 0.16 * s;
                }
                put(x, y, value);
            }
        }

        // the base: a torus on a square plinth
        if (base > 0) {
            const plinth = Math.max(1, Math.round(base / 2));
            for (let y = shaftBottom; y < height; ++y) {
                const inPlinth = y >= height - plinth;
                const half = inPlinth ? width * 0.47 : halfFoot + (width * 0.47 - halfFoot) * 0.6;
                const tv = inPlinth ? 0 : (y - shaftBottom + 0.5) / Math.max(1, base - plinth);
                for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); ++x) {
                    const t = (x + 0.5 - cx) / half;
                    // the torus is round both ways: lit on its top
                    const value = inPlinth
                        ? y === height - plinth
                            ? 1.05
                            : 0.8
                        : roundLight(t) * (1.1 - 0.35 * tv);
                    put(x, y, value);
                }
            }
        }

        // the capital, unless broken away
        if (!broken) {
            const abacus = Math.max(1, Math.round(capital * (p.order === 'ionic' ? 0.25 : 0.4)));
            const top = halfAt(shaftTop);
            for (let y = 0; y < capital; ++y) {
                let half: number;
                if (y < abacus) {
                    // the square slab on top, as wide as the patch
                    half = width * 0.48;
                } else if (p.order === 'doric') {
                    // the echinus flares from the shaft up to the slab
                    const t = (y - abacus) / Math.max(1, capital - abacus);
                    half = top + (width * 0.42 - top) * (1 - t * t);
                } else if (p.order === 'ionic') {
                    half = top + 1;
                } else {
                    // tuscan: a plain collar
                    half = top + (y < abacus + 1 ? 1 : 0.5);
                }
                for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); ++x) {
                    const t = (x + 0.5 - cx) / half;
                    const value =
                        y < abacus
                            ? y === 0
                                ? 1.1
                                : y === abacus - 1
                                  ? 0.7
                                  : 0.95
                            : roundLight(t) * (y === abacus ? 0.75 : 1);
                    put(x, y, value);
                }
            }
            if (p.order === 'ionic') {
                // volutes: a spiral rolled up at each end of the capital
                const r = Math.max(1.5, (capital - abacus) / 2);
                for (const side of [-1, 1]) {
                    const vx = cx + side * (width * 0.48 - r);
                    const vy = abacus + r - 0.5;
                    for (let y = Math.floor(vy - r); y <= Math.ceil(vy + r); ++y) {
                        for (let x = Math.floor(vx - r); x <= Math.ceil(vx + r); ++x) {
                            const d = Math.hypot(x + 0.5 - vx, y + 0.5 - vy);
                            if (d > r) {
                                continue;
                            }
                            // a scroll end: a dark rim, a lit face, a dark eye
                            const lit = x + 0.5 < vx ? 1.1 : 0.9;
                            put(x, y, d > r - 0.8 ? 0.6 : d < r * 0.35 ? 0.5 : lit);
                        }
                    }
                }
            }
        }

        // chips: bites out of the outline
        if (wear.chips > 0) {
            const solid = (x: number, y: number) =>
                x >= 0 && y >= 0 && x < width && y < height && !Number.isNaN(light[y * width + x]);
            const edges: number[] = [];
            for (let y = 0; y < height; ++y) {
                for (let x = 0; x < width; ++x) {
                    if (solid(x, y) && (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1))) {
                        edges.push(y * width + x);
                    }
                }
            }
            for (const i of edges) {
                if (hash(seed, SALT_CHIP, i) < wear.chips) {
                    light[i] = NaN;
                }
            }
        }

        // colors: veined marble, shaded, grimy towards its foot
        const marble = new Marble(hashSeed(seed, SALT_MARBLE), width, height, p.marble);
        const colors = createGradient(p.marble.palette);
        const grime = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE),
            period: [2, 4],
            octaves: 3,
        });
        const body = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const value = light[y * width + x];
                if (Number.isNaN(value)) {
                    continue;
                }
                const rising = 0.4 + 0.6 * (y / height);
                const dirt =
                    wear.grime * rising * clamp(grime.sample(x / width, y / height) * 1.4 - 0.2);
                const color = sample(colors, marble.tone(x, y));
                body.setPixel(x, y, shade(color, value * (1 - 0.6 * dirt)));
            }
        }

        const texture = dropShadow(
            body,
            (i) => !Number.isNaN(light[i]),
            scaledOffset(p.shadow.offset, sy),
            p.shadow.opacity,
        );
        texture.anchors = {
            top: [{ x: 0, y: 0 }],
            center: [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }],
        };
        return texture;
    },
});
