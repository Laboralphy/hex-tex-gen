import { describe, expect, it } from 'vitest';
import { bookshelf, bookshelfWear, type BookshelfParams, type Texture } from '../src';

const defaults = bookshelf.defaults as BookshelfParams;
const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;

/** a new bookshelf, lit the same way whatever the books */
const render = (params: object = {}) => bookshelf.generate({ seed: 1, age: 0, ...params });

/** pixels of the bottom row of each shelf covered by a book: no book differs there */
function bookFeet(t: Texture): Set<number> {
    const empty = render({ books: { fill: 0 } });
    const feet = new Set<number>();
    for (const { y } of t.anchors.corners.filter(({ corner }) => corner === 'bottom-left')) {
        for (let x = 0; x < t.width; ++x) {
            if (t.getPixel(x, y) !== empty.getPixel(x, y)) {
                feet.add(y * t.width + x);
            }
        }
    }
    return feet;
}

describe('bookshelf', () => {
    it('fills the patch but for a transparent margin', () => {
        const t = render();
        expect(alpha(t, 0, 0)).toBe(0);
        expect(alpha(t, 1, 30)).toBe(0);
        expect(alpha(t, 63, 63)).toBe(0);
        for (let y = 2; y < 62; ++y) {
            for (let x = 2; x < 62; ++x) {
                expect(alpha(t, x, y)).toBe(255);
            }
        }
        expect(alpha(render({ margin: 0 }), 0, 0)).toBe(255);
    });

    it('reports its compartments and their corners', () => {
        const t = render();
        // 4 shelves, a 3-pixel case and 2-pixel boards inside a 2-pixel margin
        expect(t.anchors.compartments).toEqual([
            { x: 5, y: 5 },
            { x: 5, y: 19 },
            { x: 5, y: 33 },
            { x: 5, y: 47 },
        ]);
        expect(t.anchors.corners.slice(0, 2)).toEqual([
            { x: 5, y: 5, corner: 'top-left' },
            { x: 58, y: 5, corner: 'top-right' },
        ]);
        const grid = render({ columns: { count: 2 }, shelves: { count: 3 } });
        expect(grid.anchors.compartments).toHaveLength(6);
        expect(grid.anchors.corners).toHaveLength(24);
    });

    it('holds no book at fill 0, no space left at fill 1', () => {
        expect(bookFeet(render({ books: { fill: 0 } })).size).toBe(0);
        const full = bookFeet(render({ books: { fill: 1 } }));
        // 4 shelves 54 pixels wide: at most a pixel too narrow for a book left on each
        expect(full.size).toBeGreaterThanOrEqual(4 * 53);
    });

    it('only adds books as the fill rises', () => {
        const fills = [0.2, 0.5, 0.8, 1].map((fill) => bookFeet(render({ books: { fill } })));
        for (let i = 1; i < fills.length; ++i) {
            expect(fills[i].size).toBeGreaterThan(fills[i - 1].size);
            for (const pixel of fills[i - 1]) {
                expect(fills[i].has(pixel)).toBe(true);
            }
        }
    });

    it('tints the books with its colors', () => {
        const t = render({
            books: { fill: 1, colors: ['#c02020'], bands: 0, shadeVariation: 0 },
        });
        const feet = [...bookFeet(t)];
        for (const i of feet) {
            const c = t.getPixel(i % t.width, Math.floor(i / t.width));
            const [r, g, b] = [c >>> 24, (c >>> 16) & 0xff, (c >>> 8) & 0xff];
            expect(r).toBeGreaterThan(2 * Math.max(g, b));
        }
    });

    it('leans books into the gaps', () => {
        // a book leaning right covers pixels above the gap next to its foot
        const upright = render({ books: { fill: 0.4, lean: 0 } });
        const leaning = render({ books: { fill: 0.4, lean: 1 } });
        expect(leaning.data).not.toEqual(upright.data);
        expect(bookFeet(leaning)).toEqual(bookFeet(upright));
    });

    it('fades its books and gathers dust with age', () => {
        const saturation = (t: Texture) => {
            let sum = 0;
            for (const i of bookFeet(t)) {
                const c = t.getPixel(i % t.width, Math.floor(i / t.width));
                const [r, g, b] = [c >>> 24, (c >>> 16) & 0xff, (c >>> 8) & 0xff];
                sum += Math.max(r, g, b) - Math.min(r, g, b);
            }
            return sum;
        };
        const young = render({ books: { fill: 1 } });
        const faded = render({ books: { fill: 1 }, fading: 1 });
        expect(saturation(faded)).toBeLessThan(saturation(young) * 0.6);
        // dust on the first shelf board, its lit top row turned greyer
        const lum = (t: Texture) => t.getPixel(20, 17) >>> 24;
        const dusty = render({ dust: 1 });
        expect(dusty.getPixel(20, 17)).not.toBe(young.getPixel(20, 17));
        expect(lum(dusty)).toBeGreaterThan(lum(young));
    });

    it('derives its wear from age, explicit values winning', () => {
        expect(bookshelfWear({ ...defaults, age: 0 })).toEqual({
            weathering: 0,
            fading: 0,
            dust: 0,
        });
        expect(bookshelfWear({ ...defaults, age: 1 }).dust).toBeGreaterThan(0.6);
        expect(bookshelfWear({ ...defaults, age: 1, dust: 0 }).dust).toBe(0);
    });
});
