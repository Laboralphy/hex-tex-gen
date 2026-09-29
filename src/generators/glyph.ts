import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge } from '../core/age';
import { hash, hashRange, hashSeed } from '../core/hash';
import { clamp } from '../core/math';
import { shade } from '../core/palette';
import { ageParam, color, DETAIL, FROM_AGE, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { defineGenerator } from './define';

/**
 * Parameters of the glyph template. The glyph is drawn in the largest square centered in
 * the patch, and scales with it; the thickness of its strokes is in real pixels.
 */
export const glyphSchema = z.strictObject({
    size: size().default([32, 32]).describe('own size of the patch in pixels'),
    type: z
        .enum(['pentagram', 'grid', 'alchemy', 'tally'])
        .default('pentagram')
        .describe(
            'pentagram: an inverted five-pointed star, one point down, inside concentric circles; grid: a 3 × 3 grid, unreadable characters in some squares; alchemy: an alchemical or astrological circle, its figure picked by the seed; tally: strokes counting days, the fifth across the four others',
        ),
    grid: z
        .strictObject({
            filled: z
                .number()
                .int()
                .min(0)
                .max(9)
                .default(5)
                .describe('grid only: squares holding a character, from 0 to 9'),
        })
        .prefault({})
        .describe('the grid type'),
    tally: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(1)
                .max(5)
                .default(5)
                .describe('tally only: the number counted, from 1 to 5'),
        })
        .prefault({})
        .describe('the tally type'),
    chaos: ratio()
        .default(0.15)
        .describe(
            'jitter of the scribing, in [0, 1]: 0 is a steady hand, 1 a shaking one; tally strokes also lean and vary in length',
        ),
    stroke: z
        .strictObject({
            color: color().default('#d8d0bc').describe('color of the writing: chalk by default'),
            alpha: ratio().default(0.9).describe('alpha of the writing, in [0, 1]'),
            thickness: z
                .number()
                .min(1)
                .default(1)
                .describe('thickness of the strokes, in pixels')
                .meta(DETAIL),
            grain: ratio()
                .default(0.08)
                .describe('random brightness variation between pixels, in [0, 1]'),
        })
        .prefault({})
        .describe('the strokes of the writing'),
    age: ageParam({ noun: 'aging', young: 'fresh', old: 'nearly erased' }),
    fading: ratio()
        .optional()
        .describe(
            `cloudy variation of the alpha of the writing, in [0, 1]: blotches worn away, the rest faint;${FROM_AGE}`,
        ),
});

export type GlyphParams = z.output<typeof glyphSchema>;

/**
 * Wear values of a glyph, every one resolved.
 */
export type GlyphWear = { fading: number };

/**
 * Resolves the wear values of a glyph: values set in the parameters win, the others are
 * derived from `age`.
 */
export function glyphWear(p: GlyphParams): GlyphWear {
    return { fading: p.fading ?? atAge(p.age, [0, 0.35, 1]) };
}

// each random decision draws from its own sequence
const SALT_JITTER = 1;
const SALT_CELL = 2;
const SALT_RUNE = 3;
const SALT_TALLY = 4;
const SALT_FIGURE = 5;
const SALT_NOISE = 6;
const SALT_GRAIN = 7;

/** size of the blotches of the fading, as a share of the patch */
const BLOTCH = 0.2;

/** a point in the unit square of the glyph: (0, 0) top-left, (1, 1) bottom-right */
type Point = [number, number];

/** a point on a circle around the center of the glyph, 0° to the right, 90° downwards */
function polar(radius: number, degrees: number, [cx, cy]: Point = [0.5, 0.5]): Point {
    const a = (degrees * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
}

/** a closed circle, as a polyline */
function circle(radius: number, center: Point = [0.5, 0.5]): Point[] {
    const n = Math.max(12, Math.ceil(radius * 90));
    return Array.from({ length: n + 1 }, (_, i) => polar(radius, (i / n) * 360, center));
}

/** a regular polygon, closed, its first vertex pointing up */
function polygon(sides: number, radius: number, step = 1): Point[] {
    return Array.from({ length: sides + 1 }, (_, i) =>
        polar(radius, -90 + (i * step * 360) / sides),
    );
}

/** the strokes of an inverted pentagram, one point down, inside two concentric circles */
function pentagram(): Point[][] {
    const star = polygon(5, 0.4, 2).map(([x, y]): Point => [x, 1 - y]);
    return [circle(0.46), circle(0.4), star];
}

/**
 * The strokes of a 3 × 3 grid, a character made of a few random strokes in some of its
 * squares.
 */
function grid(filled: number, seed: number): Point[][] {
    const [a, b] = [0.08, 0.92];
    const cell = (b - a) / 3;
    const strokes: Point[][] = [
        [
            [a, a],
            [b, a],
            [b, b],
            [a, b],
            [a, a],
        ],
    ];
    for (const t of [a + cell, a + 2 * cell]) {
        strokes.push(
            [
                [t, a],
                [t, b],
            ],
            [
                [a, t],
                [b, t],
            ],
        );
    }
    // the squares in a random order, the first ones filled
    const cells = Array.from({ length: 9 }, (_, i) => i).sort(
        (i, j) => hash(seed, SALT_CELL, i) - hash(seed, SALT_CELL, j),
    );
    for (const k of cells.slice(0, filled)) {
        const [x0, y0] = [a + (k % 3) * cell, a + Math.floor(k / 3) * cell];
        // strokes joining the points of a 3 × 3 lattice inside the square
        const lattice = (n: number): Point => [
            x0 + cell * (0.28 + 0.22 * (n % 3)),
            y0 + cell * (0.28 + 0.22 * Math.floor(n / 3)),
        ];
        const count = 2 + Math.floor(hash(seed, SALT_RUNE, k, 0) * 2);
        let from = Math.floor(hash(seed, SALT_RUNE, k, 1) * 9);
        for (let s = 0; s < count; ++s) {
            // a stroke from the end of the previous one, or a new start
            const to = (from + 1 + Math.floor(hash(seed, SALT_RUNE, k, 2, s) * 8)) % 9;
            strokes.push([lattice(from), lattice(to)]);
            from =
                hash(seed, SALT_RUNE, k, 3, s) < 0.6
                    ? to
                    : Math.floor(hash(seed, SALT_RUNE, k, 4, s) * 9);
        }
    }
    return strokes;
}

/**
 * The strokes of an alchemical circle: a double ring divided by ticks, a figure inscribed
 * in it, a small circle on each vertex of the figure, and a circle in its heart. The seed
 * picks the figure and the divisions.
 */
function alchemy(seed: number): Point[][] {
    const sides = [3, 4, 6][Math.floor(hash(seed, SALT_FIGURE, 0) * 3)];
    const ticks = [8, 12][Math.floor(hash(seed, SALT_FIGURE, 1) * 2)];
    const strokes: Point[][] = [circle(0.46), circle(0.39)];
    for (let i = 0; i < ticks; ++i) {
        strokes.push([polar(0.39, (i * 360) / ticks), polar(0.46, (i * 360) / ticks)]);
    }
    const r = 0.34;
    // a hexagram is two triangles
    if (sides === 6) {
        strokes.push(
            polygon(3, r),
            polygon(3, r).map(([x, y]): Point => [x, 1 - y]),
        );
    } else {
        strokes.push(polygon(sides, r));
    }
    for (let i = 0; i < sides; ++i) {
        strokes.push(circle(0.045, polar(r, -90 + (i * 360) / sides)));
    }
    // the circle inscribed in the figure, and a line through it
    const inner = r * Math.cos(Math.PI / (sides === 6 ? 3 : sides));
    strokes.push(circle(inner * 0.9), circle(0.04), [
        [0.5, 0.5 - inner * 0.9],
        [0.5, 0.5 + inner * 0.9],
    ]);
    return strokes;
}

/**
 * The strokes of a tally: upright strokes, the fifth one across the four others. Chaos
 * makes them lean and vary in length.
 */
function tally(count: number, chaos: number, seed: number): Point[][] {
    const jitter = (i: number, k: number, amount: number) =>
        hashRange(-amount, amount, seed, SALT_TALLY, i, k) * chaos;
    const strokes: Point[][] = [];
    for (let i = 0; i < Math.min(4, count); ++i) {
        const x = 0.2 + i * 0.2 + jitter(i, 0, 0.06);
        const lean = jitter(i, 1, 0.12);
        strokes.push([
            [x + lean, 0.12 + jitter(i, 2, 0.1)],
            [x - lean, 0.88 + jitter(i, 3, 0.1)],
        ]);
    }
    if (count === 5) {
        strokes.push([
            [0.08 + jitter(4, 0, 0.06), 0.72 + jitter(4, 1, 0.15)],
            [0.92 + jitter(4, 2, 0.06), 0.3 + jitter(4, 3, 0.15)],
        ]);
    }
    return strokes;
}

/**
 * A glyph written on a wall: an inverted pentagram, a grid of unreadable characters, an
 * alchemical circle or a tally of days. The scribing shakes with `chaos`, and the writing
 * wears away in cloudy blotches with age. The patch is transparent elsewhere.
 */
export const glyph = defineGenerator({
    name: 'glyph',
    description: 'Glyph written on a wall: pentagram, grid of runes, alchemical circle or tally',
    category: 'dungeon',
    schema: glyphSchema,
    overlay: true,
    render(p, { width, height, seed }) {
        const wear = glyphWear(p);
        const strokes =
            p.type === 'pentagram'
                ? pentagram()
                : p.type === 'grid'
                  ? grid(p.grid.filled, seed)
                  : p.type === 'alchemy'
                    ? alchemy(seed)
                    : tally(p.tally.count, p.chaos, seed);

        // the unit square of the glyph: the largest square centered in the patch, inset so
        // that thick strokes stay inside
        const half = p.stroke.thickness / 2;
        const side = Math.max(1, Math.min(width, height) - 2 * half);
        const ox = (width - side) / 2;
        const oy = (height - side) / 2;

        const ink = new Uint8Array(width * height);
        const plot = (x: number, y: number) => {
            if (half <= 0.5) {
                const [px, py] = [Math.floor(x), Math.floor(y)];
                if (px >= 0 && py >= 0 && px < width && py < height) {
                    ink[py * width + px] = 1;
                }
                return;
            }
            for (let py = Math.floor(y - half); py <= Math.floor(y + half); ++py) {
                for (let px = Math.floor(x - half); px <= Math.floor(x + half); ++px) {
                    const inside = Math.hypot(px + 0.5 - x, py + 0.5 - y) <= half;
                    if (inside && px >= 0 && py >= 0 && px < width && py < height) {
                        ink[py * width + px] = 1;
                    }
                }
            }
        };
        // each stroke wanders off its path: a smooth offset across it, knots about 4 pixels
        // apart at own size
        const amplitude = p.chaos * 0.035 * side;
        const knot = 4 * (side / Math.min(p.size[0], p.size[1]));
        strokes.forEach((stroke, s) => {
            const points = stroke.map(([u, v]): Point => [ox + u * side, oy + v * side]);
            let travelled = 0;
            const wander = (d: number) => {
                const k = Math.floor(d / knot);
                const t = d / knot - k;
                const f = (1 - Math.cos(t * Math.PI)) / 2;
                const a = hashRange(-1, 1, seed, SALT_JITTER, s, k);
                const b = hashRange(-1, 1, seed, SALT_JITTER, s, k + 1);
                return (a + (b - a) * f) * amplitude;
            };
            for (let i = 0; i + 1 < points.length; ++i) {
                const [[x0, y0], [x1, y1]] = [points[i], points[i + 1]];
                const length = Math.hypot(x1 - x0, y1 - y0);
                const [nx, ny] = length > 0 ? [-(y1 - y0) / length, (x1 - x0) / length] : [0, 0];
                const steps = Math.max(1, Math.ceil(length * 2));
                for (let j = 0; j <= steps; ++j) {
                    const t = j / steps;
                    const w = wander(travelled + t * length);
                    plot(x0 + (x1 - x0) * t + nx * w, y0 + (y1 - y0) * t + ny * w);
                }
                travelled += length;
            }
        });

        // fading: cloudy blotches worn away, scaling with the patch
        const noise = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE),
            period: [
                Math.max(1, Math.round(1 / BLOTCH)),
                Math.max(1, Math.round((height / width) * (1 / BLOTCH))),
            ],
            octaves: 3,
        });
        const base = Rainbow.parse(p.stroke.color);
        const rgba = Rainbow.convertToRGBA(base);
        const texture = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                if (!ink[y * width + x]) {
                    continue;
                }
                const cloud = clamp((noise.sample(x / width, y / height) - 0.3) / 0.4);
                const speck = (hash(seed, SALT_GRAIN, x, y, 1) - 0.5) * 0.3;
                const kept = clamp(1 - wear.fading * (1 - cloud + speck));
                const a = rgba.a * p.stroke.alpha * kept;
                if (a <= 0) {
                    continue;
                }
                const grain = 1 + (hash(seed, SALT_GRAIN, x, y, 0) - 0.5) * 2 * p.stroke.grain;
                texture.setPixel(x, y, shade(Rainbow.fromRGBA({ ...rgba, a }), grain));
            }
        }
        return texture;
    },
});
