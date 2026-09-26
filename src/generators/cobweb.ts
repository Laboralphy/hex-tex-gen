import { Bresenham } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge } from '../core/age';
import { hash, hashRange } from '../core/hash';
import { clamp } from '../core/math';
import { mixRGBA, shade } from '../core/palette';
import { ageParam, color, FROM_AGE, LAYOUT, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { defineGenerator } from './define';

/**
 * Parameters of the cobweb template. The web radiates from the top-left corner of the
 * patch; anchored with `mirror` on the corners of an opening, it fills any of them.
 */
export const cobwebSchema = z.strictObject({
    size: size().default([16, 16]).describe('own size of the web, from its corner, in pixels'),
    spokes: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(1)
                .default(3)
                .describe('threads radiating from the corner, between the two walls')
                .meta(LAYOUT),
            jitter: ratio().default(0.25).describe('random variation of their angles, in [0, 1]'),
        })
        .prefault({})
        .describe('threads radiating from the corner'),
    rings: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(1)
                .default(4)
                .describe('threads around the corner, from wall to wall across the spokes')
                .meta(LAYOUT),
            sag: ratio()
                .default(0.25)
                .describe(
                    'how much a thread sags towards the corner between two spokes, as a share of its length',
                ),
            jitter: ratio().default(0.2).describe('random variation of their spacing, in [0, 1]'),
        })
        .prefault({})
        .describe('threads around the corner'),
    thread: z
        .strictObject({
            color: color().default('#bdbab2').describe('color of the threads'),
            alpha: ratio()
                .default(1)
                .describe(
                    'alpha of the threads, in [0, 1]; below 1, they are translucent pixels, even over a cut-out opening',
                ),
            grain: ratio()
                .default(0.12)
                .describe('random brightness variation between pixels, in [0, 1]'),
        })
        .prefault({})
        .describe('threads, one pixel thick'),
    age: ageParam({ noun: 'aging', young: 'fresh', old: 'abandoned' }),
    torn: ratio().optional().describe(`share of the threads torn away, in [0, 1];${FROM_AGE}`),
    dust: ratio()
        .optional()
        .describe(
            `dust caught in the web, in [0, 1]: greyer threads and a matted sheet in the corner;${FROM_AGE}`,
        ),
});

export type CobwebParams = z.output<typeof cobwebSchema>;

/**
 * Wear values of a cobweb, every one resolved.
 */
export type CobwebWear = { torn: number; dust: number };

/**
 * Resolves the wear values of a cobweb: values set in the parameters win, the others are
 * derived from `age`.
 */
export function cobwebWear(p: CobwebParams): CobwebWear {
    return {
        torn: p.torn ?? atAge(p.age, [0, 0.1, 0.45]),
        dust: p.dust ?? atAge(p.age, [0, 0.2, 0.75]),
    };
}

// each random decision draws from its own sequence
const SALT_SPOKE = 1;
const SALT_RING = 2;
const SALT_TORN = 3;
const SALT_GRAIN = 4;
const SALT_SHEET = 5;

/** grey the dust turns the threads to */
const DUST = Rainbow.parse('#6f6a61');

/** share of the web, from the corner, covered by the matted sheet when fully dusty */
const SHEET_REACH = 0.3;

/** darkening of the threads at the far edges of the web */
const FALLOFF = 0.3;

/** radius of the innermost ring: the apex is left to the spokes */
const FIRST_RING = 0.2;

/**
 * A spider web in a corner: spokes radiating from the top-left corner of the patch, and
 * threads around it, attached to both walls and sagging between the spokes. It tears and
 * gathers dust with age. The patch is transparent elsewhere.
 */
export const cobweb = defineGenerator({
    name: 'cobweb',
    description: 'Spider web in a corner, torn and dusty with age: anchor it on opening corners',
    category: 'natural',
    schema: cobwebSchema,
    overlay: true,
    render(p, { width, height, seed }) {
        const wear = cobwebWear(p);
        const threads = new Uint8Array(width * height);
        // a thread through points: 1-pixel lines between them, cut at the patch edges
        const thread = (points: { x: number; y: number }[]) => {
            for (let i = 0; i + 1 < points.length; ++i) {
                const [a, b] = [points[i], points[i + 1]];
                Bresenham.line(
                    Math.floor(a.x),
                    Math.floor(a.y),
                    Math.floor(b.x),
                    Math.floor(b.y),
                    (x, y) => {
                        if (x >= 0 && y >= 0 && x < width && y < height) {
                            threads[y * width + x] = 1;
                        }
                        return true;
                    },
                );
            }
        };
        // a point of the web: at an angle from the top wall (0) to the left wall (90°),
        // at a radius from the corner (0) to the far edges of the patch (1)
        const point = (angle: number, radius: number) => ({
            x: 0.5 + radius * Math.cos(angle) * (width - 1),
            y: 0.5 + radius * Math.sin(angle) * (height - 1),
        });

        // spokes, evenly spread between the walls with some jitter; the walls bound the web
        const count = p.spokes.count;
        const angles = [
            0,
            ...Array.from(
                { length: count },
                (_, j) =>
                    ((j + 0.5 + (hash(seed, SALT_SPOKE, j, 0) - 0.5) * p.spokes.jitter) / count) *
                    (Math.PI / 2),
            ),
            Math.PI / 2,
        ];
        angles.slice(1, -1).forEach((angle, j) => {
            // a torn spoke stops short
            const reach =
                hash(seed, SALT_TORN, 0, j) < wear.torn / 2
                    ? hashRange(0.2, 0.7, seed, SALT_TORN, 1, j)
                    : 1;
            thread([point(angle, 0), point(angle, reach)]);
        });

        // rings: from spoke to spoke, sagging towards the corner; the outer ones run out to
        // the walls
        const rings = p.rings.count;
        // each ring at its own radius, with a slight variation at each spoke
        const gap = (1 - FIRST_RING) / rings;
        const radius = (k: number, j: number) =>
            clamp(
                FIRST_RING +
                    gap * (k + 0.5 + (hash(seed, SALT_RING, k) - 0.5) * p.rings.jitter) +
                    gap * (hash(seed, SALT_RING, k, j) - 0.5) * p.rings.jitter * 0.4,
                0.05,
                1,
            );
        for (let k = 0; k < rings; ++k) {
            for (let j = 0; j + 1 < angles.length; ++j) {
                if (hash(seed, SALT_TORN, 2, k, j) < wear.torn) {
                    continue;
                }
                const a = point(angles[j], radius(k, j));
                const b = point(angles[j + 1], radius(k, j + 1));
                // a quadratic curve, its control point pulled towards the corner by a share
                // of the thread length
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const toCorner = Math.max(0.001, Math.hypot(mx - 0.5, my - 0.5));
                const pull = (p.rings.sag * Math.hypot(b.x - a.x, b.y - a.y)) / toCorner;
                const cx = mx + (0.5 - mx) * Math.min(1, pull);
                const cy = my + (0.5 - my) * Math.min(1, pull);
                // points about 2 pixels apart along the curve
                const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
                thread(
                    Array.from({ length: steps + 1 }, (_, s) => {
                        const t = s / steps;
                        const u = 1 - t;
                        return {
                            x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
                            y: u * u * a.y + 2 * u * t * cy + t * t * b.y,
                        };
                    }),
                );
            }
        }

        // dust: greyer threads, and a matted sheet filling the apex
        const base = Rainbow.parse(p.thread.color);
        const dusty = Rainbow.convertToRGBA(DUST);
        const own = Rainbow.convertToRGBA(base);
        const mix = (f: number) =>
            Rainbow.fromRGBA({ ...mixRGBA(own, dusty, f), a: p.thread.alpha });
        const sheet = SHEET_REACH * wear.dust;
        const texture = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const r = Math.hypot(x / Math.max(1, width - 1), y / Math.max(1, height - 1));
                const matted =
                    r < sheet && hash(seed, SALT_SHEET, x, y) < 0.7 * (1 - r / sheet) + 0.2;
                if (!threads[y * width + x] && !matted) {
                    continue;
                }
                const grain = 1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.thread.grain;
                // denser, brighter threads near the corner
                const falloff = 1 - FALLOFF * Math.min(1, r);
                const color = mix(matted ? 0.5 + wear.dust / 2 : wear.dust * 0.6);
                texture.setPixel(x, y, shade(color, grain * falloff));
            }
        }
        return texture;
    },
});
