import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow, type ColorRGBAStruct } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge } from '../core/age';
import { hash, hashRange, hashSeed } from '../core/hash';
import { clamp } from '../core/math';
import { createGradient, mixRGBA, sample, shade, shadeRGBA } from '../core/palette';
import {
    ageParam,
    color,
    DETAIL,
    FROM_AGE,
    LAYOUT,
    palette,
    range,
    ratio,
    size,
} from '../core/schema';
import { Texture, type AnchorPoint } from '../core/Texture';
import { splitSpan } from './common/grid';
import { WOOD_PALETTE } from './common/palettes';
import { weatherWood } from './common/wood';
import { WoodGrain } from './common/WoodGrain';
import { defineGenerator } from './define';

/**
 * Parameters of the bookshelf template. The patch is the whole bookcase, inside a
 * transparent margin.
 */
export const bookshelfSchema = z.strictObject({
    size: size().default([64, 64]).describe('own size of the bookcase, margin included'),
    margin: z
        .number()
        .int()
        .min(0)
        .default(2)
        .describe('transparent margin around the bookcase, showing the wall below, in pixels')
        .meta(DETAIL),
    frame: z
        .number()
        .int()
        .min(1)
        .default(3)
        .describe('width of the case: its sides, top and bottom, in pixels')
        .meta(DETAIL),
    shelves: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(1)
                .default(4)
                .describe('shelves from top to bottom')
                .meta(LAYOUT),
            thickness: z
                .number()
                .int()
                .min(1)
                .default(2)
                .describe('thickness of the shelf boards, in pixels')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('shelves, separated by boards'),
    columns: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(1)
                .default(1)
                .describe('compartments side by side, separated by partitions')
                .meta(LAYOUT),
            thickness: z
                .number()
                .int()
                .min(1)
                .default(2)
                .describe('thickness of the partitions, in pixels')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('vertical partitions'),
    wood: z
        .strictObject({
            palette: palette()
                .default(WOOD_PALETTE)
                .describe('wood colors, from darkest to lightest'),
            back: ratio().default(0.4).describe('brightness of the back panel, in [0, 1]'),
            grain: ratio()
                .default(0.05)
                .describe('random brightness variation between pixels, in [0, 1]')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('wood of the case, its edges lit from the top-left'),
    books: z
        .strictObject({
            fill: ratio()
                .default(0.85)
                .describe(
                    'share of the shelves filled with books, in [0, 1]: 0 for none, 1 for no space left; raising it only adds books',
                ),
            colors: z
                .array(color())
                .min(1)
                .default([
                    '#6b1f1a',
                    '#2c4a28',
                    '#23335a',
                    '#5a3818',
                    '#7a6526',
                    '#40222e',
                    '#1c1a18',
                    '#6e4a36',
                ])
                .describe('tints of the books, picked at random'),
            width: range(z.number().positive())
                .default([2, 4])
                .describe('[min, max] thickness of a book spine')
                .meta(LAYOUT),
            height: range(ratio())
                .default([0.6, 0.95])
                .describe('[min, max] height of a book, as a share of the shelf height'),
            shadeVariation: ratio()
                .default(0.2)
                .describe('random brightness variation between books, in [0, 1]'),
            bands: ratio()
                .default(0.35)
                .describe('ratio of books with gilt bands across their spine, in [0, 1]'),
            bandColor: color().default('#a8843c').describe('color of the gilt bands'),
            lean: ratio()
                .default(0.6)
                .describe('chance of a book standing next to a gap to lean into it, in [0, 1]'),
        })
        .prefault({})
        .describe('books standing on the shelves, their spines lit from the left'),
    age: ageParam(),
    weathering: ratio().optional().describe(`wood turned silver-grey, in [0, 1];${FROM_AGE}`),
    fading: ratio().optional().describe(`book colors faded towards grey, in [0, 1];${FROM_AGE}`),
    dust: ratio()
        .optional()
        .describe(`dust on the shelves and the tops of the books, in [0, 1];${FROM_AGE}`),
});

export type BookshelfParams = z.output<typeof bookshelfSchema>;

/**
 * Wear values of a bookshelf, every one resolved.
 */
export type BookshelfWear = { weathering: number; fading: number; dust: number };

/**
 * Resolves the wear values of a bookshelf: values set in the parameters win, the others
 * are derived from `age`.
 */
export function bookshelfWear(p: BookshelfParams): BookshelfWear {
    const a = p.age;
    return {
        weathering: p.weathering ?? atAge(a, [0, 0.05, 0.45]),
        fading: p.fading ?? atAge(a, [0, 0.15, 0.6]),
        dust: p.dust ?? atAge(a, [0, 0.15, 0.7]),
    };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_GRAIN = 2;
const SALT_BOOK = 3;
const SALT_RANK = 4;
const SALT_LEAN = 5;

/** color dust turns surfaces to */
const DUST = Rainbow.convertToRGBA(Rainbow.parse('#8c857a'));

/** weight of the neighbourhood in the rank of a book: books go missing in runs */
const RUN = 0.65;

/** a compartment: its inside, [x0, x1) × [y0, y1), and its place in the grid */
type Compartment = { r: number; c: number; x0: number; x1: number; y0: number; y1: number };

/** a book on a shelf: its spine, [x, x + w) × [y1 - h, y1) when upright */
type Book = {
    compartment: Compartment;
    k: number;
    x: number;
    w: number;
    h: number;
    rank: number;
    /** pixels its top is shifted to the right, leaning into a gap */
    lean: number;
};

/**
 * A wooden bookcase filled with books of every tint: shelves, a shadowed back panel, and
 * books standing, some leaning into the gaps. With age, the wood weathers, the books fade
 * and dust settles. The margin around it is transparent.
 */
export const bookshelf = defineGenerator({
    name: 'bookshelf',
    description: 'Wooden bookcase filled with books of every tint, from empty to packed',
    category: 'civilized',
    schema: bookshelfSchema,
    overlay: true,
    anchors: {
        compartments: 'top-left corner of the inside of each compartment, row by row',
        corners:
            'corners of the inside of each compartment, as corner points: top-left, top-right, bottom-left, bottom-right',
        center: 'center of the bookcase',
    },
    render(p, { width, height, seed }) {
        const wear = bookshelfWear(p);
        const m = p.margin;
        const sx = width / p.size[0];
        const shift = ([a, b]: [number, number]): [number, number] => [a + m, b + m];
        const columns = splitSpan(width - 2 * m, p.frame, p.columns.thickness, p.columns.count).map(
            shift,
        );
        const rows = splitSpan(height - 2 * m, p.frame, p.shelves.thickness, p.shelves.count).map(
            shift,
        );
        const compartments: Compartment[] = rows.flatMap(([y0, y1], r) =>
            columns.map(([x0, x1], c) => ({ r, c, x0, x1, y0, y1 })),
        );
        const inCase = (x: number, y: number) =>
            x >= m && y >= m && x < width - m && y < height - m;
        // compartment index of each pixel, -1 on the case or in the margin
        const compartmentOf = new Int32Array(width * height).fill(-1);
        compartments.forEach(({ x0, x1, y0, y1 }, id) => {
            for (let y = y0; y < y1; ++y) {
                for (let x = x0; x < x1; ++x) {
                    compartmentOf[y * width + x] = id;
                }
            }
        });
        const inside = (x: number, y: number) => inCase(x, y) && compartmentOf[y * width + x] >= 0;

        const texture = new Texture(width, height);
        const wood = createGradient(p.wood.palette);
        const woodGrain = new WoodGrain(hashSeed(seed, SALT_NOISE, 0), width, height);
        const pixelGrain = (x: number, y: number, amount: number) =>
            1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * amount;
        const put = (x: number, y: number, rgba: ColorRGBAStruct) =>
            texture.setPixel(x, y, Rainbow.fromRGBA({ ...rgba, a: 1 }));
        const woodColor = (x: number, y: number, tone: number, brightness: number) => {
            const rgba = Rainbow.convertToRGBA(
                shade(sample(wood, tone), brightness * pixelGrain(x, y, p.wood.grain)),
            );
            return wear.weathering > 0 ? weatherWood(rgba, wear.weathering) : rgba;
        };
        const isBoard = (y: number) =>
            y < rows[0][0] ||
            y >= rows[rows.length - 1][1] ||
            rows.some(([, end], i) => i + 1 < rows.length && y >= end && y < rows[i + 1][0]);

        // the case: sides and partitions running down, boards across; dust on the boards
        for (let y = m; y < height - m; ++y) {
            for (let x = m; x < width - m; ++x) {
                if (inside(x, y)) {
                    continue;
                }
                const side = x < columns[0][0] || x >= columns[columns.length - 1][1];
                const horizontal = !side && isBoard(y);
                let tone = woodGrain.tone(x, y, horizontal);
                const top = y === m || inside(x, y - 1);
                if (top || x === m || inside(x - 1, y)) {
                    tone += 0.2;
                } else if (y === height - m - 1 || x === width - m - 1 || inside(x + 1, y)) {
                    tone -= 0.25;
                } else if (inside(x, y + 1)) {
                    tone -= 0.3;
                }
                let rgba = woodColor(x, y, tone, 1);
                if (top && inside(x, y - 1)) {
                    rgba = mixRGBA(rgba, DUST, wear.dust);
                }
                put(x, y, rgba);
            }
        }

        // the back panel, in the shadow of the boards above and the side on the left
        for (const { x0, y0, x1, y1 } of compartments) {
            for (let y = y0; y < y1; ++y) {
                for (let x = x0; x < x1; ++x) {
                    const below = clamp((y - y0) / 4);
                    const right = clamp((x - x0) / 3);
                    const light = p.wood.back * (0.5 + 0.5 * below) * (0.75 + 0.25 * right);
                    put(x, y, woodColor(x, y, woodGrain.tone(x, y, false) - 0.1, light));
                }
            }
        }

        // books, every one with a rank: the lowest ranks stand on the shelves, and
        // neighbours have close ranks, so that books go missing in runs
        const runs = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 1),
            period: [4, Math.max(1, rows.length)],
            octaves: 2,
        });
        const books: Book[] = [];
        for (const compartment of compartments) {
            const { r, c, x0, x1, y0, y1 } = compartment;
            const [minWidth, maxWidth] = p.books.width;
            for (let x = x0, k = 0; x < x1; ++k) {
                let w = Math.max(
                    1,
                    Math.round(hashRange(minWidth, maxWidth, seed, SALT_BOOK, r, c, k, 0) * sx),
                );
                if (x + w > x1) {
                    if (x1 - x < Math.max(1, Math.round(minWidth * sx))) {
                        break;
                    }
                    w = x1 - x;
                }
                const [minHeight, maxHeight] = p.books.height;
                const h = Math.max(
                    2,
                    Math.round(
                        hashRange(minHeight, maxHeight, seed, SALT_BOOK, r, c, k, 1) * (y1 - y0),
                    ),
                );
                const run = runs.sample((x + w / 2) / width, (r + 0.5) / rows.length);
                const rank = RUN * run + (1 - RUN) * hash(seed, SALT_RANK, r, c, k);
                books.push({ compartment, k, x, w, h, rank, lean: 0 });
                x += w;
            }
        }
        const standing = new Set(
            [...books]
                .sort((a, b) => a.rank - b.rank)
                .slice(0, Math.round(p.books.fill * books.length)),
        );
        const shelved = books.filter((book) => standing.has(book));

        // a book with room on its right leans into it, resting on the next book or side
        shelved.forEach((book, i) => {
            const next = shelved[i + 1];
            const end =
                next && next.compartment === book.compartment ? next.x : book.compartment.x1;
            const gap = end - (book.x + book.w);
            const { r, c } = book.compartment;
            if (gap >= 2 && hash(seed, SALT_LEAN, r, c, book.k) < p.books.lean) {
                book.lean = Math.min(gap - 1, Math.round(book.h * 0.45));
            }
        });

        const tints = p.books.colors.map((css) => Rainbow.convertToRGBA(Rainbow.parse(css)));
        const band = Rainbow.convertToRGBA(Rainbow.parse(p.books.bandColor));
        for (const { compartment, k, x, w, h, lean } of shelved) {
            const { r, c, y1 } = compartment;
            const tint = tints[Math.floor(hash(seed, SALT_BOOK, r, c, k, 2) * tints.length)];
            const brightness =
                1 + (hash(seed, SALT_BOOK, r, c, k, 3) - 0.5) * 2 * p.books.shadeVariation;
            const banded = hash(seed, SALT_BOOK, r, c, k, 4) < p.books.bands;
            // gilt bands near the top and the bottom of the spine
            const bands = banded
                ? h >= 8
                    ? [Math.round(h * 0.18), h - 1 - Math.round(h * 0.18)]
                    : [Math.round(h * 0.25)]
                : [];
            // faded: lighter and greyer
            const faded = (rgba: ColorRGBAStruct) => {
                const l = 0.3 * rgba.r + 0.59 * rgba.g + 0.11 * rgba.b;
                const grey = { r: l + 0.12, g: l + 0.12, b: l + 0.1, a: rgba.a };
                return mixRGBA(rgba, grey, wear.fading * 0.7);
            };
            for (let t = 0; t < h; ++t) {
                // t rows from the top of the book; a leaning book is sheared
                const y = y1 - h + t;
                const offset = h > 1 ? Math.round((lean * (h - 1 - t)) / (h - 1)) : 0;
                for (let i = 0; i < w; ++i) {
                    let rgba = bands.includes(t) ? band : tint;
                    let f = brightness;
                    if (w > 1) {
                        f *= i === 0 ? 1.3 : i === w - 1 ? 0.65 : 1;
                    }
                    if (t === 0) {
                        f *= 0.8;
                    }
                    rgba = shadeRGBA(rgba, f * pixelGrain(x + i, y, 0.06));
                    rgba = faded(rgba);
                    if (t === 0) {
                        rgba = mixRGBA(rgba, DUST, wear.dust);
                    }
                    put(x + i + offset, y, rgba);
                }
            }
        }

        texture.anchors = {
            compartments: compartments.map(({ x0, y0 }) => ({ x: x0, y: y0 })),
            corners: compartments.flatMap(({ x0, x1, y0, y1 }): AnchorPoint[] => [
                { x: x0, y: y0, corner: 'top-left' },
                { x: x1 - 1, y: y0, corner: 'top-right' },
                { x: x0, y: y1 - 1, corner: 'bottom-left' },
                { x: x1 - 1, y: y1 - 1, corner: 'bottom-right' },
            ]),
            center: [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }],
        };
        return texture;
    },
});
