import { describe, expect, it } from 'vitest';
import { STAINED_GLASS_COLORS, stainedglass, type Texture } from '../src';

const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
const rgb = (t: Texture, x: number, y: number) => {
    const c = t.getPixel(x, y);
    return [c >>> 24, (c >>> 16) & 0xff, (c >>> 8) & 0xff];
};

describe('stainedglass', () => {
    it('is transparent outside its pointed arch, framed with lead along its outline', () => {
        const t = stainedglass.generate({ seed: 1 });
        // the top corners lie outside the arch
        expect(alpha(t, 0, 0)).toBe(0);
        expect(alpha(t, t.width - 1, 0)).toBe(0);
        expect(alpha(t, 2, 4)).toBe(0);
        // the frame: opaque lead along the bottom and the sides
        expect(alpha(t, t.width / 2, t.height - 1)).toBe(255);
        expect(alpha(t, 0, t.height - 10)).toBe(255);
        expect(rgb(t, 0, t.height - 10)).toEqual([0x1c, 0x1a, 0x18]);
    });

    it('fills the whole patch under a flat top', () => {
        const t = stainedglass.generate({ seed: 1, arch: { shape: 'flat' } });
        expect(alpha(t, 0, 0)).toBe(255);
        expect(alpha(t, t.width - 1, 0)).toBe(255);
    });

    it('lays pieces of translucent glass of every color, held by lead', () => {
        const t = stainedglass.generate({ seed: 2, cells: { count: 40 }, bars: 0 });
        const colors = STAINED_GLASS_COLORS.map((c) =>
            [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)),
        );
        const seen = new Set<number>();
        let [glass, lead] = [0, 0];
        for (let y = 0; y < t.height; ++y) {
            for (let x = 0; x < t.width; ++x) {
                const a = alpha(t, x, y);
                if (a === 255) {
                    ++lead;
                } else if (a > 0) {
                    ++glass;
                    expect(a).toBe(Math.round(0.85 * 255));
                    // the nearest color of the palette, by its dominant channels
                    const [r, g, b] = rgb(t, x, y);
                    const near = colors
                        .map(([cr, cg, cb], i) => [Math.hypot(r - cr, g - cg, b - cb), i])
                        .sort((u, v) => u[0] - v[0])[0][1];
                    seen.add(near);
                }
            }
        }
        expect(seen.size).toBe(STAINED_GLASS_COLORS.length);
        expect(glass).toBeGreaterThan(lead);
        expect(lead).toBeGreaterThan(0.1 * glass);
    });

    it('crosses the window with horizontal iron bars below its arch', () => {
        const t = stainedglass.generate({ seed: 1, bars: 1, lead: { width: 0 }, frame: 0 });
        // a single bar, half way between the springing line and the bottom
        const spring = 0.8 * t.width;
        const y = Math.floor(spring + (t.height - spring) / 2);
        for (let x = 0; x < t.width; ++x) {
            expect(alpha(t, x, y)).toBe(255);
        }
        expect(alpha(t, t.width / 2, y - 3)).toBeLessThan(255);
    });

    it('gives the same window for the same seed, another one for another seed', () => {
        expect(stainedglass.generate({ seed: 4 }).data).toEqual(
            stainedglass.generate({ seed: 4 }).data,
        );
        expect(stainedglass.generate({ seed: 4 }).data).not.toEqual(
            stainedglass.generate({ seed: 5 }).data,
        );
    });
});
