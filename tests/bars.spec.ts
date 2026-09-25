import { describe, expect, it } from 'vitest';
import {
    bars,
    barsWear,
    createMemoryLoader,
    renderTexture,
    type BarsParams,
    type Texture,
} from '../src';

const defaults = bars.defaults as BarsParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
const opaque = (t: Texture, x: number, y: number) => alpha(t, x, y) === 255;

/** no wear, no shadow: bars and rails only */
const clean = { age: 0, shadow: { offset: 0 } };

/** rows of a bar column where the bar is missing */
function missingRows(t: Texture, x: number, rails: number[]): number[] {
    return Array.from({ length: t.height }, (_, y) => y).filter(
        (y) => !rails.includes(y) && !opaque(t, x, y),
    );
}

/** indices of the bars having a missing part */
function brokenBars(t: Texture): number[] {
    const rails = t.anchors.rails.flatMap(({ y }) => [y, y + 1]);
    return t.anchors.bars
        .map(({ x }, i) => (missingRows(t, x, rails).length > 0 ? i : -1))
        .filter((i) => i >= 0);
}

describe('bars', () => {
    it('draws evenly spaced bars, transparent between them', () => {
        const t = bars.generate({ seed: 1, ...clean });
        // 5 bars across 32 pixels: every 6.4 pixels, 2 pixels wide
        expect(t.anchors.bars.map(({ x }) => x)).toEqual([2, 9, 15, 21, 28]);
        for (const { x } of t.anchors.bars) {
            for (let y = 0; y < t.height; ++y) {
                expect(opaque(t, x, y) && opaque(t, x + 1, y)).toBe(true);
            }
        }
        expect(alpha(t, 0, 5)).toBe(0);
        expect(alpha(t, 5, 40)).toBe(0);
    });

    it('lights a round bar a third across, a square bar on its left edge', () => {
        const lum = (t: Texture, x: number, y: number) => t.getPixel(x, y) >>> 24;
        const round = bars.generate({ seed: 1, ...clean, bars: { thickness: 3 } });
        const [{ x }] = round.anchors.bars;
        expect(lum(round, x, 5)).toBeGreaterThan(lum(round, x + 2, 5));
        expect(lum(round, x + 1, 5)).toBeGreaterThan(lum(round, x + 2, 5));
        const square = bars.generate({
            seed: 1,
            ...clean,
            bars: { thickness: 3, profile: 'square' },
        });
        expect(lum(square, x, 5)).toBeGreaterThan(lum(square, x + 1, 5));
        expect(lum(square, x + 1, 5)).toBeGreaterThan(lum(square, x + 2, 5));
    });

    it('holds the bars with rails running across the whole patch', () => {
        const t = bars.generate({ seed: 1, ...clean, rails: { count: 2 } });
        // 2 rails, 2 pixels high, at a third and two thirds of the height
        expect(t.anchors.rails).toEqual([
            { x: 0, y: 15 },
            { x: 0, y: 31 },
        ]);
        for (let x = 0; x < t.width; ++x) {
            expect(opaque(t, x, 15) && opaque(t, x, 16)).toBe(true);
        }
        expect(bars.generate({ seed: 1, ...clean, rails: { count: 0 } }).anchors.rails).toEqual([]);
    });

    it('breaks bars between the rails, never the rails themselves', () => {
        const t = bars.generate({ seed: 4, ...clean, broken: { ratio: 1 } });
        expect(brokenBars(t)).toEqual([0, 1, 2, 3, 4]);
        const [{ y }] = t.anchors.rails;
        for (let x = 0; x < t.width; ++x) {
            expect(opaque(t, x, y) && opaque(t, x, y + 1)).toBe(true);
        }
        expect(brokenBars(bars.generate({ seed: 4, ...clean }))).toEqual([]);
    });

    it('breaks the same bars at any size', () => {
        const params = { ...clean, broken: { ratio: 0.5 } };
        const small = bars.generate({ seed: 9, ...params });
        const large = bars.generate({ seed: 9, ...params, width: 64, height: 96 });
        expect(brokenBars(small).length).toBeGreaterThan(0);
        expect(brokenBars(large)).toEqual(brokenBars(small));
    });

    it('bends bars sideways without breaking them', () => {
        const straight = bars.generate({ seed: 2, ...clean });
        const bent = bars.generate({ seed: 2, ...clean, bends: { ratio: 1, amount: 4 } });
        expect(bent.data).not.toEqual(straight.data);
        // every row of the patch still crosses 5 bars of 2 pixels at least
        for (let y = 0; y < bent.height; ++y) {
            let covered = 0;
            for (let x = 0; x < bent.width; ++x) {
                covered += opaque(bent, x, y) ? 1 : 0;
            }
            expect(covered).toBeGreaterThanOrEqual(10);
        }
    });

    it('rusts with age', () => {
        const redness = (t: Texture) => {
            let sum = 0;
            for (let i = 0; i < t.data.length; i += 4) {
                sum += t.data[i + 3] === 255 ? t.data[i] - t.data[i + 2] : 0;
            }
            return sum;
        };
        const young = bars.generate({ seed: 3, age: 0 });
        const old = bars.generate({ seed: 3, age: 1 });
        expect(redness(old)).toBeGreaterThan(redness(young) + 1000);
    });

    it('casts no shadow by default, one to the bottom-right when asked', () => {
        const none = bars.generate({ seed: 1, age: 0 });
        const [{ x }] = none.anchors.bars;
        expect(alpha(none, x + 2, 10)).toBe(0);
        const t = bars.generate({ seed: 1, age: 0, shadow: { offset: 1 } });
        expect(alpha(t, x + 2, 10)).toBe(Math.round(defaults.shadow.opacity * 255));
        expect(alpha(t, x - 1, 10)).toBe(0);
    });

    it('leaves the space between the bars transparent over a cut opening', () => {
        const t = renderTexture(
            {
                size: [64, 64],
                patches: [
                    { patch: { template: 'ashlar' }, width: 100, height: 100 },
                    {
                        id: 'hole',
                        patch: { template: 'opening', depth: 3 },
                        x: 25,
                        y: 25,
                        width: 50,
                        height: 50,
                    },
                    {
                        patch: { template: 'bars', size: [26, 26], age: 1 },
                        anchor: { to: 'hole', at: 'opening' },
                        width: 40.6,
                        height: 40.6,
                    },
                ],
            },
            createMemoryLoader({}),
        );
        const alphas = new Set<number>();
        for (let y = 19; y < 45; ++y) {
            for (let x = 19; x < 45; ++x) {
                alphas.add(alpha(t, x, y));
            }
        }
        expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]);
    });

    it('derives its wear from age, explicit values winning', () => {
        expect(barsWear({ ...defaults, age: 0 }).broken.ratio).toBe(0);
        expect(barsWear({ ...defaults, age: 1 }).broken.ratio).toBeGreaterThan(0.3);
        const p = { ...defaults, age: 1, broken: { ratio: 0 } };
        expect(barsWear(p).broken.ratio).toBe(0);
    });
});
