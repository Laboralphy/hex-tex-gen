import { Bresenham, FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge, rangeAtAge } from '../core/age';
import { hash, hashRange } from '../core/hash';
import { createGradient, sample, shade } from '../core/palette';
import { color, DETAIL, LAYOUT, palette, range, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { checkPanelFits, computeAshlarLayout, NO_PANEL, panelGroup, panelRect } from './ashlar';
import { defineGenerator } from './define';

/** suffix of the descriptions of wear parameters */
const AGE = ' when unset, derived from age';

/**
 * Parameters of the metal template. "Layout" values are expressed at the patch's own
 * `size` and scale with it; "detail" values are real pixels and never scale.
 */
export const metalSchema = z
    .strictObject({
        size: size()
            .default([64, 64])
            .describe('own size of the patch in pixels; layout values are expressed at this size'),
        rows: z
            .strictObject({
                count: z
                    .number()
                    .int()
                    .min(1)
                    .default(2)
                    .describe('number of rows of plates')
                    .meta(LAYOUT),
                heightVariation: z
                    .number()
                    .min(0)
                    .lt(1)
                    .default(0)
                    .describe('random height variation between rows, in [0, 1)')
                    .meta(LAYOUT),
            })
            .prefault({})
            .describe('rows of plates'),
        blocks: z
            .strictObject({
                width: range(z.number().positive())
                    .default([32, 32])
                    .describe('[min, max] plate width')
                    .meta(LAYOUT),
                minJointOffset: z
                    .number()
                    .min(0)
                    .default(4)
                    .describe(
                        'minimum horizontal distance between a seam and the seams of adjacent rows (random bond only)',
                    )
                    .meta(LAYOUT),
                bond: z
                    .enum(['random', 'running', 'stack'])
                    .default('stack')
                    .describe(
                        'stack: equal plates, seams aligned; running: rows offset by half a plate; random: plates of random width',
                    ),
            })
            .prefault({})
            .describe('plates within a row'),
        panel: panelGroup({ ...NO_PANEL, width: 40, height: 32, shade: 1.05 }),
        seam: z
            .strictObject({
                size: z
                    .number()
                    .int()
                    .min(0)
                    .default(1)
                    .describe('seam thickness, in pixels')
                    .meta(DETAIL),
                color: color().default('#0e1012').describe('seam color'),
            })
            .prefault({})
            .describe('seams between plates'),
        bevel: z
            .strictObject({
                size: z
                    .number()
                    .int()
                    .min(0)
                    .default(1)
                    .describe('bevel width, in pixels')
                    .meta(DETAIL),
                light: z
                    .number()
                    .min(0)
                    .default(1.3)
                    .describe('brightness factor of the top and left edges'),
                dark: z
                    .number()
                    .min(0)
                    .default(0.65)
                    .describe('brightness factor of the bottom and right edges'),
            })
            .prefault({})
            .describe('plate edges lit from the top-left'),
        metal: z
            .strictObject({
                palette: palette()
                    .default(['#2b2f33', '#474d53', '#687077', '#8f979e'])
                    .describe('metal colors, from darkest to lightest'),
                sheen: ratio()
                    .default(0.3)
                    .describe('sheen across each plate, lighter towards the top-left'),
                brushed: ratio().default(0.15).describe('horizontal brushed streaks, in [0, 1]'),
                shadeVariation: ratio()
                    .default(0.08)
                    .describe('random brightness variation between plates, in [0, 1]'),
                grain: ratio()
                    .default(0.03)
                    .describe('random brightness variation between pixels, in [0, 1]')
                    .meta(DETAIL),
            })
            .prefault({})
            .describe('metal surface'),
        rivets: z
            .strictObject({
                enabled: z.boolean().default(true).describe('rivets along the plate edges'),
                spacing: z
                    .number()
                    .int()
                    .min(2)
                    .default(8)
                    .describe('distance between rivets along an edge, in pixels')
                    .meta(DETAIL),
                inset: z
                    .number()
                    .int()
                    .min(0)
                    .default(2)
                    .describe('distance of the rivets from the plate edges, in pixels')
                    .meta(DETAIL),
            })
            .prefault({})
            .describe('rivets fixing the plates, lit from the top-left'),
        age: ratio()
            .default(0.3)
            .describe(
                'overall weathering, from 0 (new) to 1 (ruined): sets every wear parameter left unset',
            ),
        rust: z
            .strictObject({
                coverage: ratio()
                    .optional()
                    .describe(`share of the surface rusted, growing from the seams;${AGE}`),
                palette: palette()
                    .default(['#3a1c0c', '#6b3314', '#9a4e1e', '#bf6e2e'])
                    .describe('rust colors, from darkest to lightest'),
                streaks: ratio()
                    .optional()
                    .describe(`ratio of rivets with a rust streak running down;${AGE}`),
                length: range(z.number().min(0))
                    .optional()
                    .describe(`[min, max] length of the rust streaks, in pixels;${AGE}`)
                    .meta(DETAIL),
            })
            .prefault({})
            .describe('rust'),
        dents: z
            .strictObject({
                density: z.number().min(0).optional().describe(`dents per 32 × 32 pixels;${AGE}`),
                size: range(z.number().min(0))
                    .optional()
                    .describe(`[min, max] dent radius, in pixels;${AGE}`)
                    .meta(DETAIL),
            })
            .prefault({})
            .describe('dents, shaded against the light'),
        scratches: z.number().min(0).optional().describe(`scratches per 32 × 32 pixels;${AGE}`),
        tarnish: ratio().optional().describe(`dulled, darkened metal, in [0, 1];${AGE}`),
    })
    .superRefine((p, ctx) => {
        checkPanelFits(p, ctx);
        if (p.blocks.bond === 'running' && p.rows.count % 2 === 1) {
            ctx.addIssue({
                code: 'custom',
                path: ['rows', 'count'],
                message: 'a running bond needs an even number of rows to tile vertically',
            });
        }
    });

export type MetalParams = z.output<typeof metalSchema>;

/**
 * Wear values of a metal wall, every one resolved.
 */
export type MetalWear = {
    rust: { coverage: number; streaks: number; length: [number, number] };
    dents: { density: number; size: [number, number] };
    scratches: number;
    tarnish: number;
};

/**
 * Resolves the wear values of a metal wall: values set in the parameters win, the others
 * are derived from `age`.
 */
export function metalWear(p: MetalParams): MetalWear {
    const a = p.age;
    return {
        rust: {
            coverage: p.rust.coverage ?? atAge(a, [0, 0.08, 0.5]),
            streaks: p.rust.streaks ?? atAge(a, [0, 0.15, 0.6]),
            length:
                p.rust.length ??
                rangeAtAge(a, [
                    [2, 4],
                    [3, 8],
                    [6, 18],
                ]),
        },
        dents: {
            density: p.dents.density ?? atAge(a, [0, 0.5, 3]),
            size:
                p.dents.size ??
                rangeAtAge(a, [
                    [1, 2],
                    [1.5, 3],
                    [2, 5],
                ]),
        },
        scratches: p.scratches ?? atAge(a, [0, 0.5, 2.5]),
        tarnish: p.tarnish ?? atAge(a, [0, 0.1, 0.35]),
    };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_PLATE = 2;
const SALT_GRAIN = 3;
const SALT_DENT = 4;
const SALT_SCRATCH = 5;
const SALT_STREAK = 6;

function mod(a: number, n: number): number {
    return ((a % n) + n) % n;
}

/**
 * Metal wall: plates joined by thin seams and fixed with rivets; rust, dents and scratches
 * come with age. Like the other walls, it can have a panel, a larger plate.
 */
export const metal = defineGenerator({
    name: 'metal',
    description: 'Metal wall of riveted plates, rusting and dented with age',
    schema: metalSchema,
    anchors: {
        rows: 'left edge and top of the plate faces of each row, just below the seam',
        plates: 'top-left corner of the face of each plate, row by row',
        panel: 'top-left corner of the face of the panel, when enabled',
        panelCenter: 'center of the face of the panel, when enabled',
    },
    render(p, { width, height, seed }) {
        const wear = metalWear(p);
        const layout = computeAshlarLayout(p, seed, width, height);
        const panel = panelRect(p, layout, width, height);
        const texture = new Texture(width, height);
        const metalPalette = createGradient(p.metal.palette);
        const rustPalette = createGradient(p.rust.palette);
        const seamColor = Rainbow.parse(p.seam.color);
        const cells = (px: number) => Math.max(1, Math.round(px));
        const noiseSeed = (i: number) => Math.floor(hash(seed, SALT_NOISE, i) * 4294967296);
        // brushed streaks: long and horizontal, fine vertically, in real pixels
        const brushed = new FractalNoise({
            seed: noiseSeed(0),
            period: [cells(width / 24), cells(height / 1.5)],
            octaves: 2,
        });
        // rust patches scale with the wall
        const rustNoise = new FractalNoise({ seed: noiseSeed(1), period: 4, octaves: 4 });
        const tarnishNoise = new FractalNoise({ seed: noiseSeed(2), period: 3, octaves: 3 });

        // every plate, and its rectangle in pixels; the panel is one more plate
        const plates = layout.flatMap((row, r) =>
            row.blocks.map((block, i) => ({
                r,
                i,
                x: block.x,
                y: row.y,
                w: block.width,
                h: row.height,
            })),
        );
        const plateIndex = layout.map((row, r) =>
            row.blocks.map((_, i) => plates.findIndex((q) => q.r === r && q.i === i)),
        );
        const panelId = panel ? plates.push({ r: layout.length, i: 0, ...panel }) - 1 : -1;

        // a seam of n pixels: the plate after it (below, right) takes the larger half
        const after = Math.ceil(p.seam.size / 2);
        const before = Math.floor(p.seam.size / 2);
        const ids = new Int32Array(width * height).fill(-1);
        // distance of each plate pixel to its seams, for the rust growing from them
        const edge = new Float32Array(width * height);

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const px = x + 0.5;
                const py = y + 0.5;
                const inPanel =
                    panel !== undefined &&
                    mod(px - panel.x, width) < panel.w &&
                    mod(py - panel.y, height) < panel.h;
                let id = panelId;
                if (!inPanel) {
                    const r = layout.findIndex((row) => py >= row.y && py < row.y + row.height);
                    const i = layout[r].blocks.findIndex((b) => mod(px - b.x, width) < b.width);
                    id = plateIndex[r][i];
                }
                const plate = plates[id];
                const lx = mod(px - plate.x, width);
                const ly = mod(py - plate.y, height);
                const dl = lx - after;
                const dr = plate.w - lx - before;
                const dt = ly - after;
                const db = plate.h - ly - before;
                const d = Math.min(dl, dr, dt, db);
                if (d < 0) {
                    texture.setPixel(x, y, seamColor);
                    continue;
                }
                ids[y * width + x] = id;
                edge[y * width + x] = d;

                const u = x / width;
                const v = y / height;
                // sheen: lighter towards the top-left of each plate
                const across = (lx / plate.w + ly / plate.h) / 2;
                const shift = (hash(seed, SALT_PLATE, plate.r, plate.i) - 0.5) * 0.15;
                const tone =
                    0.55 +
                    p.metal.sheen * (0.5 - across) +
                    p.metal.brushed * (brushed.sample(u, v) - 0.5) * 2 +
                    shift;
                let colour = sample(metalPalette, tone);
                if (d < p.bevel.size) {
                    colour = shade(colour, d === dl || d === dt ? p.bevel.light : p.bevel.dark);
                }
                const brightness =
                    (1 +
                        (hash(seed, SALT_PLATE, plate.r, plate.i, 1) - 0.5) *
                            2 *
                            p.metal.shadeVariation) *
                    (1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.metal.grain) *
                    (inPanel ? p.panel.shade : 1);
                texture.setPixel(x, y, shade(colour, brightness));
            }
        }

        // dents: depressions, their top-left side in shadow, their bottom-right side lit
        const area = (width * height) / 1024;
        const dentCount = Math.round(wear.dents.density * area);
        for (let k = 0; k < dentCount; ++k) {
            const cx = hash(seed, SALT_DENT, k, 0) * width;
            const cy = hash(seed, SALT_DENT, k, 1) * height;
            const radius = hashRange(wear.dents.size[0], wear.dents.size[1], seed, SALT_DENT, k, 2);
            const id = ids[Math.floor(cy) * width + Math.floor(cx)];
            if (id < 0) {
                continue;
            }
            for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); ++y) {
                for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); ++x) {
                    const dx = x + 0.5 - cx;
                    const dy = y + 0.5 - cy;
                    const s = Math.hypot(dx, dy) / radius;
                    const i = mod(y, height) * width + mod(x, width);
                    if (s >= 1 || ids[i] !== id) {
                        continue;
                    }
                    const side = (dx + dy) / Math.max(0.001, Math.hypot(dx, dy));
                    const f = 1 + 0.35 * side * (1 - s * s);
                    texture.setPixel(x, y, shade(texture.getPixel(x, y), f));
                }
            }
        }

        // scratches: short bright lines, within a plate
        const scratchCount = Math.round(wear.scratches * area);
        for (let k = 0; k < scratchCount; ++k) {
            const x0 = hash(seed, SALT_SCRATCH, k, 0) * width;
            const y0 = hash(seed, SALT_SCRATCH, k, 1) * height;
            const angle = hash(seed, SALT_SCRATCH, k, 2) * Math.PI;
            const length = hashRange(3, 8, seed, SALT_SCRATCH, k, 3);
            const id = ids[Math.floor(y0) * width + Math.floor(x0)];
            if (id < 0) {
                continue;
            }
            Bresenham.line(
                Math.round(x0),
                Math.round(y0),
                Math.round(x0 + Math.cos(angle) * length),
                Math.round(y0 + Math.sin(angle) * length),
                (x, y) => {
                    if (ids[mod(y, height) * width + mod(x, width)] !== id) {
                        return false;
                    }
                    texture.setPixel(x, y, shade(texture.getPixel(x, y), 1.25));
                    return true;
                },
            );
        }

        // rivets along the plate edges, and at their corners
        const rivets: [number, number][] = [];
        // a rivet shows only where its plate does: not on the panel covering it
        const addRivet = (x: number, y: number, id: number) => {
            if (ids[mod(y, height) * width + mod(x, width)] === id) {
                rivets.push([x, y]);
            }
        };
        if (p.rivets.enabled) {
            const inset = p.rivets.inset + after;
            plates.forEach((plate, id) => {
                const x0 = plate.x + inset;
                const y0 = plate.y + inset;
                const x1 = plate.x + plate.w - before - p.rivets.inset - 2;
                const y1 = plate.y + plate.h - before - p.rivets.inset - 2;
                if (x1 < x0 || y1 < y0) {
                    return;
                }
                const along = (from: number, to: number) => {
                    const count = Math.max(1, Math.round((to - from) / p.rivets.spacing));
                    return Array.from({ length: count + 1 }, (_, k) =>
                        Math.round(from + ((to - from) * k) / count),
                    );
                };
                for (const x of along(x0, x1)) {
                    addRivet(x, Math.round(y0), id);
                    addRivet(x, Math.round(y1), id);
                }
                for (const y of along(y0, y1).slice(1, -1)) {
                    addRivet(Math.round(x0), y, id);
                    addRivet(Math.round(x1), y, id);
                }
            });
            for (const [x, y] of rivets) {
                const base = texture.getPixel(x, y);
                texture.setPixel(x, y, shade(base, 1.6));
                texture.setPixel(x + 1, y, shade(base, 1.1));
                texture.setPixel(x, y + 1, shade(base, 1.1));
                texture.setPixel(x + 1, y + 1, shade(base, 0.45));
            }
        }

        // rust: patches growing from the seams, then streaks running down from rivets
        const coverage = wear.rust.coverage;
        const streak = new Float32Array(width * height);
        rivets.forEach(([x, y], k) => {
            if (hash(seed, SALT_STREAK, k, 0) >= wear.rust.streaks) {
                return;
            }
            const length = hashRange(
                wear.rust.length[0],
                wear.rust.length[1],
                seed,
                SALT_STREAK,
                k,
                1,
            );
            for (let t = 2; t < length + 2; ++t) {
                const i = mod(y + t, height) * width + mod(x, width);
                if (ids[i] < 0) {
                    break;
                }
                streak[i] = Math.max(streak[i], 0.7 * (1 - (t - 2) / length));
            }
        });
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const i = y * width + x;
                if (ids[i] < 0) {
                    continue;
                }
                const u = x / width;
                const v = y / height;
                let rgba = Rainbow.convertToRGBA(texture.getPixel(x, y));
                // rust grows from the seams: the noise is raised near them
                const near = Math.max(0, 1 - edge[i] / 6);
                const n = rustNoise.sample(u, v) + near * 0.25;
                let amount = 0;
                if (coverage > 0) {
                    amount = Math.max(0, Math.min(1, (n - (1 - coverage)) / 0.12));
                }
                amount = Math.max(amount, streak[i]);
                if (amount > 0) {
                    const r = Rainbow.convertToRGBA(sample(rustPalette, n + 0.1));
                    rgba = {
                        r: rgba.r + (r.r - rgba.r) * amount,
                        g: rgba.g + (r.g - rgba.g) * amount,
                        b: rgba.b + (r.b - rgba.b) * amount,
                        a: 1,
                    };
                }
                if (wear.tarnish > 0) {
                    const f = 1 - wear.tarnish * (0.5 + 0.5 * tarnishNoise.sample(u, v));
                    rgba = { r: rgba.r * f, g: rgba.g * f, b: rgba.b * f, a: 1 };
                }
                texture.setPixel(x, y, Rainbow.fromRGBA(rgba));
            }
        }

        // first pixel row (or column) of a plate face
        const face = (e: number) => Math.ceil(e + after - 0.5);
        texture.anchors = {
            rows: layout.map((row) => ({ x: 0, y: face(row.y) })),
            plates: layout.flatMap((row) =>
                row.blocks.map((block) => ({ x: mod(face(block.x), width), y: face(row.y) })),
            ),
            panel: panel ? [{ x: mod(face(panel.x), width), y: mod(face(panel.y), height) }] : [],
            panelCenter: panel
                ? [
                      {
                          x: mod(Math.floor(panel.x + panel.w / 2), width),
                          y: mod(Math.floor(panel.y + panel.h / 2), height),
                      },
                  ]
                : [],
        };
        return texture;
    },
});
