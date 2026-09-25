import { hash, hashRange } from '../../core/hash';
import { circularDistance, mod } from '../../core/math';
import type { AshlarParams } from './ashlar';
import { SALT_ROW_HEIGHT, SALT_ROW_OFFSET, SALT_BLOCK_WIDTH } from './salts';

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

const JOINT_ATTEMPTS = 16;

/**
 * Stone widths of a row, in own-size pixels, summing exactly to the patch width.
 */
function rowWidths(
    p: Pick<AshlarParams, 'size' | 'blocks'>,
    seed: number,
    row: number,
    attempt: number,
): number[] {
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
    p: Pick<AshlarParams, 'size' | 'rows' | 'blocks'>,
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

    // regular bonds: equal bricks filling each row exactly, as many as the mean width fits
    if (p.blocks.bond !== 'random') {
        const [min, max] = p.blocks.width;
        const count = Math.max(1, Math.round(ownWidth / ((min + max) / 2)));
        const brick = ownWidth / count;
        return bounds.slice(0, -1).map((y, r) => {
            const offset = p.blocks.bond === 'running' && r % 2 === 1 ? brick / 2 : 0;
            return {
                y,
                height: bounds[r + 1] - y,
                blocks: Array.from({ length: count }, (_, i) => ({
                    x: mod(offset + i * brick, ownWidth) * sx,
                    width: brick * sx,
                })),
            };
        });
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
