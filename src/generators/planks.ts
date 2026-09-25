import { Bresenham, FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge, rangeAtAge } from '../core/age';
import { hash, hashRange } from '../core/hash';
import { createGradient, sample, shade } from '../core/palette';
import { color, DETAIL, LAYOUT, palette, range, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { defineGenerator } from './define';
import type { RenderContext } from './types';

/** suffix of the descriptions of wear parameters */
const AGE = ' when unset, derived from age';

/**
 * Parameters of the planks template. "Layout" values are expressed at the patch's own
 * `size` and scale with it; "detail" values are real pixels and never scale.
 */
export const planksSchema = z.strictObject({
    size: size()
        .default([64, 64])
        .describe('own size of the patch in pixels; layout values are expressed at this size'),
    direction: z
        .enum(['vertical', 'horizontal'])
        .default('vertical')
        .describe('direction of the planks'),
    lines: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(1)
                .default(4)
                .describe(
                    'number of lines of planks across the patch: columns of vertical planks, rows of horizontal ones; ignored when width is set',
                ),
            width: z
                .number()
                .positive()
                .optional()
                .describe(
                    'plank width, across the planks; when set, the lines are as many as this width fits in the patch',
                )
                .meta(LAYOUT),
            widthVariation: z
                .number()
                .min(0)
                .lt(1)
                .default(0.1)
                .describe('random width variation between lines, in [0, 1)')
                .meta(LAYOUT),
        })
        .prefault({})
        .describe('lines of planks across the patch, filling it exactly'),
    planks: z
        .strictObject({
            length: range(z.number().gt(0).max(1))
                .default([0.3, 1])
                .describe(
                    '[min, max] plank length, in fraction of the patch size along the planks (its height for vertical planks, its width for horizontal ones); [1, 1] gives planks running across the whole patch',
                )
                .meta(LAYOUT),
        })
        .prefault({})
        .describe('planks within a line, filling it exactly'),
    gap: z
        .strictObject({
            size: z
                .number()
                .int()
                .min(0)
                .default(1)
                .describe('gap between planks, in pixels')
                .meta(DETAIL),
            color: color().default('#140d08').describe('gap color'),
        })
        .prefault({})
        .describe('gaps between planks'),
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
                .default(1.2)
                .describe('brightness factor of the top and left edges'),
            dark: z
                .number()
                .min(0)
                .default(0.7)
                .describe('brightness factor of the bottom and right edges'),
        })
        .prefault({})
        .describe('plank edges lit from the top-left'),
    wood: z
        .strictObject({
            palette: palette()
                .default(['#3a2412', '#5e3b1f', '#7d5230', '#9c6b40'])
                .describe('wood colors, from darkest to lightest'),
            contrast: z
                .number()
                .min(0)
                .default(0.8)
                .describe('spread of the grain over the palette'),
            grain: z
                .number()
                .positive()
                .default(5)
                .describe('number of grain streaks across a plank'),
            shadeVariation: ratio()
                .default(0.12)
                .describe('random brightness variation between planks, in [0, 1]'),
            paletteShift: ratio()
                .default(0.12)
                .describe('random shift of each plank along the palette, in [0, 1]'),
            noise: ratio()
                .default(0.05)
                .describe('random brightness variation between pixels, in [0, 1]')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('wood surface'),
    knots: z
        .strictObject({
            ratio: ratio().default(0.25).describe('ratio of planks with a knot, in [0, 1]'),
            size: range(z.number().min(0))
                .default([1.5, 3])
                .describe('[min, max] knot radius, in pixels; the grain bends around it')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('knots in the wood'),
    nails: z
        .strictObject({
            ratio: ratio()
                .default(0.6)
                .describe('chance of a nail at each end of a plank, in [0, 1]'),
            inset: z
                .number()
                .int()
                .min(0)
                .default(2)
                .describe('distance of the nails from the plank ends, in pixels')
                .meta(DETAIL),
            color: color().default('#201c18').describe('nail color'),
        })
        .prefault({})
        .describe('nails at the ends of the planks'),
    age: ratio()
        .default(0.3)
        .describe(
            'overall weathering, from 0 (new) to 1 (ruined): sets every wear parameter left unset',
        ),
    weathering: ratio()
        .optional()
        .describe(`wood turned silver-grey by the weather, in [0, 1];${AGE}`),
    splits: z
        .strictObject({
            ratio: ratio().optional().describe(`ratio of split planks, in [0, 1];${AGE}`),
            length: range(z.number().min(0))
                .optional()
                .describe(`[min, max] split length, in pixels;${AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('splits along the grain'),
    edges: z
        .strictObject({
            roughness: z
                .number()
                .min(0)
                .optional()
                .describe(`maximum displacement of the plank outlines, in pixels;${AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('irregularity of plank outlines'),
    grime: ratio().optional().describe(`blotchy darkening of the whole wall, in [0, 1];${AGE}`),
});

export type PlanksParams = z.output<typeof planksSchema>;

/**
 * Wear values of a plank wall, every one resolved.
 */
export type PlanksWear = {
    weathering: number;
    splits: { ratio: number; length: [number, number] };
    roughness: number;
    grime: number;
};

/**
 * Resolves the wear values of a plank wall: values set in the parameters win, the others
 * are derived from `age`.
 */
export function planksWear(p: PlanksParams): PlanksWear {
    const a = p.age;
    return {
        weathering: p.weathering ?? atAge(a, [0, 0.15, 0.7]),
        splits: {
            ratio: p.splits.ratio ?? atAge(a, [0, 0.2, 0.7]),
            length:
                p.splits.length ??
                rangeAtAge(a, [
                    [4, 8],
                    [6, 16],
                    [12, 32],
                ]),
        },
        roughness: p.edges.roughness ?? atAge(a, [0.2, 0.5, 1.2]),
        grime: p.grime ?? atAge(a, [0, 0.1, 0.4]),
    };
}

/** a plank, in pixels of the rendered texture */
export type Plank = {
    /** top of the plank; planks wrap around the bottom edge */
    y: number;
    length: number;
};

/** a column of planks, in pixels of the rendered texture */
export type PlankColumn = {
    x: number;
    width: number;
    /** planks from top to bottom; a single plank runs the whole height, without an end */
    planks: Plank[];
};

// each random decision draws from its own sequence
const SALT_COLUMN = 1;
const SALT_LENGTH = 2;
const SALT_PHASE = 3;
const SALT_PLANK = 4;
const SALT_KNOT = 5;
const SALT_NAIL = 6;
const SALT_SPLIT = 7;
const SALT_NOISE = 8;
const SALT_GRAIN = 9;

// pixel marks of the split pass
const SPLIT = 1;
const HIGHLIGHT = 2;

function mod(a: number, n: number): number {
    return ((a % n) + n) % n;
}

function noiseSeed(seed: number, index: number): number {
    return Math.floor(hash(seed, SALT_NOISE, index) * 4294967296);
}

/**
 * Plank lengths of a column, in own pixels, summing exactly to the patch height.
 */
function columnLengths(p: PlanksParams, seed: number, column: number): number[] {
    const total = p.size[1];
    const min = p.planks.length[0] * total;
    const max = p.planks.length[1] * total;
    const lengths: number[] = [];
    let sum = 0;
    // draw planks until the column is full; the last one is cut to fit
    while (sum < total) {
        const rest = total - sum;
        const length = hashRange(min, max, seed, SALT_LENGTH, column, lengths.length);
        if (length < rest) {
            lengths.push(length);
            sum += length;
        } else if (rest >= min || lengths.length === 0) {
            lengths.push(rest);
            sum = total;
        } else {
            // the remainder is too short for a plank: share it with the previous one
            const both = lengths.pop()! + rest;
            lengths.push(...(both <= max ? [both] : [both / 2, both / 2]));
            sum = total;
        }
    }
    return lengths;
}

/**
 * Computes the columns and planks of a plank wall of vertical planks rendered at the given
 * size; horizontal planks are laid out the same way, with the width and the height swapped. The layout
 * is computed at the patch's own size and then scaled, so the same seed gives the same
 * planks at any size. Columns fill the width exactly and planks the height exactly, so
 * the texture tiles in both directions.
 */
export function computePlanksLayout(
    p: PlanksParams,
    seed: number,
    width: number,
    height: number,
): PlankColumn[] {
    const [ownWidth, ownHeight] = p.size;
    const count =
        p.lines.width === undefined
            ? p.lines.count
            : Math.max(1, Math.round(ownWidth / p.lines.width));
    const sy = height / ownHeight;

    // column widths, normalized to fill the width exactly
    const weights = Array.from(
        { length: count },
        (_, c) => 1 + p.lines.widthVariation * (2 * hash(seed, SALT_COLUMN, c) - 1),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    const bounds = [0];
    let acc = 0;
    for (const w of weights) {
        acc += w;
        bounds.push(Math.round((acc / total) * width));
    }

    return weights.map((_, c) => {
        const lengths = columnLengths(p, seed, c);
        // a random shift, so that the plank ends of neighbour columns do not line up
        let y = lengths.length > 1 ? hash(seed, SALT_PHASE, c) * ownHeight : 0;
        const planks = lengths.map((length) => {
            const plank = { y: mod(y * sy, height), length: length * sy };
            y += length;
            return plank;
        });
        return { x: bounds[c], width: bounds[c + 1] - bounds[c], planks };
    });
}

/**
 * Vertical wooden planks of variable length, with knots and nails.
 */
export const planks = defineGenerator({
    name: 'planks',
    description: 'Wall of vertical wooden planks of variable length',
    schema: planksSchema,
    anchors: {
        lines: 'start of each line of plank faces: top of each column of vertical planks, left of each row of horizontal ones',
        planks: 'top-left corner of the face of each plank having ends, column by column; planks running the whole height have none',
    },
    render(p, { width, height, seed }) {
        if (p.direction === 'vertical') {
            return renderVertical(p, { width, height, seed });
        }
        // horizontal planks: vertical ones in a transposed frame; the top-left lighting is
        // kept, as transposing swaps the left and top edges
        const transposed = renderVertical(
            { ...p, size: [p.size[1], p.size[0]] },
            { width: height, height: width, seed },
        );
        return transpose(transposed);
    },
});

/**
 * Swaps the axes of a texture and of its anchors.
 */
function transpose(source: Texture): Texture {
    const texture = new Texture(source.height, source.width);
    for (let y = 0; y < source.height; ++y) {
        for (let x = 0; x < source.width; ++x) {
            texture.setPixel(y, x, source.getPixel(x, y));
        }
    }
    texture.anchors = Object.fromEntries(
        Object.entries(source.anchors).map(([name, points]) => [
            name,
            points.map(({ x, y }) => ({ x: y, y: x })),
        ]),
    );
    return texture;
}

/**
 * Renders vertical planks with validated parameters.
 */
function renderVertical(p: PlanksParams, { width, height, seed }: RenderContext): Texture {
    const layout = computePlanksLayout(p, seed, width, height);
    const wear = planksWear(p);
    const texture = new Texture(width, height);
    const palette = createGradient(p.wood.palette);
    const gapColor = Rainbow.parse(p.gap.color);
    const count = layout.length;

    // grain: fine across the planks, stretched along them; it scales with the patch
    const grainNoise = new FractalNoise({
        seed: noiseSeed(seed, 0),
        period: [Math.max(1, Math.round(count * p.wood.grain)), 2],
        octaves: 3,
        persistence: 0.5,
    });
    // detail noises have a fixed grain in real pixels
    const cells = (px: number) => Math.max(1, Math.round(px));
    const warpX = new FractalNoise({
        seed: noiseSeed(seed, 1),
        period: [cells(width / 4), cells(height / 4)],
        octaves: 2,
    });
    const warpY = new FractalNoise({
        seed: noiseSeed(seed, 2),
        period: [cells(width / 4), cells(height / 4)],
        octaves: 2,
    });
    const gapNoise = new FractalNoise({
        seed: noiseSeed(seed, 3),
        period: [cells(width / 2), cells(height / 2)],
        octaves: 1,
    });
    const grimeNoise = new FractalNoise({ seed: noiseSeed(seed, 4), period: 3, octaves: 3 });

    // every plank, with its id; knots in the plank's own coordinates
    const planks = layout.flatMap((column, c) =>
        column.planks.map((plank, j) => ({ c, j, column, plank })),
    );
    const plankIndex = layout.map((column, c) =>
        column.planks.map((_, j) => planks.findIndex((q) => q.c === c && q.j === j)),
    );
    const knots = planks.map(({ c, j, column, plank }) => {
        if (hash(seed, SALT_KNOT, c, j, 0) >= p.knots.ratio) {
            return undefined;
        }
        return {
            x: column.width * hashRange(0.3, 0.7, seed, SALT_KNOT, c, j, 1),
            y: plank.length * hashRange(0.2, 0.8, seed, SALT_KNOT, c, j, 2),
            radius: hashRange(p.knots.size[0], p.knots.size[1], seed, SALT_KNOT, c, j, 3),
        };
    });

    // a gap of n pixels: the plank after it (below, right) takes the larger half
    const gapAfter = Math.ceil(p.gap.size / 2);
    const gapBefore = Math.floor(p.gap.size / 2);
    const ids = new Int32Array(width * height).fill(-1);
    const roughness = wear.roughness;
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const u = x / width;
            const v = y / height;
            const wx = mod(x + 0.5 + (warpX.sample(u, v) - 0.5) * 2 * roughness, width);
            const wy = mod(y + 0.5 + (warpY.sample(u, v) - 0.5) * 2 * roughness, height);

            const c = layout.findIndex((col) => wx >= col.x && wx < col.x + col.width);
            const column = layout[c];
            const single = column.planks.length === 1;
            const j = single
                ? 0
                : column.planks.findIndex((plank) => mod(wy - plank.y, height) < plank.length);
            const plank = column.planks[j];
            const id = plankIndex[c][j];
            const lx = wx - column.x;
            const ly = mod(wy - plank.y, height);

            // distance to each edge of the plank, gap excluded; a plank running the
            // whole height has no ends
            const dl = lx - gapAfter;
            const dr = column.width - lx - gapBefore;
            const dt = single ? Infinity : ly - gapAfter;
            const db = single ? Infinity : plank.length - ly - gapBefore;
            const d = Math.min(dl, dr, dt, db);

            if (d < 0) {
                const n = gapNoise.sample(u, v);
                texture.setPixel(x, y, shade(gapColor, 0.8 + 0.4 * n));
                continue;
            }
            ids[y * width + x] = id;

            // grain: noise stretched along the plank, and streaks bending around knots
            const ox = hash(seed, SALT_PLANK, c, j, 0);
            const oy = hash(seed, SALT_PLANK, c, j, 1);
            const g = grainNoise.sample(u + ox, v + oy);
            let phase = (lx / column.width) * p.wood.grain + 3 * g;
            let knotDarkness = 0;
            const knot = knots[id];
            if (knot) {
                const kx = lx - knot.x;
                const ky = ly - knot.y;
                const distance = Math.hypot(kx, ky / 1.6);
                if (distance < knot.radius) {
                    knotDarkness = 0.5 * (1 - distance / knot.radius) + 0.2;
                    phase += distance;
                } else if (distance < knot.radius * 3) {
                    phase += (Math.sign(kx) * (knot.radius * 3 - distance)) / knot.radius;
                }
            }
            const streak = Math.sin(2 * Math.PI * phase);
            const shift = (hash(seed, SALT_PLANK, c, j, 2) - 0.5) * 2 * p.wood.paletteShift;
            const tone =
                0.5 + p.wood.contrast * ((g - 0.5) * 1.2 + 0.18 * streak) + shift - knotDarkness;
            let color = sample(palette, tone);
            if (d < p.bevel.size) {
                color = shade(color, d === dl || d === dt ? p.bevel.light : p.bevel.dark);
            }
            const brightness =
                (1 + (hash(seed, SALT_PLANK, c, j, 3) - 0.5) * 2 * p.wood.shadeVariation) *
                (1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.wood.noise);
            texture.setPixel(x, y, shade(color, brightness));
        }
    }

    // splits: cracks along the grain, with a highlight on their right
    const marks = new Uint8Array(width * height);
    planks.forEach(({ c, j, column, plank }, id) => {
        if (hash(seed, SALT_SPLIT, c, j, 0) >= wear.splits.ratio) {
            return;
        }
        let cx = column.x + column.width * hashRange(0.25, 0.75, seed, SALT_SPLIT, c, j, 1);
        let cy = plank.y + plank.length * hashRange(0.1, 0.5, seed, SALT_SPLIT, c, j, 2);
        let remaining = hashRange(
            wear.splits.length[0],
            wear.splits.length[1],
            seed,
            SALT_SPLIT,
            c,
            j,
            3,
        );
        for (let step = 0; remaining > 0; ++step) {
            const segment = Math.min(remaining, hashRange(2, 4, seed, SALT_SPLIT, c, j, 4, step));
            const drift = (hash(seed, SALT_SPLIT, c, j, 5, step) - 0.5) * 1.2;
            const nx = cx + drift;
            const ny = cy + segment;
            const complete = Bresenham.line(
                Math.round(cx),
                Math.round(cy),
                Math.round(nx),
                Math.round(ny),
                (px, py) => {
                    const k = mod(py, height) * width + mod(px, width);
                    if (ids[k] !== id) {
                        return false;
                    }
                    if (!marks[k]) {
                        marks[k] = SPLIT;
                        texture.setPixel(px, py, shade(texture.getPixel(px, py), 0.5));
                    }
                    return true;
                },
            );
            if (!complete) {
                break;
            }
            cx = nx;
            cy = ny;
            remaining -= segment;
        }
    });
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            if (marks[y * width + x] !== SPLIT) {
                continue;
            }
            const k = y * width + mod(x + 1, width);
            if (marks[k] === 0 && ids[k] === ids[y * width + x]) {
                marks[k] = HIGHLIGHT;
                texture.setPixel(x + 1, y, shade(texture.getPixel(x + 1, y), 1.2));
            }
        }
    }

    // nails near the ends of the planks: a dark head with a light pixel above-left
    const nailColor = Rainbow.parse(p.nails.color);
    planks.forEach(({ c, j, column, plank }) => {
        if (column.planks.length === 1) {
            return;
        }
        const x = Math.floor(column.x + column.width / 2);
        const ends = [
            plank.y + gapAfter + p.nails.inset,
            plank.y + plank.length - gapBefore - p.nails.inset - 1,
        ];
        ends.forEach((end, k) => {
            if (hash(seed, SALT_NAIL, c, j, k) >= p.nails.ratio) {
                return;
            }
            const y = Math.round(end);
            texture.setPixel(x, y, nailColor);
            texture.setPixel(x - 1, y - 1, shade(texture.getPixel(x - 1, y - 1), 1.3));
        });
    });

    // weathering and grime, over everything
    const weathering = wear.weathering;
    const grime = wear.grime;
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            let rgba = Rainbow.convertToRGBA(texture.getPixel(x, y));
            if (weathering > 0) {
                // silver-grey, slightly blue, a bit lighter than the wood
                const l = 0.3 * rgba.r + 0.59 * rgba.g + 0.11 * rgba.b;
                const grey = { r: l * 1.05, g: l * 1.08, b: l * 1.12 };
                rgba = {
                    r: rgba.r + (grey.r - rgba.r) * weathering,
                    g: rgba.g + (grey.g - rgba.g) * weathering,
                    b: rgba.b + (grey.b - rgba.b) * weathering,
                    a: rgba.a,
                };
            }
            if (grime > 0) {
                const n = grimeNoise.sample(x / width, y / height);
                const f = 1 - grime * Math.max(0, (n - 0.35) / 0.65);
                rgba = { r: rgba.r * f, g: rgba.g * f, b: rgba.b * f, a: rgba.a };
            }
            texture.setPixel(x, y, Rainbow.fromRGBA(rgba));
        }
    }

    // first pixel column (or row) of a plank face
    const face = (edge: number) => Math.ceil(edge + gapAfter - 0.5);
    texture.anchors = {
        lines: layout.map((column) => ({ x: face(column.x), y: 0 })),
        // a plank running the whole height has no top: use the lines anchor
        planks: layout.flatMap((column) =>
            column.planks.length === 1
                ? []
                : column.planks.map((plank) => ({
                      x: face(column.x),
                      y: mod(face(plank.y), height),
                  })),
        ),
    };
    return texture;
}
