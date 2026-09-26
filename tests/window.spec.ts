import { describe, expect, it } from 'vitest';
import { glassWindow, windowWear, type Texture, type WindowParams } from '../src';

const defaults = glassWindow.defaults as WindowParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;

/** a new window: no dirt, no crack, no broken pane */
const clean = { age: 0 };

/** the pixels of the first pane: [3, 15) × [3, 19) at the default size */
function firstPane(t: Texture): number[] {
    const alphas: number[] = [];
    for (let y = 3; y < 19; ++y) {
        for (let x = 3; x < 15; ++x) {
            alphas.push(alpha(t, x, y));
        }
    }
    return alphas;
}

describe('window', () => {
    it('lays out panes inside the frame, separated by bars', () => {
        const t = glassWindow.generate({ seed: 1, ...clean });
        // 32 x 40: a 3-pixel frame, 2-pixel bars between 2 x 2 panes
        expect(t.anchors.panes).toEqual([
            { x: 3, y: 3 },
            { x: 17, y: 3 },
            { x: 3, y: 21 },
            { x: 17, y: 21 },
        ]);
        expect(t.anchors.corners).toHaveLength(16);
        expect(t.anchors.corners.slice(0, 4)).toEqual([
            { x: 3, y: 3, corner: 'top-left' },
            { x: 14, y: 3, corner: 'top-right' },
            { x: 3, y: 18, corner: 'bottom-left' },
            { x: 14, y: 18, corner: 'bottom-right' },
        ]);
        const nine = glassWindow.generate({ seed: 1, ...clean, panes: { columns: 3, rows: 3 } });
        expect(nine.anchors.panes).toHaveLength(9);
    });

    it('frames translucent glass crossed by brighter streaks', () => {
        const t = glassWindow.generate({ seed: 1, ...clean });
        for (const [x, y] of [
            [0, 0],
            [15, 10],
            [10, 19],
            [31, 39],
        ]) {
            expect(alpha(t, x, y)).toBe(255);
        }
        const alphas = firstPane(t);
        expect(Math.min(...alphas)).toBe(Math.round(0.15 * 255));
        expect(Math.max(...alphas)).toBe(Math.round(0.35 * 255));
    });

    it('leans its streaks to the right at a positive angle', () => {
        const t = glassWindow.generate({ seed: 2, ...clean, glass: { streaks: { angle: 45 } } });
        // along a 45° streak, pixels up and to the right have the same alpha
        for (let y = 4; y < 19; ++y) {
            for (let x = 3; x < 14; ++x) {
                expect(alpha(t, x + 1, y - 1)).toBe(alpha(t, x, y));
            }
        }
    });

    it('breaks panes, leaving shards along the frame', () => {
        const t = glassWindow.generate({ seed: 3, ...clean, broken: 1 });
        const alphas = firstPane(t);
        expect(alpha(t, 9, 11)).toBe(0);
        expect(alphas.filter((a) => a === 0).length).toBeGreaterThan(alphas.length / 2);
        expect(alphas.filter((a) => a > 0).length).toBeGreaterThan(0);
        expect(alpha(t, 16, 10)).toBe(255);
    });

    it('cracks panes with bright lines', () => {
        const crack = Math.round(0.55 * 255);
        const cracked = glassWindow.generate({ seed: 4, ...clean, cracked: 1 });
        expect(firstPane(cracked)).toContain(crack);
        expect(firstPane(glassWindow.generate({ seed: 4, ...clean }))).not.toContain(crack);
    });

    it('gets dirty with age, and its wood weathers', () => {
        const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
        const young = glassWindow.generate({ seed: 5, age: 0 });
        const old = glassWindow.generate({ seed: 5, age: 1, broken: 0, cracked: 0 });
        expect(mean(firstPane(old))).toBeGreaterThan(mean(firstPane(young)) + 30);
        const saturation = (t: Texture) => {
            const c = t.getPixel(1, 20);
            const [r, g, b] = [c >>> 24, (c >>> 16) & 0xff, (c >>> 8) & 0xff];
            return Math.max(r, g, b) - Math.min(r, g, b);
        };
        const weathered = glassWindow.generate({ seed: 5, age: 0, weathering: 1 });
        expect(saturation(weathered)).toBeLessThan(saturation(young));
    });

    it('rusts a metal frame with age', () => {
        const redness = (t: Texture) => {
            let sum = 0;
            for (let i = 0; i < t.data.length; i += 4) {
                sum += t.data[i + 3] === 255 ? t.data[i] - t.data[i + 2] : 0;
            }
            return sum;
        };
        const metal = { frame: { material: 'metal' as const } };
        const young = glassWindow.generate({ seed: 6, ...metal, age: 0 });
        const old = glassWindow.generate({ seed: 6, ...metal, age: 1 });
        expect(redness(old)).toBeGreaterThan(redness(young) + 1000);
    });

    it('casts no shadow by default, one on the glass when asked', () => {
        const none = glassWindow.generate({ seed: 1, ...clean });
        const shadowed = glassWindow.generate({ seed: 1, ...clean, shadow: { offset: 1 } });
        // the first column of a pane, below-right of the frame
        expect(alpha(shadowed, 3, 10)).toBeGreaterThan(alpha(none, 3, 10));
    });

    it('derives its wear from age, explicit values winning', () => {
        expect(windowWear({ ...defaults, age: 0 })).toMatchObject({
            dirt: 0,
            cracked: 0,
            broken: 0,
            weathering: 0,
        });
        expect(windowWear({ ...defaults, age: 1 }).broken).toBeGreaterThan(0.3);
        expect(windowWear({ ...defaults, age: 1, dirt: 0 }).dirt).toBe(0);
    });
});
