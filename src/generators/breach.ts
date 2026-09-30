import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { hash, hashRange, hashSeed } from '../core/hash';
import { clamp } from '../core/math';
import { createGradient, sample, shade, shadeRGBA } from '../core/palette';
import { DETAIL, ESSENTIAL, palette, range, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { Dirt, dirtGroup } from './common/Dirt';
import { defineGenerator } from './define';

/** stones fallen from a wall, from darkest to lightest */
const RUBBLE_PALETTE = ['#2c2a26', '#4c4943', '#6e6a62', '#918c82'];

/**
 * Parameters of the breach template. The hole is centered in the patch and scales with
 * it; its rim, bevel, shadow and cracks are real pixels. Nothing crosses the edges of the
 * patch.
 */
export const breachSchema = z.strictObject({
    size: size().default([32, 32]).describe('own size of the patch, cracks included'),
    hole: z
        .strictObject({
            shape: z
                .enum(['burst', 'gash', 'fissure', 'pocks', 'collapse', 'bore', 'slits'])
                .default('burst')
                .describe(
                    'burst: a jagged hole, from round, punched by a ram, to a star of shards, blown by an explosion; gash: parallel slashes tapering at both ends, torn by a claw; fissure: a long zigzag split, widest in its middle, opened by a quake; pocks: small holes scattered around, left by catapult shots; collapse: a bite out of the top of the wall, rubble heaped at its foot; bore: a clean round tunnel, dug by a giant worm; slits: narrow vertical arrow slits hacked into the wall',
                )
                .meta(ESSENTIAL),
            size: z
                .number()
                .gt(0)
                .max(1)
                .default(0.8)
                .describe(
                    'span of the hole, as a share of the patch; the rest is left to the cracks',
                ),
            jaggedness: ratio()
                .default(0.35)
                .describe(
                    'irregularity of the outline, in [0, 1]: 0 for a smooth one; a burst turns from a round hole into a star of shards',
                )
                .meta(ESSENTIAL),
            spikes: z
                .number()
                .int()
                .min(2)
                .default(7)
                .describe(
                    'burst or pocks only: shards of wall jutting into each hole, around its outline',
                ),
            count: z
                .number()
                .int()
                .min(1)
                .default(3)
                .describe('gash, pocks or slits only: number of slashes, holes or slits'),
            angle: z
                .number()
                .default(60)
                .describe(
                    'gash or fissure only: direction of the strokes, in degrees: 0 to the right, 90 downwards',
                ),
            width: z
                .number()
                .gt(0)
                .max(1)
                .default(0.2)
                .describe(
                    'gash, fissure or slits only: thickness of a stroke at its widest, as a share of the smaller side of the patch',
                ),
            cross: z
                .boolean()
                .default(false)
                .describe('slits only: a horizontal slit across each one, for crossbows'),
        })
        .prefault({})
        .describe('the outline of the hole'),
    depth: z
        .number()
        .int()
        .min(0)
        .default(4)
        .describe('thickness of the broken wall seen inside the hole, in pixels')
        .meta(DETAIL),
    bevel: z
        .number()
        .int()
        .min(0)
        .default(1)
        .describe('width of the worn lip of the wall face around the hole, in pixels')
        .meta(DETAIL),
    rim: z
        .strictObject({
            light: ratio()
                .default(0.45)
                .describe('lightening of the broken faces turned to the light, in [0, 1]'),
            dark: ratio()
                .default(0.7)
                .describe('darkening of the broken faces turned away from it, in [0, 1]'),
            falloff: ratio()
                .default(0.45)
                .describe('extra darkness of the broken faces towards the back, in [0, 1]'),
            grain: ratio()
                .default(0.3)
                .describe(
                    'roughness of the broken faces: random brightness between pixels, in [0, 1]',
                ),
        })
        .prefault({})
        .describe(
            'the broken edge of the wall, inside the hole and on its lip, the light coming from the top-left',
        ),
    shadow: z
        .strictObject({
            offset: z
                .number()
                .int()
                .min(0)
                .default(3)
                .describe('shadow cast to the bottom-right, in pixels; 0 for none')
                .meta(DETAIL),
            opacity: ratio().default(0.55).describe('darkness of the shadow, in [0, 1]'),
            recess: ratio()
                .default(0.25)
                .describe('darkening of the whole earth, set back behind the wall, in [0, 1]'),
        })
        .prefault({})
        .describe('shadow of the broken edge on the earth at the back of the hole'),
    rubble: z
        .strictObject({
            amount: ratio()
                .optional()
                .describe(
                    'height of the heap of rubble at the foot of each piece of the hole, as a share of its height, in [0, 1]; when unset, 0.4 for a collapse, none otherwise',
                ),
            size: z
                .number()
                .int()
                .min(1)
                .default(3)
                .describe('size of the stones of the rubble, in pixels')
                .meta(DETAIL),
            palette: palette()
                .default(RUBBLE_PALETTE)
                .describe('colors of the stones of the rubble, from darkest to lightest'),
        })
        .prefault({})
        .describe('stones fallen at the foot of the hole, lit from the top-left'),
    cracks: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(0)
                .default(5)
                .describe('cracks running from the hole into the wall')
                .meta(ESSENTIAL),
            length: range(ratio())
                .default([0.3, 0.9])
                .describe(
                    '[min, max] length of a crack, as a share of the room between the hole and the patch edge',
                ),
            darkness: ratio().default(0.6).describe('darkness of the cracks, in [0, 1]'),
        })
        .prefault({})
        .describe('cracks in the wall around the hole, their lower edge catching the light'),
    dirt: dirtGroup().describe(
        'the earth filling the back of the hole: blotches, clods and pebbles, with its own palette',
    ),
});

export type BreachParams = z.output<typeof breachSchema>;

// each random decision draws from its own sequence
const SALT_OUTLINE = 1;
const SALT_CRACK = 2;
const SALT_DIRT = 3;
const SALT_GRAIN = 4;
const SALT_STROKE = 5;
const SALT_POCK = 6;
const SALT_RUBBLE = 7;

/** a place a crack starts from, on the outline, and the way it runs off */
type Source = { x: number; y: number; angle: number };

/** a hole, as a mask of the pixels it covers, and where its cracks start */
type Hole = {
    inside: Uint8Array;
    /** the start of the crack of the given index */
    crack(k: number): Source;
    /** brightness of the earth at a pixel, for a hole going deep into it: a tunnel */
    depthAt?(x: number, y: number): number;
};

/** tapering of the strokes of gashes and fissures, towards their tips */
const TAPER = 0.6;

/** spacing of the strokes of a gash, in stroke widths */
const SPACING = 1.6;

/** a value smoothly varying along a stroke, in [-1, 1], from hashes a few pixels apart */
function wobble(seed: number, salt: number, k: number, t: number, period = 3): number {
    const i = Math.floor(t / period);
    const f = t / period - i;
    const a = hashRange(-1, 1, seed, salt, k, i);
    const b = hashRange(-1, 1, seed, salt, k, i + 1);
    return a + (b - a) * f;
}

/** the light comes from the top-left: the direction it comes from, normalized */
const [LX, LY] = [-Math.SQRT1_2, -Math.SQRT1_2];

/** light of the lower edge of a crack */
const CRACK_LIGHT = 0.2;

/** the outline wanders by this share of its radius, between the shards */
const FINE = 0.06;

/** translucent black darkens the wall below, translucent white lightens it */
function shadeWith(value: number): number {
    return Rainbow.fromRGBA(
        value < 0
            ? { r: 0, g: 0, b: 0, a: Math.min(1, -value) }
            : { r: 1, g: 1, b: 1, a: Math.min(1, value) },
    );
}

/**
 * The radius of a closed outline around its center, as a share of its full size, along
 * an angle in [0, 1) of a turn: control points alternately on the full radius and pushed
 * in, linearly interpolated, so that shards of wall jut into the hole between them.
 */
function outline(p: BreachParams, seed: number): (turn: number) => number {
    const count = p.hole.spikes * 2;
    const points = Array.from({ length: count }, (_, j) => {
        const at = (j + hashRange(-0.3, 0.3, seed, SALT_OUTLINE, j, 0)) / count;
        const notch =
            j % 2 === 1 ? p.hole.jaggedness * hashRange(0.4, 1, seed, SALT_OUTLINE, j, 1) : 0;
        const wander = FINE * hashRange(-1, 1, seed, SALT_OUTLINE, j, 2);
        return { at, r: clamp(1 - notch + wander, 0.1, 1) };
    });
    return (turn) => {
        // the control points on each side of the angle, the last one wrapping to the first
        const next = points.findIndex((q) => q.at > turn);
        const b = points[next < 0 ? 0 : next];
        const a = points[next < 0 ? count - 1 : (next - 1 + count) % count];
        const span = (b.at - a.at + 1) % 1 || 1;
        const t = ((turn - a.at + 1) % 1) / span;
        return a.r + (b.r - a.r) * t;
    };
}

/** the room from a point to the margin of the patch, along a direction */
function roomTo(
    x: number,
    y: number,
    dx: number,
    dy: number,
    width: number,
    height: number,
    margin: number,
): number {
    const tx = dx > 0 ? (width - margin - x) / dx : dx < 0 ? (margin - x) / dx : Infinity;
    const ty = dy > 0 ? (height - margin - y) / dy : dy < 0 ? (margin - y) / dy : Infinity;
    return Math.max(0, Math.min(tx, ty));
}

/**
 * A burst: one jagged hole in the middle of the patch, from round to a star of shards.
 * Its cracks start all around it.
 */
function burstHole(
    p: BreachParams,
    width: number,
    height: number,
    seed: number,
    margin: number,
): Hole {
    const cx = width / 2;
    const cy = height / 2;
    const rx = Math.max(0.5, Math.min(p.hole.size * cx, cx - margin));
    const ry = Math.max(0.5, Math.min(p.hole.size * cy, cy - margin));
    const radius = outline(p, seed);
    const turnOf = (x: number, y: number) => {
        const a = Math.atan2((y - cy) / ry, (x - cx) / rx) / (2 * Math.PI);
        return a < 0 ? a + 1 : a;
    };
    const inside = new Uint8Array(width * height);
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const [px, py] = [x + 0.5, y + 0.5];
            const r = Math.hypot((px - cx) / rx, (py - cy) / ry);
            inside[y * width + x] = r < radius(turnOf(px, py)) ? 1 : 0;
        }
    }
    return {
        inside,
        crack(k) {
            const angle = ((k + hash(seed, SALT_CRACK, k, 0)) / p.cracks.count) * 2 * Math.PI;
            const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
            const r0 = radius(turnOf(cx + ux * rx, cy + uy * ry));
            return { x: cx + ux * rx * r0, y: cy + uy * ry * r0, angle };
        },
    };
}

/**
 * The cracks of strokes: from their tips first, then from their sides, each running off
 * a little askew.
 */
function fromSources(sources: Source[], seed: number): Hole['crack'] {
    return (k) => {
        const source = sources[k % Math.max(1, sources.length)] ?? { x: 0, y: 0, angle: 0 };
        return { ...source, angle: source.angle + hashRange(-0.5, 0.5, seed, SALT_CRACK, k, 0) };
    };
}

/**
 * A gash: `count` parallel slashes across the middle of the patch, bowed and tapering to
 * a point at both ends, the middle one the longest, as torn by a claw.
 */
function gashHole(
    p: BreachParams,
    width: number,
    height: number,
    seed: number,
    margin: number,
): Hole {
    const a = (p.hole.angle * Math.PI) / 180;
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    const [vx, vy] = [-uy, ux];
    const n = p.hole.count;
    // the strokes side by side across the patch: closer, and thinner, when they do not fit
    const across =
        2 *
        Math.min(
            roomTo(width / 2, height / 2, vx, vy, width, height, margin),
            roomTo(width / 2, height / 2, -vx, -vy, width, height, margin),
        );
    let thickness = p.hole.width * Math.min(width, height);
    let spacing = thickness * SPACING;
    if (n > 1 && (n - 1) * spacing + thickness * 1.4 > across) {
        spacing = across / (n - 1 + 1.4 / SPACING);
        thickness = spacing / SPACING;
    }
    const strokes = Array.from({ length: n }, (_, k) => {
        const offset = (k - (n - 1) / 2) * spacing;
        const [x, y] = [width / 2 + vx * offset, height / 2 + vy * offset];
        const room = Math.min(
            roomTo(x, y, ux, uy, width, height, margin),
            roomTo(x, y, -ux, -uy, width, height, margin),
        );
        const outer = n > 1 ? Math.abs(k - (n - 1) / 2) / ((n - 1) / 2) : 0;
        const length =
            room * p.hole.size * (1 - 0.25 * outer) * hashRange(0.85, 1, seed, SALT_STROKE, k);
        return { x, y, length };
    });
    const inside = new Uint8Array(width * height);
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const [px, py] = [x + 0.5, y + 0.5];
            inside[y * width + x] = strokes.some((s, k) => {
                const t = (px - s.x) * ux + (py - s.y) * uy;
                if (Math.abs(t) >= s.length) {
                    return false;
                }
                const f = 1 - (t / s.length) ** 2;
                // bowed like a claw, ragged along its edges
                const bow = thickness * 0.4 * f;
                const ragged = 1 + 0.5 * p.hole.jaggedness * wobble(seed, SALT_STROKE, k, t);
                const across = (px - s.x) * vx + (py - s.y) * vy - bow;
                return Math.abs(across) < (thickness / 2) * f ** TAPER * ragged;
            })
                ? 1
                : 0;
        }
    }
    const sources = strokes.flatMap((s) => [
        { x: s.x + ux * s.length, y: s.y + uy * s.length, angle: a },
        { x: s.x - ux * s.length, y: s.y - uy * s.length, angle: a + Math.PI },
    ]);
    return { inside, crack: fromSources(sources, seed) };
}

/**
 * A fissure: one long split across the patch, zigzagging as the wall gave way, widest in
 * its middle and tapering to a point at both ends.
 */
function fissureHole(
    p: BreachParams,
    width: number,
    height: number,
    seed: number,
    margin: number,
): Hole {
    const a = (p.hole.angle * Math.PI) / 180;
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    const [vx, vy] = [-uy, ux];
    const [cx, cy] = [width / 2, height / 2];
    const thickness = p.hole.width * Math.min(width, height);
    const length =
        p.hole.size *
        Math.min(
            roomTo(cx, cy, ux, uy, width, height, margin),
            roomTo(cx, cy, -ux, -uy, width, height, margin),
        );
    // the zigzag: a lateral shift changing every few pixels, larger as it gets jagged
    const period = Math.max(3, thickness);
    const zigzag = (t: number) =>
        p.hole.jaggedness * thickness * 1.2 * wobble(seed, SALT_STROKE, 0, t + length, period);
    const half = (t: number) => (thickness / 2) * Math.max(0, 1 - (t / length) ** 2) ** TAPER;
    const inside = new Uint8Array(width * height);
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const [px, py] = [x + 0.5 - cx, y + 0.5 - cy];
            const t = px * ux + py * uy;
            if (Math.abs(t) < length) {
                const across = px * vx + py * vy - zigzag(t);
                inside[y * width + x] = Math.abs(across) < half(t) ? 1 : 0;
            }
        }
    }
    // the tips, then the sides of its wide middle
    const at = (t: number, side: number) => ({
        x: cx + ux * t + vx * (zigzag(t) + side * half(t)),
        y: cy + uy * t + vy * (zigzag(t) + side * half(t)),
    });
    const sources = [
        { ...at(length, 0), angle: a },
        { ...at(-length, 0), angle: a + Math.PI },
        { ...at(length / 3, 1), angle: a + Math.PI / 2 },
        { ...at(-length / 3, -1), angle: a - Math.PI / 2 },
    ];
    return { inside, crack: fromSources(sources, seed) };
}

/**
 * Pocks: `count` small jagged holes scattered over the span of the hole, apart from each
 * other, as left by catapult shots. The cracks start around them.
 */
function pocksHole(
    p: BreachParams,
    width: number,
    height: number,
    seed: number,
    margin: number,
): Hole {
    const [cx, cy] = [width / 2, height / 2];
    const rx = Math.max(0.5, Math.min(p.hole.size * cx, cx - margin));
    const ry = Math.max(0.5, Math.min(p.hole.size * cy, cy - margin));
    const n = p.hole.count;
    const base = Math.min(rx, ry) * (n > 1 ? 0.9 / Math.sqrt(n) : 1);
    const pocks: { x: number; y: number; r: number; radius: (turn: number) => number }[] = [];
    for (let i = 0; i < n; ++i) {
        const size = base * hashRange(0.55, 1, seed, SALT_POCK, i);
        // tries at a place apart from the others, the pock shrinking after a few failures
        for (let attempt = 0; attempt < 32; ++attempt) {
            const r = size * Math.min(1, 0.9 ** (attempt - 7));
            const x = cx + hashRange(-1, 1, seed, SALT_POCK, i, attempt, 0) * Math.max(0, rx - r);
            const y = cy + hashRange(-1, 1, seed, SALT_POCK, i, attempt, 1) * Math.max(0, ry - r);
            if (pocks.every((q) => Math.hypot(q.x - x, q.y - y) > q.r + r + 2)) {
                pocks.push({ x, y, r, radius: outline(p, hashSeed(seed, SALT_POCK, i)) });
                break;
            }
        }
    }
    const turnOf = (dx: number, dy: number) => {
        const a = Math.atan2(dy, dx) / (2 * Math.PI);
        return a < 0 ? a + 1 : a;
    };
    const inside = new Uint8Array(width * height);
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const [px, py] = [x + 0.5, y + 0.5];
            inside[y * width + x] = pocks.some((q) => {
                const [dx, dy] = [px - q.x, py - q.y];
                return Math.hypot(dx, dy) / q.r < q.radius(turnOf(dx, dy));
            })
                ? 1
                : 0;
        }
    }
    return {
        inside,
        crack(k) {
            const q = pocks[k % Math.max(1, pocks.length)];
            const angle = hash(seed, SALT_CRACK, k, 0) * 2 * Math.PI;
            if (!q) {
                return { x: cx, y: cy, angle };
            }
            const r = q.r * q.radius(turnOf(Math.cos(angle), Math.sin(angle)));
            return { x: q.x + Math.cos(angle) * r, y: q.y + Math.sin(angle) * r, angle };
        },
    };
}

/**
 * A collapse: a bite out of the wall, from the top of the patch down, widest at the top
 * and narrowing to its foot, where the rubble heaps. Its cracks run off its upper corners
 * and its foot.
 */
function collapseHole(
    p: BreachParams,
    width: number,
    height: number,
    seed: number,
    margin: number,
): Hole {
    const cx = width / 2;
    const top = margin;
    const depth = Math.max(1, p.hole.size * (height - 2 * margin));
    const half = Math.max(0.5, p.hole.size * (cx - margin));
    const jag = p.hole.jaggedness;
    // the sides, each wandering on its own; the top, broken into teeth
    const side = (k: number, y: number) => {
        const t = Math.min(1, (y - top) / depth);
        return (
            half *
            Math.sqrt(Math.max(0, 1 - t * t)) *
            (1 + 0.35 * jag * wobble(seed, SALT_STROKE, k, y))
        );
    };
    const teeth = (x: number) => jag * 3 * (1 + wobble(seed, SALT_STROKE, 2, x, 2));
    const inside = new Uint8Array(width * height);
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const [px, py] = [x + 0.5, y + 0.5];
            if (py >= top + teeth(px) && py < top + depth) {
                const dx = px - cx;
                inside[y * width + x] = (dx < 0 ? -dx < side(0, py) : dx < side(1, py)) ? 1 : 0;
            }
        }
    }
    const sources = [
        { x: cx, y: top + depth, angle: Math.PI / 2 },
        { x: cx - half, y: top + 1, angle: Math.PI * 0.9 },
        { x: cx + half, y: top + 1, angle: Math.PI * 0.1 },
        { x: cx - side(0, top + depth / 2), y: top + depth / 2, angle: Math.PI },
        { x: cx + side(1, top + depth / 2), y: top + depth / 2, angle: 0 },
    ];
    return { inside, crack: fromSources(sources, seed) };
}

/**
 * A bore: a clean round tunnel into the earth, as dug by a giant worm; its far end is
 * dark, its lower-right side lit by the light coming in from the top-left.
 */
function boreHole(
    p: BreachParams,
    width: number,
    height: number,
    seed: number,
    margin: number,
): Hole {
    const [cx, cy] = [width / 2, height / 2];
    const radius = Math.max(0.5, p.hole.size * (Math.min(cx, cy) - margin));
    // barely wobbling: a clean cut
    const edge = (x: number, y: number) =>
        radius *
        (1 + 0.08 * p.hole.jaggedness * wobble(seed, SALT_STROKE, 0, Math.atan2(y, x) * radius, 2));
    const inside = new Uint8Array(width * height);
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const [dx, dy] = [x + 0.5 - cx, y + 0.5 - cy];
            inside[y * width + x] = Math.hypot(dx, dy) < edge(dx, dy) ? 1 : 0;
        }
    }
    return {
        inside,
        crack(k) {
            const angle = ((k + hash(seed, SALT_CRACK, k, 0)) / p.cracks.count) * 2 * Math.PI;
            const r = edge(Math.cos(angle), Math.sin(angle));
            return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, angle };
        },
        depthAt(x, y) {
            const [dx, dy] = [x + 0.5 - cx, y + 0.5 - cy];
            const r = clamp(Math.hypot(dx, dy) / radius);
            // the side facing the light coming in, at the bottom-right
            const lit = r > 0 ? Math.max(0, -(dx * LX + dy * LY) / (r * radius)) : 0;
            return (0.12 + 0.88 * r ** 1.4) * (1 + 0.35 * lit * r);
        },
    };
}

/**
 * Slits: `count` narrow vertical arrow slits side by side, hacked into the wall, with a
 * round hole at both ends, and a horizontal slit across when `cross` is set.
 */
function slitsHole(
    p: BreachParams,
    width: number,
    height: number,
    seed: number,
    margin: number,
): Hole {
    const n = p.hole.count;
    const cy = height / 2;
    const spacing = (width - 2 * margin) / n;
    const thickness = Math.min(p.hole.width * Math.min(width, height), spacing * 0.35);
    const oillet = thickness * 0.9;
    const half = Math.max(1, p.hole.size * (cy - margin) - oillet);
    // the arms of the crosses keep clear of the next slit
    const arm = Math.min(thickness * 2.4, spacing * 0.35);
    // hacked, not cut: the edges wander
    const hacked = (k: number, t: number) =>
        1 + 0.5 * p.hole.jaggedness * wobble(seed, SALT_STROKE, k, t, 2);
    const slits = Array.from({ length: n }, (_, k) => margin + spacing * (k + 0.5));
    const inside = new Uint8Array(width * height);
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const [px, py] = [x + 0.5, y + 0.5];
            inside[y * width + x] = slits.some((sx, k) => {
                const [dx, dy] = [px - sx, py - cy];
                const w = (thickness / 2) * hacked(k, py);
                return (
                    (Math.abs(dx) < w && Math.abs(dy) < half) ||
                    Math.hypot(dx, Math.abs(dy) - half) < oillet ||
                    (p.hole.cross &&
                        Math.abs(dy) < (thickness / 2) * hacked(k + n, px) &&
                        Math.abs(dx) < arm)
                );
            })
                ? 1
                : 0;
        }
    }
    const sources = slits.flatMap((sx) => [
        { x: sx, y: cy - half - oillet, angle: -Math.PI / 2 },
        { x: sx, y: cy + half + oillet, angle: Math.PI / 2 },
    ]);
    return { inside, crack: fromSources(sources, seed) };
}

/**
 * The color of a stone of rubble at a pixel: stones of about `size` pixels, lit from the
 * top-left, dark gaps between them.
 */
function rubbleColor(
    p: BreachParams,
    stones: number[],
    seed: number,
    x: number,
    y: number,
): number {
    const s = p.rubble.size;
    const [px, py] = [x + 0.5, y + 0.5];
    const [gx, gy] = [Math.floor(px / s), Math.floor(py / s)];
    let [d1, d2, sx, sy, cell] = [Infinity, Infinity, 0, 0, [0, 0]];
    for (let j = -1; j <= 1; ++j) {
        for (let i = -1; i <= 1; ++i) {
            const [cxs, cys] = [gx + i, gy + j];
            const ox = (cxs + hash(seed, SALT_RUBBLE, cxs, cys, 0)) * s;
            const oy = (cys + hash(seed, SALT_RUBBLE, cxs, cys, 1)) * s;
            const d = Math.hypot(px - ox, py - oy);
            if (d < d1) {
                [d2, d1, sx, sy, cell] = [d1, d, ox, oy, [cxs, cys]];
            } else if (d < d2) {
                d2 = d;
            }
        }
    }
    const tone = 0.25 + 0.5 * hash(seed, SALT_RUBBLE, cell[0], cell[1], 2);
    const facing = clamp(((px - sx) * LX + (py - sy) * LY) / (s * 0.6), -1, 1);
    const gap = d2 - d1 < 0.9 ? 0.45 : 1;
    return shade(sample(stones, tone), (1 + 0.45 * facing) * gap);
}

/** the hole of each shape */
const HOLES: Record<
    BreachParams['hole']['shape'],
    (p: BreachParams, width: number, height: number, seed: number, margin: number) => Hole
> = {
    burst: burstHole,
    gash: gashHole,
    fissure: fissureHole,
    pocks: pocksHole,
    collapse: collapseHole,
    bore: boreHole,
    slits: slitsHole,
};

/**
 * A hole broken through a wall, as by a siege ram, a dragon's claw or an explosion: a
 * jagged outline, the broken wall shaded inside it and on its lip, the earth behind the
 * wall filling it, and cracks running out into the wall. The light comes from the
 * top-left: the broken faces at the bottom-right of the hole are lit, those at its
 * top-left in shadow, casting a shadow on the earth. Transparent elsewhere.
 */
export const breach = defineGenerator({
    name: 'breach',
    description: 'Hole broken through a wall: a jagged outline, a beveled rim and earth behind',
    category: 'architecture',
    schema: breachSchema,
    overlay: true,
    anchors: {
        center: 'center of the hole: the pixel of the hole nearest to the middle of the patch',
        bottom: 'bottom of the hole, below its center: where rubble rests',
    },
    render(p, { width, height, seed }) {
        // the hole, fitting in the patch with its bevel and a pixel to spare
        const margin = p.bevel + 1;
        const hole = HOLES[p.hole.shape](p, width, height, seed, margin);
        const inside = hole.inside;
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                if (x < margin || y < margin || x >= width - margin || y >= height - margin) {
                    inside[y * width + x] = 0;
                }
            }
        }
        const isInside = (x: number, y: number) =>
            x >= 0 && y >= 0 && x < width && y < height && inside[y * width + x] === 1;

        // distance of each pixel to the outline, and the way to it: from a pixel of the
        // hole, towards the wall; from a pixel of the wall, towards the hole. The way is
        // averaged over the pixels across the outline, the nearest weighing the most, so
        // that the light turns smoothly around the hole
        const reach = Math.max(p.depth, p.bevel) + 2;
        const nearest = (x: number, y: number) => {
            const own = isInside(x, y);
            let [d, sx, sy] = [Infinity, 0, 0];
            for (let j = -reach; j <= reach; ++j) {
                for (let i = -reach; i <= reach; ++i) {
                    const [qx, qy] = [x + i, y + j];
                    // beyond the edges of the patch lies the wall
                    const other = own
                        ? !isInside(qx, qy)
                        : qx >= 0 && qy >= 0 && qx < width && qy < height && isInside(qx, qy);
                    if (other) {
                        const di = Math.hypot(i, j);
                        d = Math.min(d, di);
                        sx += i / di ** 3;
                        sy += j / di ** 3;
                    }
                }
            }
            const n = Math.hypot(sx, sy) || 1;
            return { d, dx: sx / n, dy: sy / n };
        };

        const near = Array.from({ length: width * height }, (_, i) =>
            nearest(i % width, Math.floor(i / width)),
        );
        // the broken wall takes at most half the depth of each piece of the hole, so that a
        // narrow one, a slash, a split or a small pock, still shows the earth in its middle;
        // distances are measured from the pixel center to the edge of the pixel across the
        // outline
        const piece = new Int32Array(width * height).fill(-1);
        const deepest: number[] = [];
        for (let i = 0; i < inside.length; ++i) {
            if (!inside[i] || piece[i] >= 0) {
                continue;
            }
            const id = deepest.push(0) - 1;
            const stack = [i];
            piece[i] = id;
            while (stack.length > 0) {
                const j = stack.pop()!;
                deepest[id] = Math.max(deepest[id], near[j].d - 0.5);
                const [x, y] = [j % width, Math.floor(j / width)];
                for (const [nx, ny] of [
                    [x - 1, y],
                    [x + 1, y],
                    [x, y - 1],
                    [x, y + 1],
                ]) {
                    const k = ny * width + nx;
                    if (isInside(nx, ny) && piece[k] < 0) {
                        piece[k] = id;
                        stack.push(k);
                    }
                }
            }
        }
        const rimAt = (i: number) => Math.min(p.depth, deepest[piece[i]] / 2);
        // the earth: the hole, but for the broken wall around it
        const isEarth = (x: number, y: number) =>
            isInside(x, y) && near[y * width + x].d - 0.5 >= rimAt(y * width + x);

        const texture = new Texture(width, height);
        const earth = new Dirt(hashSeed(seed, SALT_DIRT), width, height, p.dirt);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const { d, dx, dy } = near[y * width + x];
                if (isInside(x, y)) {
                    const depth = d - 0.5;
                    const rim = rimAt(y * width + x);
                    if (depth < rim) {
                        // the broken wall, facing the middle of the hole: lit at the
                        // bottom-right, where it faces up and left
                        const facing = -(dx * LX + dy * LY);
                        const rough = (hash(seed, SALT_GRAIN, x, y) - 0.5) * p.rim.grain;
                        const value =
                            (facing > 0 ? facing * p.rim.light : facing * p.rim.dark) -
                            p.rim.falloff * ((depth + 1) / Math.max(1, rim)) +
                            rough;
                        texture.setPixel(x, y, shadeWith(value));
                        continue;
                    }
                    // the earth, set back, in the shadow of the broken edge above and on the
                    // left
                    const o = p.shadow.offset;
                    const shadowed = o > 0 && !isEarth(x - o, y - o);
                    const color = shadeRGBA(
                        earth.color(x, y),
                        (1 - p.shadow.recess) *
                            (shadowed ? 1 - p.shadow.opacity : 1) *
                            (hole.depthAt?.(x, y) ?? 1),
                    );
                    texture.setPixel(x, y, Rainbow.fromRGBA({ ...color, a: 1 }));
                    continue;
                }
                if (d - 0.5 < p.bevel) {
                    // the lip of the wall face, rounded into the hole: it faces the way
                    // the broken wall below it does, less steeply
                    const facing = dx * LX + dy * LY;
                    const soft = 0.6 * (1 - (d - 0.5) / Math.max(1, p.bevel));
                    texture.setPixel(
                        x,
                        y,
                        shadeWith(soft * (facing > 0 ? facing * p.rim.light : facing * p.rim.dark)),
                    );
                }
            }
        }

        // rubble: a mound at the foot of each piece of the hole, highest in its middle,
        // resting on its lowest pixels
        const amount = p.rubble.amount ?? (p.hole.shape === 'collapse' ? 0.4 : 0);
        if (amount > 0) {
            const stones = createGradient(p.rubble.palette);
            const box = deepest.map(() => ({ left: width, right: -1, top: height, bottom: -1 }));
            // the lowest pixel of each piece in each column
            const floor = new Map<number, number>();
            for (let i = 0; i < inside.length; ++i) {
                if (inside[i]) {
                    const [x, y] = [i % width, Math.floor(i / width)];
                    const b = box[piece[i]];
                    [b.left, b.right] = [Math.min(b.left, x), Math.max(b.right, x)];
                    [b.top, b.bottom] = [Math.min(b.top, y), Math.max(b.bottom, y)];
                    const key = piece[i] * width + x;
                    floor.set(key, Math.max(floor.get(key) ?? -1, y));
                }
            }
            for (let i = 0; i < inside.length; ++i) {
                if (!inside[i]) {
                    continue;
                }
                const [x, y] = [i % width, Math.floor(i / width)];
                const b = box[piece[i]];
                const mid = (b.left + b.right + 1) / 2;
                const halfWidth = Math.max(1, (b.right - b.left + 1) / 2);
                const mound =
                    Math.sqrt(Math.max(0, 1 - ((x + 0.5 - mid) / halfWidth) ** 2)) *
                    (0.85 + 0.15 * wobble(seed, SALT_RUBBLE, piece[i], x, 2));
                const heap = amount * (b.bottom - b.top + 1) * mound;
                if (y > floor.get(piece[i] * width + x)! - heap) {
                    texture.setPixel(x, y, rubbleColor(p, stones, seed, x, y));
                }
            }
        }

        // cracks, from the outline out into the wall, wandering, never leaving the patch
        const crack = new Uint8Array(width * height);
        for (let k = 0; k < p.cracks.count; ++k) {
            // the start, on the outline; the room to the edge of the patch along the angle
            let { x, y, angle } = hole.crack(k);
            const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
            const tx = ux > 0 ? (width - x) / ux : ux < 0 ? -x / ux : Infinity;
            const ty = uy > 0 ? (height - y) / uy : uy < 0 ? -y / uy : Infinity;
            const [min, max] = p.cracks.length;
            const length = Math.min(tx, ty) * hashRange(min, max, seed, SALT_CRACK, k, 1);
            for (let step = 0; step < length; ++step) {
                angle += hashRange(-0.5, 0.5, seed, SALT_CRACK, k, 2, step);
                x += Math.cos(angle);
                y += Math.sin(angle);
                const [ix, iy] = [Math.floor(x), Math.floor(y)];
                if (ix < 0 || iy < 0 || ix >= width || iy >= height) {
                    break;
                }
                if (!inside[iy * width + ix]) {
                    crack[iy * width + ix] = 1;
                }
            }
        }
        const dark = shadeWith(-p.cracks.darkness);
        const lit = shadeWith(CRACK_LIGHT * p.cracks.darkness);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const i = y * width + x;
                if (crack[i]) {
                    texture.setPixel(x, y, dark);
                } else if (
                    !inside[i] &&
                    x > 0 &&
                    y > 0 &&
                    crack[i - width - 1] &&
                    (texture.getPixel(x, y) & 0xff) === 0
                ) {
                    // the lower-right edge of a crack, catching the light
                    texture.setPixel(x, y, lit);
                }
            }
        }

        // the center: the middle of the patch, or the pixel of the hole nearest to it; the
        // bottom of the hole below it
        let center = {
            x: Math.min(width - 1, Math.floor(width / 2)),
            y: Math.min(height - 1, Math.floor(height / 2)),
        };
        if (!inside[center.y * width + center.x]) {
            let best = Infinity;
            for (let i = 0; i < inside.length; ++i) {
                const [x, y] = [i % width, Math.floor(i / width)];
                const d = Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2);
                if (inside[i] && d < best) {
                    best = d;
                    center = { x, y };
                }
            }
        }
        let bottom = center.y;
        while (bottom + 1 < height && inside[(bottom + 1) * width + center.x]) {
            ++bottom;
        }
        texture.anchors = { center: [center], bottom: [{ x: center.x, y: bottom }] };
        return texture;
    },
});
