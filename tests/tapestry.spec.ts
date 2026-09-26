import { describe, expect, it } from 'vitest';
import { banner, tapestry, type TapestryParams, type Texture } from '../src';

const defaults = tapestry.defaults as TapestryParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;

/** a new tapestry, without shadow */
const render = (params: object = {}) =>
    tapestry.generate({ seed: 1, age: 0, shadow: { offset: 0 }, ...params });

/** distinct colors in a region */
function colors(t: Texture, x0: number, y0: number, x1: number, y1: number): number {
    const found = new Set<number>();
    for (let y = y0; y < y1; ++y) {
        for (let x = x0; x < x1; ++x) {
            found.add(t.getPixel(x, y) >>> 8);
        }
    }
    return found.size;
}

describe('tapestry', () => {
    it('is a banner with the defaults of a tapestry', () => {
        const t = tapestry.generate({ seed: 3 });
        const same = banner.generate({ seed: 3, ...defaults });
        expect(t.data).toEqual(same.data);
    });

    it('weaves a pattern into its field', () => {
        const plain = render({
            pattern: { kind: 'none' },
            fabric: { weave: 0 },
            folds: { count: 0 },
        });
        const lozenge = render({ fabric: { weave: 0 }, folds: { count: 0 } });
        expect(colors(plain, 10, 10, 50, 30)).toBe(1);
        expect(colors(lozenge, 10, 10, 50, 30)).toBeGreaterThan(2);
        const kinds = ['lozenge', 'checky', 'semy', 'stripes'].map(
            (kind) => render({ pattern: { kind } }).data,
        );
        for (let i = 1; i < kinds.length; ++i) {
            expect(kinds[i]).not.toEqual(kinds[i - 1]);
        }
    });

    it('scales its pattern with the patch', () => {
        // mean width of the runs of a color across the middle of the field
        const run = (t: Texture, y: number) => {
            const xs = Array.from({ length: t.width - 30 }, (_, i) => i + 15);
            const changes = xs.filter((x) => t.getPixel(x, y) >>> 8 !== t.getPixel(x - 1, y) >>> 8);
            return (changes[changes.length - 1] - changes[0]) / (changes.length - 1);
        };
        const flat = { pattern: { kind: 'stripes' }, fabric: { weave: 0 }, folds: { count: 0 } };
        const own = run(render(flat), 20);
        const large = run(render({ ...flat, width: 128, height: 80 }), 40);
        expect(large / own).toBeGreaterThan(1.8);
        expect(large / own).toBeLessThan(2.2);
    });

    it('hangs a fringe from its flat lower end', () => {
        const fringed = render();
        const bare = render({ fringe: 0 });
        // the fabric ends 3 pixels higher: threads hang every other pixel below it
        const row = (t: Texture, y: number) =>
            Array.from({ length: t.width }, (_, x) => alpha(t, x, y)).filter((a) => a === 255)
                .length;
        expect(row(fringed, 38)).toBeGreaterThan(10);
        expect(row(fringed, 38)).toBeLessThan(row(bare, 38));
        // no fringe under a shaped lower end
        expect(render({ shape: { base: 'point' } }).height).toBe(40);
    });

    it('keeps the banner unchanged: no pattern, no fringe', () => {
        const b = banner.defaults as { pattern: { kind: string }; fringe: number };
        expect(b.pattern.kind).toBe('none');
        expect(b.fringe).toBe(0);
    });
});
