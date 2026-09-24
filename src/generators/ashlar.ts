import { Bresenham, FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { Texture } from '../core/Texture';
import { hash, hashRange } from '../core/hash';
import { createGradient, sample, shade } from '../core/palette';
import { deepMerge } from '../core/object-fusion';
import type { TextureGenerator } from './types';

/**
 * Parameters of the ashlar template. "Layout" values are expressed in pixels at the
 * patch's own `size` and scale with it; "detail" values are real pixels and never scale.
 */
export type AshlarParams = {
    /** own size of the patch, in pixels */
    size: [number, number];
    /** layout: horizontal courses of stones */
    rows: {
        count: number;
        /** random height variation between rows, in [0, 1) */
        heightVariation: number;
    };
    /** layout: stones within a row */
    blocks: {
        /** [min, max] stone width */
        width: [number, number];
        /** minimum horizontal distance between a joint and the joints of adjacent rows */
        minJointOffset: number;
    };
    /** detail: joints between stones */
    mortar: {
        size: number;
        color: string;
        /** brightness variation of the mortar, in [0, 1] */
        noise: number;
    };
    /** detail: stone edges lit from the top-left */
    bevel: {
        size: number;
        /** brightness factor of the top and left edges */
        light: number;
        /** brightness factor of the bottom and right edges */
        dark: number;
    };
    /** detail: irregularity of stone outlines */
    edges: {
        /** maximum outline displacement, in pixels */
        roughness: number;
    };
    /** detail: broken stone corners */
    chips: {
        /** ratio of chipped stones, in [0, 1] */
        ratio: number;
        /** [min, max] chip size */
        size: [number, number];
    };
    /** detail: cracks running across stones */
    cracks: {
        /** ratio of cracked stones, in [0, 1] */
        ratio: number;
        /** [min, max] crack length */
        length: [number, number];
    };
    /** stone surface */
    stone: {
        /** CSS colors, from darkest to lightest */
        palette: string[];
        /** spread of the surface noise over the palette */
        contrast: number;
        /** random brightness variation between stones, in [0, 1] */
        shadeVariation: number;
        /** random shift of each stone along the palette, in [0, 1] */
        paletteShift: number;
        /** detail: random brightness variation between pixels, in [0, 1] */
        grain: number;
        noise: {
            /** noise cells across the patch at the first octave */
            period: number;
            octaves: number;
            persistence: number;
        };
    };
};

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
export const ashlar: TextureGenerator<AshlarParams> = {
    name: 'ashlar',
    description: 'Dressed stone wall: rows of stones of random width',
    defaults: {
        size: [64, 64],
        rows: { count: 4, heightVariation: 0.2 },
        blocks: { width: [14, 30], minJointOffset: 5 },
        mortar: { size: 2, color: '#24211d', noise: 0.25 },
        bevel: { size: 1, light: 1.3, dark: 0.6 },
        edges: { roughness: 0.8 },
        chips: { ratio: 0.25, size: [2, 4] },
        cracks: { ratio: 0.2, length: [5, 12] },
        stone: {
            palette: ['#34322e', '#5a5751', '#7e7a72', '#a39e94'],
            contrast: 0.9,
            shadeVariation: 0.1,
            paletteShift: 0.1,
            grain: 0.06,
            noise: { period: 8, octaves: 4, persistence: 0.6 },
        },
    },
    generate(options) {
        const p = deepMerge(this.defaults, options) as AshlarParams & typeof options;
        const seed = p.seed;
        const width = p.width ?? p.size[0];
        const height = p.height ?? p.size[1];
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

        // stone index of each pixel, -1 for mortar
        const ids = new Int32Array(width * height).fill(-1);
        const stones: { row: number; block: number }[] = [];
        const stoneIndex = layout.map((row, r) =>
            row.blocks.map((_, i) => stones.push({ row: r, block: i }) - 1),
        );

        const half = p.mortar.size / 2;
        const roughness = p.edges.roughness;
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
                const lx = mod(wx - block.x, width);
                const ly = wy - row.y;

                // distance to each edge of the stone, mortar excluded
                const dl = lx - half;
                const dr = block.width - lx - half;
                const dt = ly - half;
                const db = row.height - ly - half;
                const d = Math.min(dl, dr, dt, db);

                let isMortar = d < 0;
                if (!isMortar && hash(seed, SALT_CHIP, r, i, 0) < p.chips.ratio) {
                    const chip = hashRange(
                        p.chips.size[0],
                        p.chips.size[1],
                        seed,
                        SALT_CHIP,
                        r,
                        i,
                        1,
                    );
                    const corner = Math.floor(hash(seed, SALT_CHIP, r, i, 2) * 4);
                    const [cx, cy] = [
                        [dl, dt],
                        [dr, dt],
                        [dr, db],
                        [dl, db],
                    ][corner];
                    isMortar = cx + cy < chip;
                }

                if (isMortar) {
                    const n = mortarNoise.sample(u, v);
                    texture.setPixel(x, y, shade(mortarColor, 1 + (n - 0.5) * 2 * p.mortar.noise));
                    continue;
                }

                ids[y * width + x] = stoneIndex[r][i];
                const ox = hash(seed, SALT_STONE, r, i, 0);
                const oy = hash(seed, SALT_STONE, r, i, 1);
                const n = stoneNoise.sample(u + ox, v + oy);
                const shift = (hash(seed, SALT_STONE, r, i, 2) - 0.5) * 2 * p.stone.paletteShift;
                const brightness =
                    (1 + (hash(seed, SALT_STONE, r, i, 3) - 0.5) * 2 * p.stone.shadeVariation) *
                    (1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.stone.grain);
                let color = sample(palette, 0.5 + (n - 0.5) * p.stone.contrast * 2 + shift);
                if (d < p.bevel.size) {
                    color = shade(color, d === dl || d === dt ? p.bevel.light : p.bevel.dark);
                }
                texture.setPixel(x, y, shade(color, brightness));
            }
        }

        // cracks: random walks drawn inside their stone, with a highlight below-right
        const cracked = new Uint8Array(width * height);
        stones.forEach(({ row: r, block: i }, id) => {
            if (hash(seed, SALT_CRACK, r, i, 0) >= p.cracks.ratio) {
                return;
            }
            const row = layout[r];
            const block = row.blocks[i];
            let cx = block.x + block.width * hashRange(0.3, 0.7, seed, SALT_CRACK, r, i, 1);
            let cy = row.y + row.height * hashRange(0.3, 0.7, seed, SALT_CRACK, r, i, 2);
            let angle = hash(seed, SALT_CRACK, r, i, 3) * 2 * Math.PI;
            let remaining = hashRange(
                p.cracks.length[0],
                p.cracks.length[1],
                seed,
                SALT_CRACK,
                r,
                i,
                4,
            );
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
        return texture;
    },
};
