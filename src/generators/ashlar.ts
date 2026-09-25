import { Bresenham, FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { Texture } from '../core/Texture';
import { hash, hashRange } from '../core/hash';
import { createGradient, sample, shade } from '../core/palette';
import { z } from 'zod';
import { color, DETAIL, LAYOUT, palette, range, ratio, size } from '../core/schema';
import { defineGenerator } from './define';

/** suffix of the descriptions of wear parameters */
const AGE = ' when unset, derived from age';

/**
 * Parameters of the ashlar template. "Layout" values are expressed in pixels at the
 * patch's own `size` and scale with it; "detail" values are real pixels and never scale.
 */
export const ashlarSchema = z.strictObject({
    size: size()
        .default([64, 64])
        .describe('own size of the patch in pixels; layout values are expressed at this size'),
    rows: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(1)
                .default(4)
                .describe('number of horizontal courses of stones')
                .meta(LAYOUT),
            heightVariation: z
                .number()
                .min(0)
                .lt(1)
                .default(0.2)
                .describe('random height variation between rows, in [0, 1)')
                .meta(LAYOUT),
        })
        .prefault({})
        .describe('horizontal courses of stones'),
    blocks: z
        .strictObject({
            width: range(z.number().positive())
                .default([14, 30])
                .describe('[min, max] stone width')
                .meta(LAYOUT),
            minJointOffset: z
                .number()
                .min(0)
                .default(5)
                .describe(
                    'minimum horizontal distance between a joint and the joints of adjacent rows',
                )
                .meta(LAYOUT),
        })
        .prefault({})
        .describe('stones within a row'),
    mortar: z
        .strictObject({
            size: z
                .number()
                .int()
                .min(0)
                .default(2)
                .describe('joint thickness, in pixels')
                .meta(DETAIL),
            color: color().default('#24211d').describe('mortar color'),
            noise: ratio()
                .optional()
                .describe(`brightness variation of the mortar, in [0, 1];${AGE}`),
            erosion: ratio()
                .optional()
                .describe(
                    `hollowed joints: darker, pitted mortar shadowed by the stones, in [0, 1];${AGE}`,
                ),
        })
        .prefault({})
        .describe('joints between stones'),
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
                .default(0.6)
                .describe('brightness factor of the bottom and right edges'),
        })
        .prefault({})
        .describe('stone edges lit from the top-left'),
    edges: z
        .strictObject({
            roughness: z
                .number()
                .min(0)
                .optional()
                .describe(`maximum displacement of the stone outlines, in pixels;${AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('irregularity of stone outlines'),
    chips: z
        .strictObject({
            ratio: ratio().optional().describe(`ratio of chipped stones, in [0, 1];${AGE}`),
            size: range(z.number().min(0))
                .optional()
                .describe(`[min, max] chip size, in pixels;${AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('broken stone corners'),
    cracks: z
        .strictObject({
            ratio: ratio().optional().describe(`ratio of cracked stones, in [0, 1];${AGE}`),
            length: range(z.number().min(0))
                .optional()
                .describe(`[min, max] crack length, in pixels;${AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('cracks running across stones'),
    erosion: z
        .strictObject({
            corners: z
                .number()
                .min(0)
                .optional()
                .describe(`radius of the rounded stone corners, in pixels;${AGE}`)
                .meta(DETAIL),
            edges: z
                .number()
                .min(0)
                .optional()
                .describe(`maximum depth worn into the stone edges, in pixels;${AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('stones worn down by time: rounded corners, uneven edges'),
    stains: z
        .strictObject({
            ratio: ratio()
                .optional()
                .describe(`chance of a streak running down from the top of each stone;${AGE}`),
            length: range(z.number().min(0))
                .optional()
                .describe(`[min, max] streak length;${AGE}`)
                .meta(LAYOUT),
            width: z
                .number()
                .min(1)
                .optional()
                .describe(`streak width, in pixels;${AGE}`)
                .meta(DETAIL),
            darkness: ratio()
                .optional()
                .describe(`darkening at the top of a streak, in [0, 1];${AGE}`),
            grime: ratio()
                .optional()
                .describe(`blotchy darkening of the whole wall, in [0, 1];${AGE}`),
        })
        .prefault({})
        .describe('dirt: streaks of rainwater and soot, grime'),
    spalling: z
        .strictObject({
            ratio: ratio()
                .optional()
                .describe(`ratio of stones with a flaked, recessed patch, in [0, 1];${AGE}`),
            size: range(z.number().min(0))
                .optional()
                .describe(`[min, max] patch radius, in pixels;${AGE}`)
                .meta(DETAIL),
            depth: ratio().optional().describe(`darkening of the flaked patches, in [0, 1];${AGE}`),
        })
        .prefault({})
        .describe('flaked stone faces'),
    age: ratio()
        .default(0.3)
        .describe(
            'overall weathering, from 0 (new) to 1 (ruined): sets every wear parameter left unset',
        ),
    stone: z
        .strictObject({
            palette: palette()
                .default(['#34322e', '#5a5751', '#7e7a72', '#a39e94'])
                .describe('stone colors, from darkest to lightest'),
            contrast: z
                .number()
                .min(0)
                .default(0.9)
                .describe('spread of the surface noise over the palette'),
            shadeVariation: ratio()
                .optional()
                .describe(`random brightness variation between stones, in [0, 1];${AGE}`),
            paletteShift: ratio()
                .default(0.1)
                .describe('random shift of each stone along the palette, in [0, 1]'),
            grain: ratio()
                .optional()
                .describe(`random brightness variation between pixels, in [0, 1];${AGE}`)
                .meta(DETAIL),
            noise: z
                .strictObject({
                    period: z
                        .number()
                        .int()
                        .min(1)
                        .default(8)
                        .describe('noise cells across the patch at the first octave')
                        .meta(LAYOUT),
                    octaves: z
                        .number()
                        .int()
                        .min(1)
                        .max(16)
                        .default(4)
                        .describe('number of noise octaves, each one twice as fine'),
                    persistence: z
                        .number()
                        .gt(0)
                        .max(1)
                        .default(0.6)
                        .describe('weight ratio between an octave and the previous one'),
                })
                .prefault({})
                .describe('surface noise'),
        })
        .prefault({})
        .describe('stone surface'),
});

export type AshlarParams = z.output<typeof ashlarSchema>;

/**
 * Wear values of an ashlar wall, every one resolved.
 */
export type AshlarWear = {
    chips: { ratio: number; size: [number, number] };
    cracks: { ratio: number; length: [number, number] };
    roughness: number;
    grain: number;
    shadeVariation: number;
    mortar: { noise: number; erosion: number };
    erosion: { corners: number; edges: number };
    stains: {
        ratio: number;
        length: [number, number];
        width: number;
        darkness: number;
        grime: number;
    };
    spalling: { ratio: number; size: [number, number]; depth: number };
};

/** a wear value at age 0 (new), 0.3 (the default) and 1 (ruined) */
type Curve = [number, number, number];
type RangeCurve = [[number, number], [number, number], [number, number]];

const AGE_REFERENCE = 0.3;

function atAge(age: number, [young, reference, old]: Curve): number {
    return age <= AGE_REFERENCE
        ? young + (reference - young) * (age / AGE_REFERENCE)
        : reference + (old - reference) * ((age - AGE_REFERENCE) / (1 - AGE_REFERENCE));
}

function rangeAtAge(age: number, curve: RangeCurve): [number, number] {
    return [
        atAge(age, [curve[0][0], curve[1][0], curve[2][0]]),
        atAge(age, [curve[0][1], curve[1][1], curve[2][1]]),
    ];
}

/**
 * Resolves the wear values of an ashlar wall: values set in the parameters win, the
 * others are derived from `age`.
 */
export function ashlarWear(p: AshlarParams): AshlarWear {
    const a = p.age;
    return {
        chips: {
            ratio: p.chips.ratio ?? atAge(a, [0, 0.25, 0.8]),
            size:
                p.chips.size ??
                rangeAtAge(a, [
                    [1, 2],
                    [2, 4],
                    [3, 8],
                ]),
        },
        cracks: {
            ratio: p.cracks.ratio ?? atAge(a, [0, 0.2, 0.75]),
            length:
                p.cracks.length ??
                rangeAtAge(a, [
                    [3, 6],
                    [5, 12],
                    [10, 26],
                ]),
        },
        roughness: p.edges.roughness ?? atAge(a, [0.3, 0.8, 1.4]),
        grain: p.stone.grain ?? atAge(a, [0.03, 0.06, 0.14]),
        shadeVariation: p.stone.shadeVariation ?? atAge(a, [0.05, 0.1, 0.22]),
        mortar: {
            noise: p.mortar.noise ?? atAge(a, [0.1, 0.25, 0.55]),
            erosion: p.mortar.erosion ?? atAge(a, [0, 0.2, 0.8]),
        },
        erosion: {
            corners: p.erosion.corners ?? atAge(a, [0, 1, 4]),
            edges: p.erosion.edges ?? atAge(a, [0, 0.5, 2.5]),
        },
        stains: {
            ratio: p.stains.ratio ?? atAge(a, [0, 0.15, 0.7]),
            length:
                p.stains.length ??
                rangeAtAge(a, [
                    [4, 10],
                    [6, 16],
                    [12, 40],
                ]),
            width: p.stains.width ?? atAge(a, [1, 2, 3]),
            darkness: p.stains.darkness ?? atAge(a, [0.15, 0.25, 0.5]),
            grime: p.stains.grime ?? atAge(a, [0, 0.1, 0.4]),
        },
        spalling: {
            ratio: p.spalling.ratio ?? atAge(a, [0, 0.08, 0.5]),
            size:
                p.spalling.size ??
                rangeAtAge(a, [
                    [2, 3],
                    [2, 5],
                    [4, 10],
                ]),
            depth: p.spalling.depth ?? atAge(a, [0.2, 0.25, 0.45]),
        },
    };
}

export type AshlarBlock = {
    /** left edge in pixels, in [0, width); a block may wrap around the right edge */
    x: number;
    width: number;
};

export type AshlarRow = {
    y: number;
    height: number;
    blocks: AshlarBlock[];
};

// each random decision draws from its own sequence
const SALT_ROW_HEIGHT = 1;
const SALT_ROW_OFFSET = 2;
const SALT_BLOCK_WIDTH = 3;
const SALT_STONE = 4;
const SALT_CHIP = 5;
const SALT_CRACK = 6;
const SALT_NOISE = 7;
const SALT_GRAIN = 8;
const SALT_SPALL = 9;
const SALT_STAIN = 10;

const JOINT_ATTEMPTS = 16;

// pixel marks of the crack pass
const CRACK = 1;
const HIGHLIGHT = 2;

function mod(a: number, n: number): number {
    return ((a % n) + n) % n;
}

/**
 * Distance between two positions on a circle of the given circumference.
 */
function circularDistance(a: number, b: number, circumference: number): number {
    const d = mod(a - b, circumference);
    return Math.min(d, circumference - d);
}

function noiseSeed(seed: number, index: number): number {
    return Math.floor(hash(seed, SALT_NOISE, index) * 4294967296);
}

/**
 * Stone widths of a row, in own-size pixels, summing exactly to the patch width.
 */
function rowWidths(p: AshlarParams, seed: number, row: number, attempt: number): number[] {
    const total = p.size[0];
    const [min, max] = p.blocks.width;
    const widths: number[] = [];
    let sum = 0;
    while (total - sum > max) {
        const w = hashRange(min, max, seed, SALT_BLOCK_WIDTH, row, attempt, widths.length);
        widths.push(w);
        sum += w;
    }
    const rest = total - sum;
    if (rest >= min || widths.length === 0) {
        widths.push(rest);
    } else {
        // the remainder is too narrow for a stone: share it with the previous one
        const both = widths.pop()! + rest;
        widths.push(...(both <= max ? [both] : [both / 2, both / 2]));
    }
    return widths;
}

/**
 * Joint positions of a row, in own-size pixels, in [0, width).
 */
function rowJoints(widths: number[], offset: number, total: number): number[] {
    const joints: number[] = [];
    let x = offset;
    for (const w of widths) {
        joints.push(mod(x, total));
        x += w;
    }
    return joints;
}

/**
 * Computes the stone layout of an ashlar patch rendered at the given size. The layout is
 * computed at the patch's own size and then scaled, so the same seed gives the same
 * stones at any size.
 */
export function computeAshlarLayout(
    p: AshlarParams,
    seed: number,
    width: number,
    height: number,
): AshlarRow[] {
    const ownWidth = p.size[0];
    const [minWidth, maxWidth] = p.blocks.width;
    if (!(minWidth > 0 && maxWidth >= minWidth)) {
        throw new RangeError(`ashlar: invalid blocks.width [${minWidth}, ${maxWidth}]`);
    }
    const count = Math.max(1, Math.round(p.rows.count));
    const sx = width / ownWidth;

    // row heights, normalized to fill the height exactly
    const weights = Array.from(
        { length: count },
        (_, r) => 1 + p.rows.heightVariation * (2 * hash(seed, SALT_ROW_HEIGHT, r) - 1),
    );
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const bounds = [0];
    let acc = 0;
    for (const w of weights) {
        acc += w;
        bounds.push(Math.round((acc / totalWeight) * height));
    }

    // stones: pick, for each row, the offset keeping joints away from the row above
    // (and, for the last row, from the first row, since the patch tiles vertically)
    const rowsJoints: number[][] = [];
    const rowsWidths: number[][] = [];
    for (let r = 0; r < count; ++r) {
        const neighbours = [rowsJoints[r - 1], r === count - 1 && r > 1 ? rowsJoints[0] : undefined]
            .filter((j): j is number[] => j !== undefined)
            .flat();
        let best: { joints: number[]; widths: number[]; score: number } | undefined;
        for (let attempt = 0; attempt < JOINT_ATTEMPTS; ++attempt) {
            const widths = rowWidths(p, seed, r, attempt);
            const offset = hash(seed, SALT_ROW_OFFSET, r, attempt) * ownWidth;
            const joints = rowJoints(widths, offset, ownWidth);
            let score = Infinity;
            for (const a of joints) {
                for (const b of neighbours) {
                    score = Math.min(score, circularDistance(a, b, ownWidth));
                }
            }
            if (!best || score > best.score) {
                best = { joints, widths, score };
            }
            if (score >= p.blocks.minJointOffset) {
                break;
            }
        }
        rowsJoints.push(best!.joints);
        rowsWidths.push(best!.widths);
    }

    return rowsJoints.map((joints, r) => ({
        y: bounds[r],
        height: bounds[r + 1] - bounds[r],
        blocks: joints.map((x, i) => ({ x: x * sx, width: rowsWidths[r][i] * sx })),
    }));
}

/**
 * Dressed stone wall: rows of rectangular stones of random width, like the castle walls
 * of Hexen.
 */
export const ashlar = defineGenerator({
    name: 'ashlar',
    description: 'Dressed stone wall: rows of stones of random width',
    schema: ashlarSchema,
    anchors: {
        rows: 'left edge and top of the stone faces of each row, just below the mortar',
        stones: 'top-left corner of the face of each stone, row by row',
    },
    render(p, { width, height, seed }) {
        const scale = Math.min(width / p.size[0], height / p.size[1]);
        const layout = computeAshlarLayout(p, seed, width, height);

        const texture = new Texture(width, height);
        const palette = createGradient(p.stone.palette);
        const mortarColor = Rainbow.parse(p.mortar.color);
        // surface noise scales with the patch; larger renders get extra octaves of detail
        const stoneNoise = new FractalNoise({
            seed: noiseSeed(seed, 0),
            period: p.stone.noise.period,
            octaves: p.stone.noise.octaves + Math.max(0, Math.round(Math.log2(scale))),
            persistence: p.stone.noise.persistence,
        });
        // detail noises have a fixed grain in real pixels
        const grain = (px: number) => Math.max(1, Math.round(px));
        const detailPeriod: [number, number] = [grain(width / 4), grain(height / 4)];
        const warpX = new FractalNoise({
            seed: noiseSeed(seed, 1),
            period: detailPeriod,
            octaves: 2,
        });
        const warpY = new FractalNoise({
            seed: noiseSeed(seed, 2),
            period: detailPeriod,
            octaves: 2,
        });
        const mortarNoise = new FractalNoise({
            seed: noiseSeed(seed, 3),
            period: [grain(width / 2), grain(height / 2)],
            octaves: 1,
        });

        const wear = ashlarWear(p);
        const sy = height / p.size[1];
        // wear noises: fixed grain in real pixels, except grime which scales like the stones
        const edgeWear = new FractalNoise({
            seed: noiseSeed(seed, 4),
            period: [grain(width / 6), grain(height / 6)],
            octaves: 2,
        });
        const mortarHoles = new FractalNoise({
            seed: noiseSeed(seed, 5),
            period: [grain(width / 3), grain(height / 3)],
            octaves: 2,
        });
        const spallNoise = new FractalNoise({
            seed: noiseSeed(seed, 6),
            period: [grain(width / 3), grain(height / 3)],
            octaves: 2,
        });
        const grimeNoise = new FractalNoise({ seed: noiseSeed(seed, 7), period: 3, octaves: 3 });

        // stone index of each pixel, -1 for mortar
        const ids = new Int32Array(width * height).fill(-1);
        const stones: { row: number; block: number }[] = [];
        const stoneIndex = layout.map((row, r) =>
            row.blocks.map((_, i) => stones.push({ row: r, block: i }) - 1),
        );

        // flaked patches, in the stone's own coordinates
        const spalls = stones.map(({ row: r, block: i }) => {
            if (hash(seed, SALT_SPALL, r, i, 0) >= wear.spalling.ratio) {
                return undefined;
            }
            const [min, max] = wear.spalling.size;
            return {
                x: layout[r].blocks[i].width * hashRange(0.25, 0.75, seed, SALT_SPALL, r, i, 1),
                y: layout[r].height * hashRange(0.25, 0.75, seed, SALT_SPALL, r, i, 2),
                radius: hashRange(min, max, seed, SALT_SPALL, r, i, 3),
            };
        });

        // a joint of n pixels: the stone after it (below, right) takes the larger half, so
        // that odd sizes keep all their pixels when tested at pixel centers
        const mortarAfter = Math.ceil(p.mortar.size / 2);
        const mortarBefore = Math.floor(p.mortar.size / 2);
        const roughness = wear.roughness;
        const radius = wear.erosion.corners;
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const u = x / width;
                const v = y / height;
                const wx = mod(x + 0.5 + (warpX.sample(u, v) - 0.5) * 2 * roughness, width);
                const wy = mod(y + 0.5 + (warpY.sample(u, v) - 0.5) * 2 * roughness, height);

                const r = layout.findIndex((row) => wy >= row.y && wy < row.y + row.height);
                const row = layout[r];
                const i = row.blocks.findIndex((b) => mod(wx - b.x, width) < b.width);
                const block = row.blocks[i];
                const id = stoneIndex[r][i];
                const lx = mod(wx - block.x, width);
                const ly = wy - row.y;

                // distance to each edge of the stone, mortar excluded
                const dl = lx - mortarAfter;
                const dr = block.width - lx - mortarBefore;
                const dt = ly - mortarAfter;
                const db = row.height - ly - mortarBefore;
                const d = Math.min(dl, dr, dt, db);
                // edges worn down in smooth waves
                const worn = d - wear.erosion.edges * edgeWear.sample(u, v);
                const corners = [
                    [dl, dt],
                    [dr, dt],
                    [dr, db],
                    [dl, db],
                ];

                let isMortar = worn < 0;
                // rounded corners
                if (!isMortar && radius > 0) {
                    isMortar = corners.some(
                        ([cx, cy]) =>
                            cx < radius &&
                            cy < radius &&
                            (radius - cx) ** 2 + (radius - cy) ** 2 > radius ** 2,
                    );
                }
                if (!isMortar && hash(seed, SALT_CHIP, r, i, 0) < wear.chips.ratio) {
                    const [min, max] = wear.chips.size;
                    const chip = hashRange(min, max, seed, SALT_CHIP, r, i, 1);
                    const [cx, cy] = corners[Math.floor(hash(seed, SALT_CHIP, r, i, 2) * 4)];
                    isMortar = cx + cy < chip;
                }

                if (isMortar) {
                    const n = mortarNoise.sample(u, v);
                    let brightness = 1 + (n - 0.5) * 2 * wear.mortar.noise;
                    const erosion = wear.mortar.erosion;
                    if (erosion > 0) {
                        // hollowed joints: pitted, and in the shadow of the stone above or
                        // on the left, the light coming from the top-left
                        brightness *= 1 - erosion * (0.2 + 0.4 * mortarHoles.sample(u, v));
                        if (d === db || d === dr) {
                            brightness *= 1 - erosion * 0.35;
                        }
                    }
                    texture.setPixel(x, y, shade(mortarColor, brightness));
                    continue;
                }

                ids[y * width + x] = id;
                const ox = hash(seed, SALT_STONE, r, i, 0);
                const oy = hash(seed, SALT_STONE, r, i, 1);
                const n = stoneNoise.sample(u + ox, v + oy);
                const shift = (hash(seed, SALT_STONE, r, i, 2) - 0.5) * 2 * p.stone.paletteShift;
                const brightness =
                    (1 + (hash(seed, SALT_STONE, r, i, 3) - 0.5) * 2 * wear.shadeVariation) *
                    (1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * wear.grain);
                let color = sample(palette, 0.5 + (n - 0.5) * p.stone.contrast * 2 + shift);
                if (worn < p.bevel.size) {
                    color = shade(color, d === dl || d === dt ? p.bevel.light : p.bevel.dark);
                }
                const spall = spalls[id];
                if (spall) {
                    const sx = lx - spall.x;
                    const sy = ly - spall.y;
                    const f =
                        Math.hypot(sx, sy) / (spall.radius * (0.7 + 0.6 * spallNoise.sample(u, v)));
                    if (f < 1) {
                        // recessed patch: its top-left rim in shadow, its bottom-right rim lit
                        color = shade(color, 1 - wear.spalling.depth);
                        if (f > 0.7) {
                            color = shade(color, sx + sy < 0 ? 0.75 : 1.25);
                        }
                    }
                }
                texture.setPixel(x, y, shade(color, brightness));
            }
        }

        // cracks: random walks drawn inside their stone, with a highlight below-right
        const cracked = new Uint8Array(width * height);
        stones.forEach(({ row: r, block: i }, id) => {
            if (hash(seed, SALT_CRACK, r, i, 0) >= wear.cracks.ratio) {
                return;
            }
            const row = layout[r];
            const block = row.blocks[i];
            let cx = block.x + block.width * hashRange(0.3, 0.7, seed, SALT_CRACK, r, i, 1);
            let cy = row.y + row.height * hashRange(0.3, 0.7, seed, SALT_CRACK, r, i, 2);
            let angle = hash(seed, SALT_CRACK, r, i, 3) * 2 * Math.PI;
            const [min, max] = wear.cracks.length;
            let remaining = hashRange(min, max, seed, SALT_CRACK, r, i, 4);
            for (let step = 0; remaining > 0; ++step) {
                const segment = Math.min(
                    remaining,
                    hashRange(2, 4, seed, SALT_CRACK, r, i, 5, step),
                );
                angle += (hash(seed, SALT_CRACK, r, i, 6, step) - 0.5) * 1.2;
                const nx = cx + Math.cos(angle) * segment;
                const ny = cy + Math.sin(angle) * segment;
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
                        if (!cracked[k]) {
                            cracked[k] = CRACK;
                            texture.setPixel(px, py, shade(texture.getPixel(px, py), 0.55));
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
                if (cracked[y * width + x] !== CRACK) {
                    continue;
                }
                const k = mod(y + 1, height) * width + mod(x + 1, width);
                if (cracked[k] === 0 && ids[k] === ids[y * width + x]) {
                    cracked[k] = HIGHLIGHT;
                    texture.setPixel(x + 1, y + 1, shade(texture.getPixel(x + 1, y + 1), 1.2));
                }
            }
        }

        // first pixel row (or column) of a stone face: pixel centers at d >= 0
        const face = (edge: number) => Math.ceil(edge + mortarAfter - 0.5);

        // stains: streaks running down from the top of stones, over joints and the stones
        // below, fading along their length; the darkest streak wins where they overlap
        const stain = new Float32Array(width * height);
        const halfWidth = wear.stains.width / 2;
        stones.forEach(({ row: r, block: i }) => {
            if (hash(seed, SALT_STAIN, r, i, 0) >= wear.stains.ratio) {
                return;
            }
            const row = layout[r];
            const block = row.blocks[i];
            const x0 = block.x + block.width * hashRange(0.1, 0.9, seed, SALT_STAIN, r, i, 1);
            const y0 = face(row.y);
            const [min, max] = wear.stains.length;
            const length = hashRange(min, max, seed, SALT_STAIN, r, i, 2) * sy;
            const phase = hash(seed, SALT_STAIN, r, i, 3) * 2 * Math.PI;
            for (let t = 0; t < length; ++t) {
                const xc = x0 + Math.sin(phase + t / 5) * 0.7;
                const darkness = wear.stains.darkness * (1 - t / length);
                for (let px = Math.floor(xc - halfWidth); px <= Math.ceil(xc + halfWidth); ++px) {
                    const cover = Math.min(
                        1,
                        Math.max(0, halfWidth + 0.5 - Math.abs(px + 0.5 - xc)),
                    );
                    const k = mod(y0 + t, height) * width + mod(px, width);
                    stain[k] = Math.max(stain[k], darkness * cover);
                }
            }
        });
        const grime = wear.stains.grime;
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const g =
                    grime > 0
                        ? Math.max(0, (grimeNoise.sample(x / width, y / height) - 0.35) / 0.65)
                        : 0;
                const darkening = 1 - (1 - stain[y * width + x]) * (1 - grime * g);
                if (darkening > 0) {
                    texture.setPixel(x, y, shade(texture.getPixel(x, y), 1 - darkening));
                }
            }
        }

        texture.anchors = {
            rows: layout.map((row) => ({ x: 0, y: face(row.y) })),
            stones: layout.flatMap((row) =>
                row.blocks.map((block) => ({ x: mod(face(block.x), width), y: face(row.y) })),
            ),
        };
        return texture;
    },
});
